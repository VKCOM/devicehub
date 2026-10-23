import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../lib/db/api.js', () => ({
    default: {
        loadUser: vi.fn(async(email: string) => ({email, privilege: 'user'})),
        loadAccessTokenById: vi.fn()
    }
}))

import dbapi from '../../../../lib/db/api.js'
import * as jwtutil from '../../../../lib/util/jwtutil.js'
import {ONE_DAY} from '../../../../lib/util/apiutil.js'
import generateToken from '../../../../lib/units/api/helpers/generateToken.js'
import {accessTokenAuth} from '../../../../lib/units/api/helpers/securityHandlers.js'

const secret = 'secret'
const user = {email: 'u@x', name: 'u'}

describe('access token lifetime', () => {
    afterEach(() => { vi.useRealTimers() })

    it('never expires by default', () => {
        vi.useFakeTimers()
        const token = generateToken(user, secret)
        expect(token.expiresAt).toBeNull()

        vi.advanceTimersByTime(10 * 365 * ONE_DAY)
        expect(jwtutil.decode(token.jwt, secret)).toMatchObject({email: 'u@x', jti: token.id})
    })

    it('expires after the chosen number of 30-day months', () => {
        vi.useFakeTimers()
        const token = generateToken(user, secret, 2)
        expect(token.expiresAt).toBe(Date.now() + 60 * ONE_DAY)

        vi.advanceTimersByTime(60 * ONE_DAY - 1)
        expect(jwtutil.decode(token.jwt, secret)).not.toBeNull()
        vi.advanceTimersByTime(1)
        expect(jwtutil.decode(token.jwt, secret)).toBeNull()
    })

    it('refuses other lifetimes', () => {
        expect(() => generateToken(user, secret, 4)).toThrow(/lifetime/)
    })
})

describe('access token authentication', () => {
    const authenticate = (jwt: string) => accessTokenAuth({headers: {authorization: `Bearer ${jwt}`}, options: {secret}})

    it('rejects a deleted access token', async() => {
        const token = generateToken(user, secret)
        vi.mocked(dbapi.loadAccessTokenById).mockResolvedValueOnce(null)

        await expect(authenticate(token.jwt)).rejects.toMatchObject({status: 401, message: 'Revoked token'})
        expect(dbapi.loadAccessTokenById).toHaveBeenCalledWith(token.id)
    })

    it('accepts an existing access token', async() => {
        const token = generateToken(user, secret)
        vi.mocked(dbapi.loadAccessTokenById).mockResolvedValueOnce({id: token.id})

        await expect(authenticate(token.jwt)).resolves.toBe(true)
    })

    // Session tokens and access tokens issued before `jti` cost no extra lookup
    it('does not look up a token without jti', async() => {
        vi.mocked(dbapi.loadAccessTokenById).mockClear()
        const jwt = jwtutil.encode({payload: user, secret})

        await expect(authenticate(jwt)).resolves.toBe(true)
        expect(dbapi.loadAccessTokenById).not.toHaveBeenCalled()
    })
})
