import {describe, expect, it} from 'vitest'
import {clientKey} from '../../../../lib/units/ratelimit/client-key.ts'

const request = (remoteAddress: string, realIp?: string) =>
    ({socket: {remoteAddress}, headers: realIp ? {'x-real-ip': realIp} : {}}) as any

describe('rate limit client key', () => {
    // Behind nginx every request comes from loopback: without the header all clients would share one limit
    it('tells apart the clients of the local reverse proxy', () => {
        expect(clientKey(request('127.0.0.1', '10.0.0.1'))).toBe('10.0.0.1')
        expect(clientKey(request('::ffff:127.0.0.1', '10.0.0.2'))).toBe('10.0.0.2')
        expect(clientKey(request('::1', '10.0.0.3'))).toBe('10.0.0.3')
    })

    it('ignores the header of a client that connects directly', () => {
        expect(clientKey(request('10.0.0.9', '1.2.3.4'))).toBe('10.0.0.9')
    })

    it('falls back to the connection address without a reverse proxy header', () => {
        expect(clientKey(request('127.0.0.1'))).toBe('127.0.0.1')
    })
})
