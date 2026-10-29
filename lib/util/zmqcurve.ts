//
// CURVE security (ZMQ RFC 26) for the ROUTER/DEALER bus.
//
// Every unit of a deployment shares one secret (ZMQ_SECRET). Both CURVE
// keypairs are derived from it, so nothing else has to be distributed:
//   - the server keypair: a ROUTER uses its secret key, a DEALER needs its
//     public key to connect at all;
//   - the client keypair: the only key the ZAP handler (ZMQ RFC 27) lets in.
// A peer that does not know the secret can neither finish the handshake nor
// read or inject a message.
//
import crypto from 'crypto'
import {Context, Reply} from 'zeromq'
import logger from './logger.js'

const log = logger.createLogger('util:zmqcurve')

// RFC 32 alphabet
const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#'

export const z85Encode = (data: Buffer): string => {
    let out = ''
    for (let i = 0; i < data.length; i += 4) {
        let value = data.readUInt32BE(i)
        let chunk = ''
        for (let j = 0; j < 5; j++) {
            chunk = Z85[value % 85] + chunk
            value = Math.floor(value / 85)
        }
        out += chunk
    }
    return out
}

export interface CurveKeyPair {
    publicKey: string
    secretKey: string
}

export interface CurveKeys {
    server: CurveKeyPair
    client: CurveKeyPair
}

// PKCS#8 header of a raw 32-byte X25519 private key
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

const deriveKeyPair = (secret: string, role: string): CurveKeyPair => {
    const secretKey = crypto.createHmac('sha256', secret).update(`devicehub-zmq-curve-${role}`).digest()
    const privateKey = crypto.createPrivateKey({
        key: Buffer.concat([X25519_PKCS8_PREFIX, secretKey]),
        format: 'der',
        type: 'pkcs8'
    })
    const publicKey = Buffer.from(crypto.createPublicKey(privateKey).export({format: 'jwk'}).x!, 'base64url')
    return {publicKey: z85Encode(publicKey), secretKey: z85Encode(secretKey)}
}

const derived = new Map<string, CurveKeys>()

// null when the secret is not set: the bus then runs without security
export const curveKeys = (secret: string | undefined): CurveKeys | null => {
    if (!secret) {
        return null
    }
    let keys = derived.get(secret)
    if (!keys) {
        keys = {server: deriveKeyPair(secret, 'server'), client: deriveKeyPair(secret, 'client')}
        derived.set(secret, keys)
    }
    return keys
}

// The ZAP domain a ROUTER sets, so the handler knows which client key it takes
export const zapDomain = (keys: CurveKeys): string => keys.server.publicKey

// libzmq asks the handler bound to this endpoint in the socket's own context
const ZAP_ENDPOINT = 'inproc://zeromq.zap.01'

const zapHandlers = new WeakMap<Context, Promise<Map<string, string>>>()

const startZapHandler = async(context: Context): Promise<Map<string, string>> => {
    // ZAP domain -> the only client public key it accepts
    const allowed = new Map<string, string>()
    const socket = new Reply({context, linger: 0})
    await socket.bind(ZAP_ENDPOINT)

    ;(async() => {
        for await (const [version, requestId, domain, address, , mechanism, clientKey] of socket) {
            const expected = allowed.get(domain.toString())
            const ok = mechanism.toString() === 'CURVE' &&
                !!clientKey && !!expected && z85Encode(clientKey) === expected
            if (!ok) {
                log.warn('Rejected ZMQ peer %s: unknown CURVE key', address.toString())
            }
            await socket.send([
                version,
                requestId,
                ok ? '200' : '400',
                ok ? 'OK' : 'Unknown CURVE key',
                '',
                ''
            ])
        }
    })().catch(err => log.error('ZAP handler error: %s', err?.message || err))

    return allowed
}

// Must run before the ROUTER binds: without a handler libzmq lets any CURVE
// client that knows the server key in
export const allowCurveClient = async(context: Context, keys: CurveKeys): Promise<void> => {
    let handler = zapHandlers.get(context)
    if (!handler) {
        handler = startZapHandler(context)
        zapHandlers.set(context, handler)
    }
    const allowed = await handler
    allowed.set(zapDomain(keys), keys.client.publicKey)
}
