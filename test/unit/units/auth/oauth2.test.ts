import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import type {AddressInfo} from 'node:net'
import type {Server} from 'node:http'
import {createApp} from '../../../../lib/units/auth/oauth2/index.js'

describe('OAuth 2.0 auth unit', () => {
    let server: Server
    let base: string

    beforeEach(async() => {
        const app = createApp({
            secret: 'secret',
            appUrl: 'http://app.test/',
            docsUrl: 'http://docs.test/',
            oauth: {
                authorizationURL: 'http://idp.test/authorize',
                tokenURL: 'http://idp.test/token',
                userinfoURL: 'http://idp.test/userinfo',
                clientID: 'client',
                clientSecret: 'client-secret',
                callbackURL: 'http://app.test/auth/oauth/callback',
                scope: ['openid']
            }
        })
        server = app.listen(0)
        await new Promise(resolve => server.once('listening', resolve))
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterEach(() => new Promise<void>(resolve => server.close(() => resolve())))

    // The UI asks for it on every page: it must not start a login
    it('answers /auth/docs without going to the identity provider', async() => {
        const res = await fetch(`${base}/auth/docs`, {redirect: 'manual'})

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({success: true, docsUrl: 'http://docs.test/'})
    })

    it('still sends a login to the identity provider', async() => {
        const res = await fetch(`${base}/auth/oauth/`, {redirect: 'manual'})

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toMatch(/^http:\/\/idp\.test\/authorize\?/)
    })
})
