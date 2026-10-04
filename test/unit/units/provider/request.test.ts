import {describe, expect, it} from 'vitest'
import {parseConnectRequest} from '../../../../lib/units/provider/remote-devices/request.ts'

describe('parseConnectRequest', () => {
    it('needs nothing but host and port', () => {
        expect(parseConnectRequest({host: '10.0.0.5', port: 5555})).toEqual({
            host: '10.0.0.5',
            port: 5555,
            connectUrl: undefined,
            silent: false,
            emails: [],
            groupId: undefined,
            idleTtl: undefined,
            webhook: undefined
        })
    })

    it.each([null, ''])('treats optional fields set to %j as absent', value => {
        expect(parseConnectRequest({
            host: '10.0.0.5', port: 5555,
            connectUrl: value, silent: value, emails: value, groupId: value, idleTtl: value, webhook: value
        })).toEqual(parseConnectRequest({host: '10.0.0.5', port: 5555}))
    })

    it('reads every optional field', () => {
        expect(parseConnectRequest({
            host: '10.0.0.5', port: '5555', silent: true, emails: [' a@x ', 'a@x', 'b@x'],
            idleTtl: '60', connectUrl: 'proxy:1234', webhook: 'http://platform.local/hook'
        })).toEqual({
            host: '10.0.0.5', port: 5555, connectUrl: 'proxy:1234', silent: true, emails: ['a@x', 'b@x'],
            groupId: undefined, idleTtl: 60, webhook: 'http://platform.local/hook'
        })
    })

    it('accepts a single email', () => {
        expect(parseConnectRequest({host: 'h', port: 1, silent: true, emails: 'a@x'}).emails).toEqual(['a@x'])
    })

    it('does not restrict the webhook scheme', () => {
        expect(parseConnectRequest({host: 'h', port: 1, webhook: 'http://hook'}).webhook).toBe('http://hook')
        expect(parseConnectRequest({host: 'h', port: 1, webhook: 'https://hook'}).webhook).toBe('https://hook')
    })

    it('makes a grouped device non-silent and ignores emails', () => {
        expect(parseConnectRequest({host: 'h', port: 1, groupId: 'g', silent: true, emails: ['a@x']}))
            .toMatchObject({groupId: 'g', silent: false, emails: []})
    })

    it('ignores emails of a non-silent device', () => {
        expect(parseConnectRequest({host: 'h', port: 1, emails: ['a@x']}).emails).toEqual([])
    })

    it.each([
        [{port: 5555}, /host/],
        [{host: null, port: 5555}, /host/],
        [{host: '10.0.0.5'}, /port/],
        [{host: '10.0.0.5', port: null}, /port/],
        [{host: '10.0.0.5', port: 0}, /port/],
        [{host: '10.0.0.5', port: 70000}, /port/],
        [{host: '10.0.0.5', port: 'abc'}, /port/],
        [{host: '10.0.0.5', port: 1, idleTtl: -1}, /idleTtl/],
        [{host: '10.0.0.5', port: 1, idleTtl: 'soon'}, /idleTtl/],
        [undefined, /host/]
    ])('rejects %j', (body, error) => {
        expect(() => parseConnectRequest(body)).toThrow(error)
    })
})
