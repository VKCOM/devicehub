/**
 * The device as the bridge reaches it: through the provider's adb server, with
 * one smart-socket connection per request. That server may run on another
 * machine than this worker (--adb-host, the `adbd` container of
 * docker-compose-prod), so nothing here assumes a local adb or a local device.
 */

import {AdbFailError, type Client} from '@u4/adbkit'
import {protocolString, type OpenService, type ServiceTransport} from './service.ts'

/**
 * Connections kept switched to the device (`host:transport:<serial>`
 * answered), so that a stream open costs one round trip to the adb server
 * instead of three: TCP connect, the transport switch, the service. A switch
 * must be its own request — the server drops whatever follows it in the same
 * read (smart_socket_enqueue, sockets.cpp:866-869) — so it cannot be
 * pipelined with the service instead. Measured on a local server it saves
 * about a fifth of an open; with the server on another machine, a round trip.
 */
const POOL_SIZE = 2

/** The properties adbd puts in its banner (get_connection_string, adb.cpp:298-302) */
const IDENTITY = ['ro.product.name', 'ro.product.model', 'ro.product.device']

/** adbkit's connection to the adb server, as much of it as we use */
interface AdbConnection {
    write(chunk: Buffer): unknown
    end(): unknown
    socket: ServiceTransport
    parser: {
        readCode(...codes: string[]): Promise<string>
        readValue(encoding: 'utf8'): Promise<string>
    }
}

export interface Provider {
    openService: OpenService
    /** Close the connections kept for the next opens; the next open starts over. */
    release(): void
    /** System identity for our A_CNXN, e.g. `device::ro.product.name=...;` */
    banner(): Promise<string>
    /**
     * The device's adbd features, as the provider's adb server knows them from
     * the device's own banner; empty when the server cannot tell.
     */
    features(): Promise<string[]>
}

export function createProvider(adb: Client, serial: string): Provider {
    const pool = new TransportPool(async() => await adb.getDevice(serial).transport() as unknown as AdbConnection)

    const request = async(transport: AdbConnection, name: string) => {
        try {
            transport.write(protocolString(name))
            await transport.parser.readCode('OKAY')
        }
        catch (err) {
            // Not end(): the server closes after its FAIL, and a socket nobody
            // reads to its end keeps its fd — one per refused open, which a
            // client polling a forwarded port makes every second
            transport.socket.destroy()
            throw err
        }
        return transport.socket
    }

    // A client's A_OPEN, relayed to the provider's adb server. Rejects when
    // the server refuses it, which the bridge answers with A_CLSE
    const openService: OpenService = async name => {
        const {connection, pooled} = await pool.take()
        try {
            return await request(connection, name)
        }
        catch (err) {
            // A kept connection the server closed under us (the device went
            // away and came back) fails without a FAIL; that is not the
            // device's answer, so ask once more on a fresh one
            if (!pooled || err instanceof AdbFailError) {
                throw err
            }
            return await request(await pool.fresh(), name)
        }
    }

    // The identity adbd sends in its A_CNXN, in the form adbkit's bridge used
    const banner = async() => {
        const properties = await adb.getDevice(serial).getProperties()
        const identity = IDENTITY.map(prop => `${prop}=${properties[prop]};`).join('')
        return `device::${identity}`
    }

    // `host-serial:<serial>:features` answers the transport's feature set,
    // which is the device's banner list (adb.cpp:1416-1427). Servers older
    // than the request (adb 1.0.32) answer FAIL, and the client then gets the
    // legacy protocols, as it would from that device directly.
    const features = async() => {
        let connection: AdbConnection | undefined
        try {
            connection = await adb.connection() as unknown as AdbConnection
            connection.write(protocolString(`host-serial:${serial}:features`))
            await connection.parser.readCode('OKAY')
            const value = await connection.parser.readValue('utf8')
            return value.split(',').map(feature => feature.trim()).filter(Boolean)
        }
        catch {
            return []
        }
        finally {
            connection?.socket.destroy()
        }
    }

    return {openService, banner, features, release: () => pool.release()}
}

/** See POOL_SIZE. Filled on demand, after each take, so an idle bridge holds nothing new. */
class TransportPool {
    private idle: Array<{connection: AdbConnection, forget(): void}> = []
    private filling = 0
    /** Bumped by release(), so a switch finishing afterwards is not kept */
    private generation = 0

    constructor(readonly fresh: () => Promise<AdbConnection>) {}

    async take(): Promise<{connection: AdbConnection, pooled: boolean}> {
        const entry = this.idle.shift()
        this.fill()
        if (entry) {
            entry.forget()
            return {connection: entry.connection, pooled: true}
        }
        return {connection: await this.fresh(), pooled: false}
    }

    release(): void {
        this.generation++
        for (const entry of this.idle.splice(0)) {
            entry.connection.socket.destroy()
        }
    }

    private fill(): void {
        const generation = this.generation
        while (this.idle.length + this.filling < POOL_SIZE) {
            this.filling++
            this.fresh().then(connection => {
                this.filling--
                if (generation !== this.generation) {
                    connection.socket.destroy()
                    return
                }
                const socket = connection.socket as ServiceTransport & {
                    read(size: 0): unknown
                    off(event: string, listener: (...args: unknown[]) => void): unknown
                }
                const entry = {
                    connection,
                    forget: () => {
                        socket.off('readable', watch)
                        socket.off('close', drop)
                        socket.off('error', drop)
                    }
                }
                // The server closes it when the device goes, and it must not be
                // handed out then. Nothing reads an idle connection, so its EOF
                // would never surface as 'end' and 'close' on its own: read(0)
                // consumes nothing but completes the end once the FIN is in.
                const watch = () => socket.read(0)
                const drop = () => {
                    const index = this.idle.indexOf(entry)
                    if (index !== -1) {
                        this.idle.splice(index, 1)
                    }
                    socket.destroy()
                }
                socket.on('readable', watch)
                socket.on('close', drop)
                // An error with no listener would be an uncaught exception
                socket.on('error', drop)
                this.idle.push(entry)
            }, () => {
                // The device is not there; the next take tries again
                this.filling--
            })
        }
    }
}
