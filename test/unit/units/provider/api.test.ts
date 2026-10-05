import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {AddressInfo} from 'node:net'
import {createProviderApi} from '../../../../lib/units/provider/remote-devices/api.ts'
import {ConflictError} from '../../../../lib/units/provider/remote-devices/manager.ts'

/* HTTP mapping only: the manager is covered by its own tests */
describe('provider API', () => {
    let devices: any
    let base: string
    let close: () => Promise<void>

    beforeEach(async() => {
        devices = {
            list: vi.fn(() => []),
            webhooks: {subscriptions: () => ({})},
            connect: vi.fn((request: any) => ({serial: `${request.host}:${request.port}`})),
            disconnect: vi.fn((host: string, port: number) => host === 'known' ? `${host}:${port}` : null)
        }
        const {app} = createProviderApi({host: '127.0.0.1', port: 0, providerName: 'p1', devices})
        const server = app.listen(0)
        await new Promise(resolve => server.once('listening', resolve))
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/remote-devices`
        close = () => new Promise(resolve => server.close(() => resolve()))
    })

    afterEach(() => close())

    const post = (body: string) => fetch(base, {method: 'POST', headers: {'Content-Type': 'application/json'}, body})

    it('connects with host and port only', async() => {
        const res = await post(JSON.stringify({host: '10.0.0.5', port: 5555}))
        expect(res.status).toBe(202)
        expect(await res.json()).toEqual({provider: 'p1', serial: '10.0.0.5:5555'})
    })

    it('accepts null optional fields', async() => {
        const res = await post(JSON.stringify({
            host: '10.0.0.5', port: 5555, connectUrl: null, silent: null, emails: null,
            groupId: null, idleTtl: null, webhook: null
        }))
        expect(res.status).toBe(202)
    })

    it('answers 400 to a request without port', async() => {
        const res = await post(JSON.stringify({host: '10.0.0.5'}))
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/port/)
    })

    it('answers 400 to malformed JSON', async() => {
        expect((await post('{')).status).toBe(400)
    })

    it('answers 409 to a duplicate', async() => {
        devices.connect.mockImplementationOnce(() => { throw new ConflictError('already connected') })
        expect((await post(JSON.stringify({host: '10.0.0.5', port: 5555}))).status).toBe(409)
    })

    it('disconnects', async() => {
        const res = await fetch(`${base}/known/5555`, {method: 'DELETE'})
        expect(res.status).toBe(202)
        expect(await res.json()).toEqual({provider: 'p1', serial: 'known:5555'})
        expect(devices.disconnect).toHaveBeenCalledWith('known', 5555)

        expect((await fetch(`${base}/unknown/5555`, {method: 'DELETE'})).status).toBe(404)
    })
})
