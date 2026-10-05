import {describe, expect, it} from 'vitest'
import {parseConnectRequest} from '../../../../lib/units/provider/remote-devices/request.ts'

describe('parseConnectRequest', () => {
    it('needs nothing but host and port', () => {
        expect(parseConnectRequest({host: '10.0.0.5', port: 5555})).toEqual({
            host: '10.0.0.5',
            port: 5555,
            connectUrl: undefined,
            connectCommand: undefined,
            silent: false,
            hideHeader: false,
            emails: [],
            groupId: undefined,
            idleTtl: undefined,
            webhook: undefined
        })
    })

    it.each([null, ''])('treats optional fields set to %j as absent', value => {
        expect(parseConnectRequest({
            host: '10.0.0.5', port: 5555,
            connectUrl: value, connectCommand: value, silent: value, hideHeader: value,
            emails: value, groupId: value, idleTtl: value, webhook: value
        })).toEqual(parseConnectRequest({host: '10.0.0.5', port: 5555}))
    })

    it('reads every optional field', () => {
        expect(parseConnectRequest({
            host: '10.0.0.5', port: '5555', silent: true, hideHeader: 'true', emails: [' a@x ', 'a@x', 'b@x'],
            idleTtl: '60', connectUrl: 'proxy:1234', webhook: 'http://platform.local/hook'
        })).toEqual({
            host: '10.0.0.5', port: 5555, connectUrl: 'proxy:1234', connectCommand: undefined, silent: true,
            hideHeader: true, emails: ['a@x', 'b@x'], groupId: undefined, idleTtl: 60, webhook: 'http://platform.local/hook'
        })
    })

    it('reads a full connect command', () => {
        expect(parseConnectRequest({host: 'h', port: 1, connectCommand: ' custom-adb connect 10.0.0.5:5555 '}))
            .toMatchObject({connectUrl: undefined, connectCommand: 'custom-adb connect 10.0.0.5:5555'})
    })

    it('ignores hideHeader of a non-silent device', () => {
        expect(parseConnectRequest({host: 'h', port: 1, hideHeader: true}).hideHeader).toBe(false)
        expect(parseConnectRequest({host: 'h', port: 1, silent: true, groupId: 'g', hideHeader: true}).hideHeader).toBe(false)
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
        [{host: '10.0.0.5', port: 1, connectUrl: 'proxy:1', connectCommand: 'adb connect proxy:1'}, /mutually exclusive/],
        [{host: '10.0.0.5', port: 1, connectUrl: 'adb connect proxy:1'}, /connectUrl/],
        [{host: '10.0.0.5', port: 1, connectCommand: 'proxy:1'}, /connectCommand/],
        [undefined, /host/]
    ])('rejects %j', (body, error) => {
        expect(() => parseConnectRequest(body)).toThrow(error)
    })
})
