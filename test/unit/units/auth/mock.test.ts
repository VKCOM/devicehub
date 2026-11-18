import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import type {AddressInfo} from 'node:net'
import type {Server} from 'node:http'
import {createApp} from '../../../../lib/units/auth/mock.js'

describe('mock auth unit', () => {
    let server: Server
    let base: string

    beforeEach(async() => {
        const app = createApp({
            secret: 'secret',
            appUrl: 'http://app.test/',
            mock: {useBasicAuth: false}
        })
        server = app.listen(0)
        await new Promise(resolve => server.once('listening', resolve))
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterEach(() => new Promise<void>(resolve => server.close(() => resolve())))

    // A proxy that routes the whole /auth prefix here must not end on "Cannot GET /auth"
    it('sends the bare /auth path to the login page', async() => {
        const res = await fetch(`${base}/auth`, {redirect: 'manual'})

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('/auth/mock/')
    })

    it('issues a token that redirects back to the app', async() => {
        const res = await fetch(`${base}/auth/api/v1/mock`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Accept: 'application/json'},
            body: JSON.stringify({name: 'user', email: 'user@example.com'})
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({success: true, redirect: 'http://app.test/'})
    })
})
