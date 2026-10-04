import {describe, expect, it, vi} from 'vitest'
import {WebhookHub} from '../../../../lib/units/provider/remote-devices/webhooks.ts'

const okFetch = () => vi.fn(async() => new Response(null, {status: 204})) as any

describe('WebhookHub', () => {
    it('shares one URL between devices and drops it with the last one', () => {
        const hub = new WebhookHub('p1', 1000, okFetch())
        hub.subscribe('a:1', 'http://hook')
        hub.subscribe('b:2', 'http://hook')
        expect(hub.subscriptions()).toEqual({'http://hook': ['a:1', 'b:2']})

        hub.unsubscribe('a:1')
        expect(hub.subscriptions()).toEqual({'http://hook': ['b:2']})

        hub.unsubscribe('b:2')
        expect(hub.subscriptions()).toEqual({})
    })

    it('moves a device to a new URL on resubscribe', () => {
        const hub = new WebhookHub('p1', 1000, okFetch())
        hub.subscribe('a:1', 'http://old')
        hub.subscribe('a:1', 'http://new')
        expect(hub.subscriptions()).toEqual({'http://new': ['a:1']})
    })

    it('posts the event for the device URL only', () => {
        const send = okFetch()
        const hub = new WebhookHub('p1', 1000, send)
        hub.subscribe('a:1', 'http://hook-a')
        hub.subscribe('b:2', 'http://hook-b')

        hub.emit('a:1', 'device.acquired', {email: 'u@x'})
        hub.emit('c:3', 'device.ready') // not subscribed

        expect(send).toHaveBeenCalledTimes(1)
        const [url, init] = send.mock.calls[0]
        expect(url).toBe('http://hook-a')
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body)).toMatchObject({
            event: 'device.acquired', provider: 'p1', serial: 'a:1', data: {email: 'u@x'}
        })
    })

    it('swallows delivery failures', async() => {
        const send = vi.fn(async() => { throw new Error('down') }) as any
        const hub = new WebhookHub('p1', 1000, send)
        hub.subscribe('a:1', 'http://hook')
        expect(() => hub.emit('a:1', 'device.ready')).not.toThrow()
        await new Promise(resolve => setImmediate(resolve))
    })
})
