import {describe, it, expect} from 'vitest'
import {ReverseForwards} from '../../../../../lib/units/device/plugins/adb-reverse/forwards.ts'

// The user's own adb server snoops every `reverse:` request it relays to us and
// keeps an allow-list of remote -> local specs. It then refuses (with
// LOG(FATAL), killing itself) any A_OPEN whose service name is not a `local`
// spec it has on file. So we must mirror that allow-list with exactly the same
// grammar, and only ever open a reverse stream for a spec we saw registered.
describe('ReverseForwards: binding a reverse forward', () => {
    it('binds a device port to the local spec the user registered', () => {
        const forwards = new ReverseForwards()

        const result = forwards.exec('reverse:forward:tcp:7777;tcp:8080')

        expect(result).toEqual({action: 'bind', remote: 'tcp:7777', local: 'tcp:8080', devicePort: 7777})
        expect(forwards.resolveLocal('tcp:7777')).toBe('tcp:8080')
    })

    it('keeps each registered pair distinct, so two forwards can coexist', () => {
        const forwards = new ReverseForwards()

        forwards.exec('reverse:forward:tcp:7777;tcp:8080')
        const second = forwards.exec('reverse:forward:tcp:9000;tcp:3000')

        expect(second).toEqual({action: 'bind', remote: 'tcp:9000', local: 'tcp:3000', devicePort: 9000})
        expect(forwards.resolveLocal('tcp:7777')).toBe('tcp:8080')
        expect(forwards.resolveLocal('tcp:9000')).toBe('tcp:3000')
    })

    // A locally connected device refuses this: install_listener returns
    // INSTALL_STATUS_CANNOT_REBIND, which adbd reports as FAIL. `adb reverse
    // --no-rebind` must therefore fail visibly instead of silently keeping the
    // old target, otherwise the user believes they rebound the port.
    it('refuses norebind: when the remote is already bound, keeping the old target', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')

        const result = forwards.exec('reverse:forward:norebind:tcp:7777;tcp:9999')

        expect(result).toEqual({action: 'rebind-refused', remote: 'tcp:7777'})
        expect(forwards.resolveLocal('tcp:7777')).toBe('tcp:8080')
    })

    it('norebind: does bind when the remote is not yet registered', () => {
        const forwards = new ReverseForwards()

        const result = forwards.exec('reverse:forward:norebind:tcp:5555;tcp:1234')

        expect(result).toEqual({action: 'bind', remote: 'tcp:5555', local: 'tcp:1234', devicePort: 5555})
        expect(forwards.resolveLocal('tcp:5555')).toBe('tcp:1234')
    })
})

describe('ReverseForwards: removing reverse forwards', () => {
    it('killforward: removes the specific remote entry', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')
        forwards.exec('reverse:forward:tcp:9000;tcp:3000')

        const result = forwards.exec('reverse:killforward:tcp:7777')

        expect(result).toEqual({action: 'unbind', remote: 'tcp:7777'})
        expect(forwards.resolveLocal('tcp:7777')).toBeUndefined()
        expect(forwards.resolveLocal('tcp:9000')).toBe('tcp:3000') // unaffected
    })

    it('killforward-all: clears every registered entry', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')
        forwards.exec('reverse:forward:tcp:9000;tcp:3000')

        const result = forwards.exec('reverse:killforward-all')

        expect(result).toEqual({action: 'unbind-all'})
        expect(forwards.size).toBe(0)
    })
})

describe('ReverseForwards: list-forward', () => {
    it('returns a list action without modifying the map', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')

        const result = forwards.exec('reverse:list-forward')

        expect(result).toEqual({action: 'list'})
        expect(forwards.size).toBe(1) // map untouched
    })
})

describe('ReverseForwards: isLocalConfigured', () => {
    it('returns true for a local spec that is in the allow-list', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')

        expect(forwards.isLocalConfigured('tcp:8080')).toBe(true)
    })

    it('returns false for a local spec not in the allow-list', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')

        expect(forwards.isLocalConfigured('tcp:9999')).toBe(false)
    })

    it('returns false after killforward removes the entry', () => {
        const forwards = new ReverseForwards()
        forwards.exec('reverse:forward:tcp:7777;tcp:8080')
        forwards.exec('reverse:killforward:tcp:7777')

        expect(forwards.isLocalConfigured('tcp:8080')).toBe(false)
    })
})

describe('ReverseForwards: unknown/garbage commands', () => {
    it('returns unknown for an unrecognised service name', () => {
        const forwards = new ReverseForwards()

        const r1 = forwards.exec('reverse:garbage')
        const r2 = forwards.exec('shell:ls')

        expect(r1).toEqual({action: 'unknown', name: 'reverse:garbage'})
        expect(r2).toEqual({action: 'unknown', name: 'shell:ls'})
        expect(forwards.size).toBe(0) // nothing was registered
    })

    it('rejects remote=tcp:* wildcard', () => {
        const forwards = new ReverseForwards()

        // AOSP rejects pieces[1] starting with '*', i.e. the local spec
        const result = forwards.exec('reverse:forward:tcp:7777;*')

        expect(result).toEqual({action: 'bad-forward', spec: 'tcp:7777;*'})
        expect(forwards.size).toBe(0)
    })

    // A locally connected device supports localabstract:/localfilesystem: remote
    // specs, but our device-side listener (minirev) can only bind a TCP port. We
    // must say so instead of registering a bogus devicePort 0, which would push a
    // broken listener onto the device and leave the user with a silent no-op.
    it('refuses a non-tcp remote spec rather than registering port 0', () => {
        const forwards = new ReverseForwards()

        const result = forwards.exec('reverse:forward:localabstract:foo;tcp:8080')

        expect(result).toEqual({action: 'unsupported', remote: 'localabstract:foo'})
        expect(forwards.size).toBe(0)
    })

    it('refuses a tcp remote spec with a non-numeric or out-of-range port', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:forward:tcp:abc;tcp:8080'))
            .toEqual({action: 'unsupported', remote: 'tcp:abc'})
        expect(forwards.exec('reverse:forward:tcp:0;tcp:8080'))
            .toEqual({action: 'unsupported', remote: 'tcp:0'})
        expect(forwards.exec('reverse:forward:tcp:70000;tcp:8080'))
            .toEqual({action: 'unsupported', remote: 'tcp:70000'})
        expect(forwards.size).toBe(0)
    })
})

// AOSP remove_listener returns INSTALL_STATUS_LISTENER_NOT_FOUND for a remote
// nobody bound, which handle_forward_request reports as
// FAIL "listener '<spec>' not found" (adb.cpp:1233). Reporting a silent success
// would make `adb reverse --remove` look like it worked on a typo'd port.
describe('ReverseForwards: killforward of an unbound remote', () => {
    it('reports listener-not-found instead of a silent unbind', () => {
        const forwards = new ReverseForwards()

        const result = forwards.exec('reverse:killforward:tcp:7777')

        expect(result).toEqual({action: 'listener-not-found', remote: 'tcp:7777'})
    })
})

// AOSP splits the spec on ";" and demands exactly two non-empty pieces
// (adb.cpp:1188). A third piece means a malformed request, and accepting it
// would register a local spec ("tcp:8080;junk") that the user's own server
// never snooped — the exact mismatch that makes it LOG(FATAL) on our A_OPEN.
//
// A malformed *forward* is not the same failure as an unrecognised command.
// handle_forward_request recognises the `forward:` prefix and answers the parse
// failure itself, with "bad forward: <spec>" (adb.cpp:1190); only a command it
// does not recognise at all falls through to reverse_service's "not a reverse
// forwarding command" (daemon/services.cpp:69). The two texts reach the user, so
// they are part of the contract.
describe('ReverseForwards: malformed specs', () => {
    it('reports a forward spec with more than two pieces as a bad forward', () => {
        const forwards = new ReverseForwards()

        const result = forwards.exec('reverse:forward:tcp:7777;tcp:8080;tcp:9999')

        expect(result).toEqual({action: 'bad-forward', spec: 'tcp:7777;tcp:8080;tcp:9999'})
        expect(forwards.size).toBe(0)
    })

    // Same split for `killforward:`, but it demands exactly ONE non-empty piece
    // (adb.cpp:1184). The reason text quotes the spec with the prefix already
    // stripped, so an empty spec quotes an empty string.
    it('reports an empty killforward spec as a bad killforward', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:killforward:')).toEqual({action: 'bad-killforward', spec: ''})
    })

    it('reports a killforward spec with two pieces as a bad killforward', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:killforward:tcp:7777;tcp:8080'))
            .toEqual({action: 'bad-killforward', spec: 'tcp:7777;tcp:8080'})
    })

    // A missing separator is still a `forward:` the daemon recognises, so it is a
    // bad forward rather than an unknown command.
    it('reports a forward spec with no separator as a bad forward', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:forward:tcp:7777'))
            .toEqual({action: 'bad-forward', spec: 'tcp:7777'})
    })

    it('rejects a forward spec with an empty remote or local half', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:forward:;tcp:8080'))
            .toEqual({action: 'bad-forward', spec: ';tcp:8080'})
        expect(forwards.exec('reverse:forward:tcp:7777;'))
            .toEqual({action: 'bad-forward', spec: 'tcp:7777;'})
        expect(forwards.size).toBe(0)
    })

    // A single piece — the user typed `adb reverse tcp:7777` with no target. AOSP
    // still recognises the command and reports the malformed spec itself, so this
    // is a bad-forward rather than the generic fallback.
    it('rejects a forward spec with no semicolon at all', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:forward:tcp:7777'))
            .toEqual({action: 'bad-forward', spec: 'tcp:7777'})
        expect(forwards.size).toBe(0)
    })

    // The quoted spec has the `forward:` *and* `norebind:` prefixes stripped:
    // AOSP advances the same `service` pointer past both before it splits, and
    // that pointer is what it formats into the message (adb.cpp:1178-1190).
    it('quotes a bad norebind spec without the norebind prefix', () => {
        const forwards = new ReverseForwards()

        expect(forwards.exec('reverse:forward:norebind:tcp:7777'))
            .toEqual({action: 'bad-forward', spec: 'tcp:7777'})
    })
})
