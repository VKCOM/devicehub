import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import TTLSet from '../../../lib/util/ttlset.ts'

// TTLSet is an intrusive doubly-linked list ordered oldest-first, plus a single
// timer. check() walks from the head and stops at the first item that is still
// alive, so the ORDERING INVARIANT — head is always the oldest — is what makes
// expiry correct. Every re-bump must move the item to the tail; if a re-bumped
// item lands at the head instead, older items end up stranded behind it and are
// never dropped.

describe('TTLSet', () => {
    const TTL = 1000

    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    const collectDrops = (set: TTLSet) => {
        const dropped: string[] = []
        set.on('drop', (v: string) => dropped.push(v))
        return dropped
    }

    it('emits insert for a new value only', () => {
        const set = new TTLSet(TTL)
        const inserted: string[] = []
        set.on('insert', (v: string) => inserted.push(v))

        set.bump('a', Date.now())
        set.bump('a', Date.now())

        expect(inserted).toEqual(['a'])
        set.stop()
    })

    it('drops a value once its TTL elapses', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        vi.advanceTimersByTime(TTL + 1)

        expect(dropped).toEqual(['a'])
        set.stop()
    })

    it('does not drop a value that keeps being bumped', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        for (let i = 0; i < 5; i++) {
            vi.advanceTimersByTime(TTL - 10)
            set.bump('a', Date.now())
        }
        vi.advanceTimersByTime(TTL - 10)

        expect(dropped).toEqual([])
        set.stop()
    })

    // ---- ordering-invariant regression tests --------------------------------
    //
    // These pin the bug where bump() re-linked a re-bumped item using its own
    // already-nulled `prev`, making it the HEAD rather than the tail.

    it('still expires a silent value after ANOTHER value was re-bumped', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('silent', Date.now())
        set.bump('live', Date.now())
        // Re-bumping 'live' must not strand 'silent' behind it.
        set.bump('live', Date.now())

        vi.advanceTimersByTime(TTL + 1)

        expect(dropped.sort()).toEqual(['live', 'silent'])
        set.stop()
    })

    it('expires every member of a large set where all but one were re-bumped', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)
        const values = Array.from({length: 25}, (_, i) => `d${i}`)

        values.forEach(v => set.bump(v, Date.now()))
        // everyone except the last one heartbeats again
        values.slice(0, -1).forEach(v => set.bump(v, Date.now()))

        vi.advanceTimersByTime(TTL + 1)

        expect(dropped.sort()).toEqual([...values].sort())
        set.stop()
    })

    it('reaps ONLY the silent value while another keeps heartbeating', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('live', Date.now())
        set.bump('silent', Date.now())

        // 'live' heartbeats across the whole window; 'silent' never does.
        for (let i = 0; i < 4; i++) {
            vi.advanceTimersByTime(TTL / 2)
            set.bump('live', Date.now())
        }

        expect(dropped).toEqual(['silent'])
        set.stop()
    })

    it('drops in oldest-first order', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('first', Date.now())
        vi.advanceTimersByTime(10)
        set.bump('second', Date.now())
        vi.advanceTimersByTime(10)
        set.bump('third', Date.now())

        vi.advanceTimersByTime(TTL + 100)

        expect(dropped).toEqual(['first', 'second', 'third'])
        set.stop()
    })

    it('re-bumping the head moves it behind the remaining items', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        vi.advanceTimersByTime(10)
        set.bump('b', Date.now())
        vi.advanceTimersByTime(10)
        // 'a' is the head; re-bumping must send it to the tail
        set.bump('a', Date.now())

        vi.advanceTimersByTime(TTL + 100)

        expect(dropped).toEqual(['b', 'a'])
        set.stop()
    })

    it('keeps working after the sole item is dropped and re-inserted', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        vi.advanceTimersByTime(TTL + 1)
        expect(dropped).toEqual(['a'])

        // The list is now empty; inserting again must behave like a fresh set.
        set.bump('a', Date.now())
        vi.advanceTimersByTime(TTL + 1)

        expect(dropped).toEqual(['a', 'a'])
        set.stop()
    })

    it('an explicit drop removes the item without waiting for the TTL', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        set.bump('b', Date.now())
        set.drop('a')

        expect(dropped).toEqual(['a'])

        // and 'b' still expires normally afterwards
        vi.advanceTimersByTime(TTL + 1)
        expect(dropped).toEqual(['a', 'b'])
        set.stop()
    })

    it('dropping the middle of the list leaves the neighbours expiring correctly', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        set.bump('b', Date.now())
        set.bump('c', Date.now())
        set.drop('b', TTLSet.SILENT)

        vi.advanceTimersByTime(TTL + 1)

        expect(dropped).toEqual(['a', 'c'])
        set.stop()
    })

    it('a SILENT drop emits nothing', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        set.drop('a', TTLSet.SILENT)

        expect(dropped).toEqual([])
        set.stop()
    })

    it('a SILENT bump emits no insert but still expires', () => {
        const set = new TTLSet(TTL)
        const inserted: string[] = []
        set.on('insert', (v: string) => inserted.push(v))
        const dropped = collectDrops(set)

        set.bump('a', Date.now(), TTLSet.SILENT)
        expect(inserted).toEqual([])

        vi.advanceTimersByTime(TTL + 1)
        expect(dropped).toEqual(['a'])
        set.stop()
    })

    it('honours an explicitly supplied (older) timestamp', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        // Seeding with a past timestamp is how the processor arms a TTL for a
        // device it has never heard from.
        set.bump('a', Date.now() - TTL / 2)
        vi.advanceTimersByTime(TTL / 2 + 10)

        expect(dropped).toEqual(['a'])
        set.stop()
    })

    it('stop() prevents any further drops', () => {
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)

        set.bump('a', Date.now())
        set.stop()
        vi.advanceTimersByTime(TTL * 5)

        expect(dropped).toEqual([])
    })

    it('drops many values seeded at the SAME timestamp in one pass', () => {
        // This is exactly the processor's startup sweep shape: every seeded device
        // shares time = startedAt, so they must all expire together.
        const set = new TTLSet(TTL)
        const dropped = collectDrops(set)
        const seededAt = Date.now()
        const values = Array.from({length: 30}, (_, i) => `s${i}`)

        values.forEach(v => set.bump(v, seededAt, TTLSet.SILENT))
        vi.advanceTimersByTime(TTL + 1)

        expect(dropped.sort()).toEqual([...values].sort())
        set.stop()
    })
})
