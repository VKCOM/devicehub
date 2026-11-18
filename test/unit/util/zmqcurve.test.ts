import {describe, it, expect, afterEach} from 'vitest'
import {Dealer, curveKeyPair} from 'zeromq'
import {RouterSocket, DealerSocket} from '../../../lib/util/zmqsocket.ts'
import {curveKeys, z85Encode} from '../../../lib/util/zmqcurve.ts'

// Real sockets over loopback TCP, as in zmqsocket.test.ts

const nextPort = (() => {
    let p = 16900
    return () => p++
})()

// Resolves with the payload frame, or null when nothing arrives in time
const receive = (router: RouterSocket, ms = 1000): Promise<string | null> =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms)
        router.once('frames', (frames: Buffer[]) => {
            clearTimeout(timer)
            resolve(frames[1].toString())
        })
    })

describe('ZMQ CURVE', () => {
    const open: Array<{close: () => Promise<void>}> = []
    afterEach(async () => {
        await Promise.all(open.splice(0).map(s => s.close().catch(() => {})))
    })

    const router = async(secret?: string) => {
        const addr = `tcp://127.0.0.1:${nextPort()}`
        const socket = new RouterSocket({secret})
        await socket.bind(addr)
        open.push(socket)
        return {socket, addr}
    }

    const dealer = (addr: string, secret?: string) => {
        const socket = new DealerSocket({secret})
        socket.connect(addr)
        open.push(socket)
        return socket
    }

    it('encodes Z85 like the RFC 32 test vector', () => {
        expect(z85Encode(Buffer.from([0x86, 0x4F, 0xD2, 0x6F, 0xB5, 0x59, 0xF7, 0x5B]))).toBe('HelloWorld')
    })

    it('derives stable, distinct keys from the secret', () => {
        const keys = curveKeys('secret')!
        expect(curveKeys('secret')).toEqual(keys)
        expect(curveKeys('other')!.server.publicKey).not.toBe(keys.server.publicKey)
        expect(keys.client.publicKey).not.toBe(keys.server.publicKey)
        expect(keys.server.publicKey).toHaveLength(40)
        expect(curveKeys(undefined)).toBeNull()
    })

    it('delivers between units that share the secret', async () => {
        const {socket, addr} = await router('secret')
        const received = receive(socket)
        await dealer(addr, 'secret').send([Buffer.from('hello')])
        expect(await received).toBe('hello')
    })

    it('rejects a peer without CURVE', async () => {
        const {socket, addr} = await router('secret')
        const received = receive(socket)
        dealer(addr).send([Buffer.from('intruder')]).catch(() => {})
        expect(await received).toBeNull()
    })

    it('rejects a peer with another secret', async () => {
        const {socket, addr} = await router('secret')
        const received = receive(socket)
        dealer(addr, 'guess').send([Buffer.from('intruder')]).catch(() => {})
        expect(await received).toBeNull()
    })

    // CURVE alone lets in anyone who knows the server key; ZAP checks the client
    it('rejects a peer that knows the server key but not the client key', async () => {
        const {socket, addr} = await router('secret')
        const received = receive(socket)
        const {publicKey, secretKey} = curveKeyPair()
        const intruder = new Dealer({
            curveServerKey: curveKeys('secret')!.server.publicKey,
            curvePublicKey: publicKey,
            curveSecretKey: secretKey
        })
        intruder.connect(addr)
        open.push({close: async() => intruder.close()})
        intruder.send('intruder').catch(() => {})
        expect(await received).toBeNull()
    })

    it('keeps two routers with different secrets apart in one process', async () => {
        const a = await router('secret-a')
        const b = await router('secret-b')

        const fromWrong = receive(a.socket)
        dealer(a.addr, 'secret-b').send([Buffer.from('wrong')]).catch(() => {})
        expect(await fromWrong).toBeNull()

        const fromRight = receive(b.socket)
        await dealer(b.addr, 'secret-b').send([Buffer.from('right')])
        expect(await fromRight).toBe('right')
    })

    it('still works without a secret', async () => {
        const {socket, addr} = await router()
        const received = receive(socket)
        await dealer(addr).send([Buffer.from('plain')])
        expect(await received).toBe('plain')
    })
})
