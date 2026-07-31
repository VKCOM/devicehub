import {describe, it, expect} from 'vitest'
import SeqQueue from '../../../lib/wire/seqqueue.ts'

// SeqQueue reorders out-of-sequence handlers back into monotonic `seq` order.
// It is the touch-input reorder buffer: the frontend mints a cyclic `seq`
// (0..cycle-1, cycle=100 => SeqQueue(100, 4)) and messages may arrive out of
// order over the wire. The queue delivers them in order, tolerating up to
// `maxWaiting` missing slots before skipping a gap so it never stalls forever.

describe('SeqQueue', () => {
    it('is locked before start(): pushed handlers do not run', () => {
        const queue = new SeqQueue(10, 4)
        let ran = false
        queue.push(0, () => {
            ran = true
        })
        expect(ran).toBe(false)
    })

    it('delivers in-order handlers after start()', () => {
        const queue = new SeqQueue(10, 4)
        const order: number[] = []
        // start(seq) primes lo = seq + 1, so the first expected seq is 1.
        queue.start(0)
        queue.push(1, () => order.push(1))
        queue.push(2, () => order.push(2))
        queue.push(3, () => order.push(3))
        expect(order).toEqual([1, 2, 3])
    })

    it('buffers an out-of-order handler and flushes once the gap fills', () => {
        const queue = new SeqQueue(10, 4)
        const order: number[] = []
        queue.start(0)
        // seq 2 arrives before seq 1 -> buffered, nothing delivered yet.
        queue.push(2, () => order.push(2))
        expect(order).toEqual([])
        // seq 1 arrives -> both 1 and 2 flush in order.
        queue.push(1, () => order.push(1))
        expect(order).toEqual([1, 2])
    })

    it('skips a gap once waiting reaches maxWaiting (never stalls forever)', () => {
        const queue = new SeqQueue(10, 2)
        const order: number[] = []
        queue.start(0)
        // Expected next is 1. seq 2 arrives (waiting = 1 < maxWaiting) -> buffered.
        queue.push(2, () => order.push(2))
        expect(order).toEqual([])
        // seq 3 arrives (waiting = 2 = maxWaiting): the queue gives up on the
        // missing seq 1, skips that slot, and delivers seq 2. It stops after
        // consuming 2 because `waiting` is exhausted, so seq 3 stays buffered
        // until the next push advances the cursor to it.
        queue.push(3, () => order.push(3))
        expect(order).toEqual([2])
        // Each subsequent push advances the cursor by one, draining one buffered
        // handler: seq 4 arrives -> the buffered seq 3 is delivered.
        queue.push(4, () => order.push(4))
        expect(order).toEqual([2, 3])
        // seq 5 arrives -> the buffered seq 4 is delivered.
        queue.push(5, () => order.push(5))
        expect(order).toEqual([2, 3, 4])
    })

    it('wraps around at size boundary (cyclic seq)', () => {
        // Mirrors the production SeqQueue(100, 4) fed by the frontend cycle=100.
        const size = 4
        const queue = new SeqQueue(size, 4)
        const order: number[] = []
        // start near the end so the next expected seq wraps back to 0.
        queue.start(size - 2) // lo = size - 1 = 3
        queue.push(size - 1, () => order.push(size - 1)) // seq 3
        queue.push(0, () => order.push(100)) // wraps to slot 0
        queue.push(1, () => order.push(101))
        expect(order).toEqual([size - 1, 100, 101])
    })

    it('ignores a push with seq >= size', () => {
        const queue = new SeqQueue(4, 4)
        const order: number[] = []
        queue.start(-1) // lo = 0
        queue.push(4, () => order.push(4)) // out of range -> dropped
        queue.push(0, () => order.push(0))
        expect(order).toEqual([0])
    })

    it('stops consuming when a queued handler calls stop()', () => {
        const queue = new SeqQueue(10, 4)
        const order: number[] = []
        queue.start(0)
        // seq 1 handler stops the queue (like GestureStop in the touch plugin).
        queue.push(1, () => {
            order.push(1)
            queue.stop()
        })
        // seq 2 is buffered but must not run while stopped.
        queue.push(2, () => order.push(2))
        expect(order).toEqual([1])
        // restarting resumes delivery of the buffered handler.
        queue.start(1) // lo = 2
        expect(order).toEqual([1, 2])
    })
})
