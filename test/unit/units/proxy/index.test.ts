import {describe, it, expect, afterEach} from 'vitest'
import proxy from '../../../../lib/units/proxy/index.ts'
import {DealerSocket} from '../../../../lib/util/zmqsocket.ts'
import {KIND} from '../../../../lib/wire/frame.ts'

// End-to-end integration of the proxy unit over real in-process sockets.

const nextPort = (() => {
    let p = 15800
    return () => p++
})()

const nextFrames = (sock: DealerSocket): Promise<Buffer[]> =>
    new Promise((resolve) => sock.once('frames', resolve))

const str = (frames: Buffer[]) => frames.map(b => b.toString())

describe('proxy unit end-to-end', () => {
    const open: Array<{close: () => Promise<void> | void}> = []
    afterEach(async () => {
        await Promise.all(open.splice(0).map(s => Promise.resolve(s.close()).catch(() => {})))
    })

    it('routes a device command from api to the owning processor and the reply back', async () => {
        const addr = `tcp://127.0.0.1:${nextPort()}`
        const {router} = await proxy({endpoints: {router: addr}})
        open.push(router)

        const processor = new DealerSocket({routingId: 'processor-1'})
        processor.connect(addr)
        open.push(processor)

        const api = new DealerSocket({routingId: 'api-1'})
        api.connect(addr)
        open.push(api)

        // processor announces ownership of provider-a
        await processor.send([Buffer.from(KIND.ANNOUNCE), Buffer.from('provider-a')])
        // give the announce time to be processed by the proxy loop
        await new Promise(r => setTimeout(r, 50))

        // api sends a device command
        const atProcessor = nextFrames(processor)
        await api.send([Buffer.from(KIND.DEVICE), Buffer.from('provider-a'), Buffer.from('serial-1'), Buffer.from('cmd')])

        const received = await atProcessor
        // proxy pushed api's identity onto the reply-path
        expect(str(received)).toEqual([KIND.DEVICE, 'provider-a', 'serial-1', 'api-1', 'cmd'])

        // processor replies: pop tail is done by the proxy; processor sends
        // [R, api-1, reply] (its own reply-path minus itself already handled by
        // device layer; here we simulate the frames arriving at the proxy).
        const atApi = nextFrames(api)
        await processor.send([Buffer.from(KIND.REPLY), Buffer.from('api-1'), Buffer.from('reply')])

        const back = await atApi
        expect(str(back)).toEqual([KIND.REPLY, 'reply'])
    })
})
