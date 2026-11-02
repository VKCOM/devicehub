/**
 * The user's side of `adb connect`, for driving a BridgeConnection the way a
 * real adb client does: same packets, same RSA key format, same signature.
 */

import {Duplex} from 'node:stream'
import {generateKeyPairSync, privateEncrypt, constants, type KeyObject} from 'node:crypto'
import {vi, expect} from 'vitest'
// Oracle: adbkit's own packet encoder and key parser. The bare '@u4/adbkit'
// import must stay first to break the dist import cycle; see packet.test.ts.
import {Utils} from '@u4/adbkit'
import AdbkitPacket from '../../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import {PacketParser} from '../../../../../lib/units/device/plugins/adb-bridge/packetParser.ts'
import type {Packet} from '../../../../../lib/units/device/plugins/adb-bridge/reverse/stream.ts'

export const {A_CNXN, A_AUTH, A_OPEN, A_OKAY, A_WRTE, A_CLSE, A_SYNC} = AdbkitPacket
export const AUTH_TOKEN = 1
export const AUTH_SIGNATURE = 2
export const AUTH_RSAPUBLICKEY = 3
/** A_VERSION as current adb clients send it */
export const CLIENT_VERSION = 0x01000001
export const CLIENT_MAXDATA = 1024 * 1024

/** The client's TCP socket: what it sends is `send`, what we wrote is `received()`. */
export class ClientStream extends Duplex {
    remoteAddress = '127.0.0.1'
    writes: Buffer[] = []
    /** True once the bridge ended its side */
    finished = false
    keepAlive?: [boolean | undefined, number | undefined]
    setNoDelay() {}
    setKeepAlive(enable?: boolean, initialDelay?: number) {
        this.keepAlive = [enable, initialDelay]
    }
    _read() {}
    _write(bytes: Buffer, _encoding: string, callback: () => void) {
        this.writes.push(Buffer.from(bytes))
        callback()
    }
    _final(callback: () => void) {
        this.finished = true
        callback()
    }
    send(command: number, arg0: number, arg1: number, data?: Buffer | string) {
        this.push(AdbkitPacket.assemble(command, arg0, arg1, typeof data === 'string' ? Buffer.from(data) : data))
    }
    received(): Packet[] {
        return new PacketParser().push(Buffer.concat(this.writes))
    }
}

export interface ClientKey {
    privateKey: KeyObject
    /** As adb sends it: base64 RSAPublicKey struct, comment, NUL */
    publicKey: string
    fingerprint: string
}

export async function makeKey(comment = 'test@devicehub'): Promise<ClientKey> {
    const pair = generateKeyPairSync('rsa', {modulusLength: 2048})
    const modulus = Buffer.from(pair.publicKey.export({format: 'jwk'}).n!, 'base64url')
    // adbkit only reads len, the modulus and the exponent; n0inv and rr stay zero
    const struct = Buffer.alloc(524)
    struct.writeUInt32LE(64)
    Buffer.from(modulus).reverse().copy(struct, 8)
    struct.writeUInt32LE(65537, 520)
    const publicKey = `${struct.toString('base64')} ${comment}\0`
    const {fingerprint} = await Utils.parsePublicKey(publicKey.slice(0, -1))
    return {privateKey: pair.privateKey, publicKey, fingerprint}
}

/** What adb does with the token: RSA_sign(NID_sha1, token), i.e. a SHA-1 DigestInfo around it. */
export function sign(key: ClientKey, token: Buffer): Buffer {
    const digestInfo = Buffer.concat([Buffer.from('3021300906052b0e03021a05000414', 'hex'), token])
    return privateEncrypt({key: key.privateKey, padding: constants.RSA_PKCS1_PADDING}, digestInfo)
}

/** The tokens the bridge has challenged us with so far. */
export function tokens(stream: ClientStream): Buffer[] {
    return stream.received()
        .filter(p => p.command === A_AUTH && p.arg0 === AUTH_TOKEN)
        .map(p => p.data!)
}

/**
 * The client's half of the handshake, up to sending the public key. Pass
 * `validSignature: false` to sign something other than the token, or `keyString`
 * to send a public key that is not the one we signed with; `banner` is the
 * client's own A_CNXN banner (a current adb sends `host::features=...`).
 */
export async function handshake(stream: ClientStream, key: ClientKey,
    {validSignature = true, keyString = key.publicKey, version = CLIENT_VERSION, banner = 'host::\0'} = {}): Promise<void> {
    stream.send(A_CNXN, version, CLIENT_MAXDATA, banner)
    await vi.waitFor(() => expect(tokens(stream)).toHaveLength(1))
    const token = Buffer.from(tokens(stream)[0])
    if (!validSignature) {
        token[0] ^= 1
    }
    stream.send(A_AUTH, AUTH_SIGNATURE, 0, sign(key, token))
    await vi.waitFor(() => expect(tokens(stream)).toHaveLength(2))
    stream.send(A_AUTH, AUTH_RSAPUBLICKEY, 0, keyString)
}
