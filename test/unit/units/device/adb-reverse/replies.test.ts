import {describe, it, expect} from 'vitest'
import {protocolString, replyFor} from '../../../../../lib/units/device/plugins/adb-reverse/replies.ts'
import {ReverseForwards} from '../../../../../lib/units/device/plugins/adb-reverse/forwards.ts'

// We answer `reverse:` requests ourselves, so our bytes must be exactly what a
// real adbd sends — the user's `adb` client parses them with no tolerance.
// AOSP adb_io.cpp SendProtocolString: 4 lowercase hex length chars, then the
// payload.
describe('protocolString', () => {
    it('prefixes the payload with its length as 4 hex chars', () => {
        expect(protocolString('OK').toString()).toBe('0002OK')
    })

    it('counts length in bytes, not characters', () => {
        // SendProtocolString takes s.size() — a byte count. A multi-byte error
        // message would otherwise declare a short length and desync the client's
        // parser for every byte that follows.
        expect(protocolString('é').toString()).toBe('0002é')
    })
})

describe('replyFor', () => {
    it('answers a successful bind with a bare OKAY', () => {
        // On a device the `#if ADB_HOST` SendOkay is compiled out, so exactly one
        // OKAY goes out, with no protocol string after it.
        expect(replyFor({action: 'bind', remote: 'tcp:7777', local: 'tcp:8080', devicePort: 7777}).toString())
            .toBe('OKAY')
    })

    // FAIL is "FAIL" + SendProtocolString(reason) (adb_io.cpp), and the reason
    // text is what `adb reverse` prints to the user, so it is part of the
    // observable contract — not a detail we get to reword.
    it('answers a refused norebind with FAIL and the AOSP reason text', () => {
        expect(replyFor({action: 'rebind-refused', remote: 'tcp:7777'}).toString())
            .toBe('FAIL' + '001dcannot rebind existing socket')
    })

    it('answers killforward of an unbound remote with the AOSP not-found text', () => {
        expect(replyFor({action: 'listener-not-found', remote: 'tcp:7777'}).toString())
            .toBe('FAIL' + "001dlistener 'tcp:7777' not found")
    })

    // reverse_service falls back to this exact text when handle_forward_request
    // does not recognise the command (daemon/services.cpp:69).
    it('answers an unrecognised command with the AOSP fallback text', () => {
        expect(replyFor({action: 'unknown', name: 'reverse:garbage'}).toString())
            .toBe('FAIL' + '0020not a reverse forwarding command')
    })

    // A malformed `forward:` is a different failure from an unrecognised command,
    // and the user sees the difference. handle_forward_request recognises the
    // prefix and reports the parse failure itself as "bad forward: <spec>"
    // (adb.cpp:1190); only a command it declines entirely reaches
    // reverse_service's generic fallback. The spec is quoted back with
    // `forward:`/`norebind:` already stripped, because AOSP has advanced its
    // `service` pointer past them by that point.
    it('answers a malformed forward with the AOSP bad-forward text', () => {
        expect(replyFor({action: 'bad-forward', spec: 'tcp:7777;tcp:8080;tcp:9999'}).toString())
            .toBe('FAIL' + '0027bad forward: tcp:7777;tcp:8080;tcp:9999')
    })

    // A well-formed request we cannot serve is a bind failure, not a parse
    // failure: minirev only listens on TCP ports.
    it('answers an unsupported remote spec with a cannot-bind failure', () => {
        const reply = replyFor({action: 'unsupported', remote: 'localabstract:foo'}).toString()

        expect(reply.startsWith('FAIL')).toBe(true)
        expect(reply).toContain('cannot bind listener')
    })

    it('answers a malformed killforward with the AOSP bad-killforward text', () => {
        expect(replyFor({action: 'bad-killforward', spec: 'a;b'}).toString())
            .toBe('FAIL' + '0014bad killforward: a;b')
    })

    it('never answers OKAY for a command it does not handle explicitly', () => {
        // Guards against a permissive `default:` branch reporting success for a
        // request we actually refused.
        for (const command of [
            {action: 'unknown', name: 'reverse:garbage'},
            {action: 'rebind-refused', remote: 'tcp:1'},
            {action: 'listener-not-found', remote: 'tcp:1'},
            {action: 'unsupported', remote: 'localabstract:foo'},
            {action: 'bad-forward', spec: 'tcp:1;tcp:2;tcp:3'},
            {action: 'bad-killforward', spec: 'a;b'},
        ] as const) {
            expect(replyFor(command).toString().startsWith('FAIL')).toBe(true)
        }
    })
})

// The one reply with no OKAY prefix at all: on a device the `#if ADB_HOST`
// SendOkay is compiled out, so list-forward sends only the protocol string
// (adb.cpp:1137-1143). format_listeners writes one line per entry, and entries
// from `adb reverse` have no serial, so the serial column is "(reverse)"
// (adb_listeners.cpp).
describe('replyFor: list-forward', () => {
    it('sends the listener list as a bare protocol string, without OKAY', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')

        const reply = replyFor(forwards.exec('reverse:list-forward'), forwards).toString()

        expect(reply).toBe(protocolString('(reverse) tcp:7777 tcp:8080\n').toString())
        expect(reply.startsWith('OKAY')).toBe(false)
    })

    it('lists every registered forward, one line each', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')
        forwards.exec('reverse:forward:tcp:9000;tcp:3000')

        const reply = replyFor(forwards.exec('reverse:list-forward'), forwards).toString()

        expect(reply.slice(4)).toBe(
            '(reverse) tcp:7777 tcp:8080\n' +
            '(reverse) tcp:9000 tcp:3000\n'
        )
    })

    it('sends an empty list when nothing is bound', () => {
        const forwards = new ReverseForwards()

        expect(replyFor(forwards.exec('reverse:list-forward'), forwards).toString()).toBe('0000')
    })
})
