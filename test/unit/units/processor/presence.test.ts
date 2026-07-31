import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {PresenceTracker} from '../../../../lib/units/processor/presence.ts'
import {deviceKey} from '../../../../lib/wire/frame.ts'

// Presence tracking for the processor, on top of TTLSet.
//
// The uniqueness KEY is the deviceKey (providerName + serial) — two emulators
// sharing "emulator-5554" behind different providers must not collapse. But the
// emitted events carry the bare serial, matching the existing wire payload
// (DevicePresentMessage/DeviceAbsentMessage take {serial}). So the tracker
// remembers deviceKey -> serial to report the right serial on timeout.

describe('PresenceTracker', () => {
    const TTL = 30_000

    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('emits present with the serial the first time a device is bumped', () => {
        const tracker = new PresenceTracker(TTL)
        const present: string[] = []
        tracker.on('present', ({serial}) => present.push(serial))

        tracker.bump('provider-a', 'serial-1', Date.now())

        expect(present).toEqual(['serial-1'])
    })

    it('does not re-emit present on a subsequent heartbeat bump', () => {
        const tracker = new PresenceTracker(TTL)
        const present: string[] = []
        tracker.on('present', ({serial}) => present.push(serial))

        tracker.bump('provider-a', 'serial-1', Date.now())
        tracker.bump('provider-a', 'serial-1', Date.now())

        expect(present).toEqual(['serial-1'])
    })

    it('keeps two emulators with the same serial behind different providers separate', () => {
        const tracker = new PresenceTracker(TTL)
        const present: string[] = []
        tracker.on('present', ({serial}) => present.push(serial))

        tracker.bump('provider-a', 'emulator-5554', Date.now())
        tracker.bump('provider-b', 'emulator-5554', Date.now())

        // both are distinct devices, so two present events for the same serial
        expect(present).toEqual(['emulator-5554', 'emulator-5554'])
    })

    it('emits absent with the serial after the heartbeat TTL elapses', () => {
        const tracker = new PresenceTracker(TTL)
        const absent: string[] = []
        tracker.on('absent', ({serial}) => absent.push(serial))

        tracker.bump('provider-a', 'serial-1', Date.now())
        vi.advanceTimersByTime(TTL + 1)

        expect(absent).toEqual(['serial-1'])
    })

    it('a bump within the TTL keeps the device present (no absent)', () => {
        const tracker = new PresenceTracker(TTL)
        const absent: string[] = []
        tracker.on('absent', ({serial}) => absent.push(serial))

        tracker.bump('provider-a', 'serial-1', Date.now())
        vi.advanceTimersByTime(TTL - 1)
        tracker.bump('provider-a', 'serial-1', Date.now())
        vi.advanceTimersByTime(TTL - 1)

        expect(absent).toEqual([])
    })

    it('a silent bump (initial load) does not emit present', () => {
        const tracker = new PresenceTracker(TTL)
        const present: string[] = []
        tracker.on('present', ({serial}) => present.push(serial))

        tracker.bump('provider-a', 'serial-1', Date.now(), {silent: true})

        expect(present).toEqual([])
    })

    it('re-introduction (drop then bump) re-emits present', () => {
        const tracker = new PresenceTracker(TTL)
        const present: string[] = []
        tracker.on('present', ({serial}) => present.push(serial))

        tracker.bump('provider-a', 'serial-1', Date.now())
        // an introduction drops silently then bumps, mirroring the reaper flow
        tracker.introduce('provider-a', 'serial-1', Date.now())

        expect(present).toEqual(['serial-1', 'serial-1'])
    })
})
