type Handler = () => void

// SeqQueue is a fixed-size reorder buffer keyed by a cyclic sequence number.
// It exists on the device touch path: the browser mints a cyclic `seq`
// (0..size-1) per input event and events may arrive out of order over the
// wire. SeqQueue replays their handlers in strict `seq` order, tolerating up
// to `maxWaiting` missing slots before skipping a gap so it never stalls.
export default class SeqQueue {
    private readonly size: number
    private readonly maxWaiting: number
    private readonly list: Array<Handler | undefined>
    private lo = 0
    private waiting = 0
    private locked = true

    constructor(size: number, maxWaiting: number) {
        this.size = size
        this.maxWaiting = maxWaiting
        this.list = new Array<Handler | undefined>(size)
    }

    start(seq: number): void {
        this.locked = false
        // The loop in maybeConsume() wraps `lo` correctly if seq + 1 === size.
        this.lo = seq + 1
        this.maybeConsume()
    }

    stop(): void {
        this.locked = true
        this.maybeConsume()
    }

    push(seq: number, handler: Handler): void {
        if (seq >= this.size) {
            return
        }
        this.list[seq] = handler
        this.waiting += 1
        this.maybeConsume()
    }

    maybeConsume(): void {
        if (this.locked) {
            return
        }
        // Hoist fields into locals for the hot loop.
        const {list, size, maxWaiting} = this
        let lo = this.lo
        let waiting = this.waiting
        while (waiting) {
            // Reached the end of the ring? Wrap back to the beginning.
            if (lo >= size) {
                lo = 0
            }
            const handler = list[lo]
            if (handler) {
                // Have it: deliver in order.
                list[lo] = undefined
                lo += 1
                waiting -= 1
                // Persist cursor before invoking, so a re-entrant stop()/start()
                // from within the handler observes consistent state.
                this.lo = lo
                this.waiting = waiting
                handler()
                if (this.locked) {
                    return
                }
                // The handler may have mutated lo/waiting (e.g. via start()).
                lo = this.lo
                waiting = this.waiting
            }
            else if (waiting >= maxWaiting) {
                // Too far behind waiting for a missing seq: skip the gap.
                lo += 1
                waiting -= 1
            }
            else {
                // Don't have it yet, and still within tolerance: wait.
                break
            }
        }
        this.lo = lo
        this.waiting = waiting
    }
}
