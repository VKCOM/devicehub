/**
 * One `adb connect` client of the device: we play adbd for it.
 *
 * Replaces adbkit's tcpusb Socket (dist/adb/tcpusb/socket.js). The handshake
 * and authentication follow it packet for packet, so clients see no difference;
 * what changed is that every A_OPEN is served by our own code (session.ts,
 * service.ts) instead of being intercepted on adbkit's private packet reader.
 *
 *   client                          we
 *   A_CNXN(version, maxdata)   ->
 *                              <-   A_AUTH(TOKEN, token)
 *   A_AUTH(SIGNATURE, sig)     ->
 *                              <-   A_AUTH(TOKEN, token)       signature kept
 *   A_AUTH(RSAPUBLICKEY, key)  ->                              verified, allow-listed
 *                              <-   A_CNXN(version, maxdata, banner)
 *   A_OPEN / A_OKAY / A_WRTE / A_CLSE ...
 */

import {EventEmitter} from 'node:events'
import {randomBytes} from 'node:crypto'
import {Utils} from '@u4/adbkit'
import {
    checksum, header,
    A_AUTH, A_CLSE, A_CNXN, A_OKAY, A_OPEN, A_SYNC, A_VERSION_SKIP_CHECKSUM, A_WRTE,
    type Packet
} from './packet.ts'
import {isReverseOpen, ReverseSession, type OpenReverse} from './reverse/session.ts'
import {serveOpen, type OpenService} from './service.ts'
import {PacketParser} from './packetParser.ts'
import {advertisedFeatures, FEATURE_DELAYED_ACK} from './features.ts'

const AUTH_TOKEN = 1
const AUTH_SIGNATURE = 2
const AUTH_RSAPUBLICKEY = 3
const TOKEN_LENGTH = 20
/**
 * The largest payload we accept and send: AOSP's MAX_PAYLOAD (adb.h), what a
 * current adbd advertises. Every A_WRTE costs the sender a round trip before the
 * next may go, so the packet size is what bounds a stream's throughput.
 */
const MAX_PAYLOAD = 1024 * 1024
const UINT32_MAX = 0xffffffff

/**
 * TCP keepalive idle time: a client gone without a FIN (NAT timeout, laptop
 * lid, Wi-Fi switch) is found and dropped instead of holding its streams, and
 * the provider connections behind them, for good.
 */
const KEEPALIVE_MS = 30_000

/**
 * How much may wait in our buffer for the client before streams stop sending
 * to it. Without delayed ack every stream has at most one packet out, but
 * with it each may have a whole grant (32 MiB from a current adb), and a
 * device faster than the client's link would park all of it here.
 */
const CONGESTION_BYTES = 4 * 1024 * 1024

/**
 * How long a client may keep its side open after we closed ours. adb closes at
 * once; one that does not would hold the server's close(), which waits for
 * every socket, and with it the release of the device.
 */
const CLOSE_TIMEOUT_MS = 5_000

/** An ADB public key, as adbkit's Utils.parsePublicKey returns it (a node-forge RSA key). */
export interface AdbPublicKey {
    /** MD5 of the key struct, the form user keys are stored in */
    fingerprint: string
    comment: string
    verify(digest: string, signature: string): boolean
}

export interface BridgeOptions {
    /** Decide on a key whose signature checked out; throw to refuse it. */
    auth(key: AdbPublicKey): Promise<void> | void
    /** System identity for our A_CNXN, e.g. `device::ro.product.name=...;` */
    banner(): Promise<string>
    /** The device's own adbd features; we advertise what of them we carry */
    features?(): Promise<string[]>
    openService: OpenService
    openReverse: OpenReverse
}

/** The client's TCP socket, as much of it as we use. */
export interface BridgeStream {
    remoteAddress?: string
    /** Bytes written but not yet handed to the kernel */
    readonly writableLength: number
    setNoDelay?(noDelay?: boolean): unknown
    setKeepAlive?(enable?: boolean, initialDelay?: number): unknown
    write(chunk: Buffer): boolean
    /** Gather the writes until uncork into one writev */
    cork(): void
    uncork(): void
    end(): unknown
    destroy(): unknown
    on(event: 'data', listener: (chunk: Buffer) => void): unknown
    on(event: 'end' | 'close' | 'drain', listener: () => void): unknown
    on(event: 'error', listener: (err: Error) => void): unknown
}

/** A stream we serve on this connection, addressed by our local id. */
interface Service {
    handle(packet: Packet): void
    end(): void
}

/** Open streams by local id; the client addresses them by that id in arg1. */
class ServiceMap {
    private services = new Map<number, Service>()
    private last = 0

    get count(): number {
        return this.services.size
    }

    /** A fresh non-zero id: 0 is the protocol's "no stream" in A_CLSE. */
    nextId(): number {
        do {
            this.last = this.last >= UINT32_MAX ? 1 : this.last + 1
        } while (this.services.has(this.last))
        return this.last
    }

    insert(id: number, service: Service): void {
        if (this.services.has(id)) {
            throw new Error(`Local id ${id} is already in use`)
        }
        this.services.set(id, service)
    }

    get(id: number): Service | undefined {
        return this.services.get(id)
    }

    remove(id: number): void {
        this.services.delete(id)
    }

    /** End every stream; each one writes its own A_CLSE. */
    end(): void {
        const services = [...this.services.values()]
        this.services.clear()
        for (const service of services) {
            service.end()
        }
    }
}

export class BridgeConnection extends EventEmitter {
    readonly remoteAddress?: string
    /** Negotiated in A_CNXN; caps every A_WRTE we send */
    maxPayload = 4096
    /**
     * True when the client listed delayed_ack in its A_CNXN; we always list it.
     * AOSP uses a feature only when both banners have it (transport.cpp:1263-1271);
     * a current adb lists it only under ADB_BURST_MODE=1 (transport.cpp:1229-1236).
     */
    delayedAck = false
    authorized = false
    ended = false
    readonly services = new ServiceMap()
    /**
     * Allocates our local stream ids. The name is what the reverse streams
     * expect (ReverseHostSocket), inherited from adbkit's Socket.
     */
    readonly remoteId = {next: () => this.services.nextId()}
    /** `reverse:` forwards bound by this client */
    readonly reverse: ReverseSession

    private parser = new PacketParser()
    private version = 1
    private token?: Buffer
    private signature?: Buffer
    private syncToken = 1
    /** AUTH is answered asynchronously; this keeps those answers in order. */
    private authQueue = Promise.resolve()
    private closeTimer?: NodeJS.Timeout
    /** Streams waiting for the client to catch up (see congested) */
    private drained: Array<() => void> = []

    constructor(private stream: BridgeStream, private options: BridgeOptions) {
        super()
        this.remoteAddress = stream.remoteAddress
        this.reverse = new ReverseSession(this, options.openReverse)
        stream.setNoDelay?.(true)
        stream.setKeepAlive?.(true, KEEPALIVE_MS)
        stream.on('data', chunk => this.receive(chunk))
        stream.on('end', () => this.end())
        stream.on('close', () => {
            clearTimeout(this.closeTimer)
            this.end()
        })
        stream.on('error', err => this.end(err))
        stream.on('drain', () => {
            for (const callback of this.drained.splice(0)) {
                callback()
            }
        })
    }

    /** True while more than CONGESTION_BYTES wait in our buffer for the client */
    get congested(): boolean {
        return this.stream.writableLength > CONGESTION_BYTES
    }

    /** Call back once the client has taken everything we queued for it. */
    whenDrained(callback: () => void): void {
        if (!this.ended) {
            this.drained.push(callback)
        }
    }

    /**
     * Queue one packet for the client.
     *
     * The payload is not copied into the packet: header and payload go out as
     * one writev. Clients at A_VERSION_SKIP_CHECKSUM or later (every adb since
     * 2017) get no checksum, which would otherwise be a JS loop over every byte
     * sent — about 50 µs per 64 KiB packet.
     */
    send(command: number, arg0: number, arg1: number, data?: Buffer): void {
        if (this.ended) {
            return
        }
        const length = data ? data.length : 0
        const check = length && this.version < A_VERSION_SKIP_CHECKSUM ? checksum(data) : 0
        const head = header(command, arg0, arg1, length, check)
        if (!length) {
            this.stream.write(head)
            return
        }
        this.stream.cork()
        this.stream.write(head)
        this.stream.write(data!)
        this.stream.uncork()
    }

    /**
     * Close the connection and every stream on it. Emits 'end' once, with the
     * reason when it was an error rather than either side hanging up.
     */
    end(reason?: unknown): void {
        if (this.ended) {
            return
        }
        // Streams go first so their A_CLSE still reach the client
        this.reverse.end()
        this.services.end()
        this.ended = true
        this.drained = []
        this.stream.end()
        this.closeTimer = setTimeout(() => this.stream.destroy(), CLOSE_TIMEOUT_MS)
        // Never what keeps the process alive
        this.closeTimer.unref()
        this.emit('end', reason)
    }

    private receive(chunk: Buffer): void {
        if (this.ended) {
            return
        }

        let packets: Packet[]
        try {
            packets = this.parser.push(chunk)
        }
        catch (err) {
            this.end(err)
            return
        }

        for (const packet of packets) {
            if (this.ended) {
                return
            }
            try {
                this.handle(packet)
            }
            catch (err) {
                this.end(err)
            }
        }
    }

    private handle(packet: Packet): void {
        // The device keeps its group alive on this
        this.emit('userActivity', packet)

        switch (packet.command) {
        case A_CNXN:
            this.connect(packet)
            return
        case A_AUTH:
            this.authQueue = this.authQueue
                .then(() => this.authenticate(packet))
                .catch(err => this.end(err))
            return
        case A_SYNC:
            // Obsolete; answered as adbkit did
            this.send(A_SYNC, 1, this.nextSyncToken())
            return
        case A_OPEN:
            this.requireAuthorized()
            // arg1 is the opener's send window, set exactly when delayed ack is
            // on; adbd refuses an open that disagrees (adb.cpp:506-511)
            if (this.delayedAck !== (packet.arg1 !== 0)) {
                this.send(A_CLSE, 0, packet.arg0)
                return
            }
            if (isReverseOpen(packet)) {
                void this.reverse.serve(packet).catch(err => this.end(err))
            }
            else {
                serveOpen(this, packet, this.options.openService)
            }
            return
        case A_OKAY:
        case A_WRTE:
        case A_CLSE:
            this.requireAuthorized()
            // A stream that already closed may still get packets in flight
            this.services.get(packet.arg1)?.handle(packet)
            return
        default:
            throw new Error(`Unknown command 0x${packet.command.toString(16)}`)
        }
    }

    private requireAuthorized(): void {
        if (!this.authorized) {
            throw new Error('Unauthorized access')
        }
    }

    private connect(packet: Packet): void {
        this.version = packet.arg0
        this.maxPayload = Math.min(MAX_PAYLOAD, packet.arg1)
        this.delayedAck = bannerFeatures(packet.data).includes(FEATURE_DELAYED_ACK)
        // A new handshake: a signature of the previous token proves nothing
        this.token = randomBytes(TOKEN_LENGTH)
        this.signature = undefined
        this.send(A_AUTH, AUTH_TOKEN, 0, this.token)
    }

    private async authenticate(packet: Packet): Promise<void> {
        if (this.ended) {
            return
        }
        if (!this.token) {
            throw new Error('AUTH before CNXN')
        }

        switch (packet.arg0) {
        case AUTH_SIGNATURE:
            // The client signs with each of its keys in turn and sends the
            // public key last; keep the first signature, as adbkit does
            this.signature ??= packet.data
            this.send(A_AUTH, AUTH_TOKEN, 0, this.token)
            return
        case AUTH_RSAPUBLICKEY: {
            if (!this.signature) {
                throw new Error('Public key sent before signature')
            }
            if (!packet.data || packet.data.length < 2) {
                throw new Error('Empty RSA public key')
            }
            const key = await Utils.parsePublicKey(stripNulls(packet.data)) as unknown as AdbPublicKey
            if (!verify(key, this.token, this.signature)) {
                throw new Error('Signature mismatch')
            }
            await this.options.auth(key)
            const [banner, device] = await Promise.all([this.options.banner(), this.options.features?.() ?? []])
            if (this.ended) {
                return
            }
            this.authorized = true
            // As adbd builds it (get_connection_string, adb.cpp:295-316): no
            // trailing NUL, which a peer would read as part of the last value
            this.send(A_CNXN, this.version, this.maxPayload,
                Buffer.from(`${banner}features=${advertisedFeatures(device).join(',')}`))
            return
        }
        default:
            throw new Error(`Unknown authentication method ${packet.arg0}`)
        }
    }

    private nextSyncToken(): number {
        this.syncToken = this.syncToken >= UINT32_MAX ? 2 : this.syncToken + 1
        return this.syncToken
    }
}

/**
 * The feature list of a peer's A_CNXN banner, `<type>::<key>=<value>;...`, as
 * parse_banner reads it (adb.cpp:351-383): `host::features=shell_v2,cmd,...`.
 */
export function bannerFeatures(data?: Buffer): string[] {
    if (!data) {
        return []
    }
    const banner = stripNulls(data)
    const separator = banner.indexOf('::')
    if (separator === -1) {
        return []
    }
    for (const property of banner.slice(separator + 2).split(';')) {
        if (property.startsWith('features=')) {
            return property.slice('features='.length).split(',').filter(Boolean)
        }
    }
    return []
}

/** The key is sent as a NUL-terminated string. */
function stripNulls(data: Buffer): string {
    let end = data.length
    while (end > 0 && data[end - 1] === 0) {
        end--
    }
    return data.toString('utf8', 0, end)
}

/** The client signs the raw token as if it were a SHA-1 digest (RSA_sign(NID_sha1)). */
function verify(key: AdbPublicKey, token: Buffer, signature: Buffer): boolean {
    try {
        return key.verify(token.toString('binary'), signature.toString('binary'))
    }
    catch {
        // node-forge throws on a signature of the wrong length
        return false
    }
}
