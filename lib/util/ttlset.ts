import EventEmitter from 'events'

class TTLItem {
    constructor(
        public value: string,
        public time: number,
        public prev: TTLItem | null,
        public next: TTLItem | null
    ) {}
}

class TTLSet extends EventEmitter {
    private head: TTLItem | null = null
    private tail: TTLItem | null = null
    // Map preserves a stable hidden class on delete (no V8 dictionary-mode
    // thrash when devices disconnect). Record<string,…> degrades to dictionary
    // mode on the first `delete`, making every subsequent access megamorphic.
    private mapping = new Map<string, TTLItem>()
    private timer: NodeJS.Timeout | null = null
    // Track the absolute timestamp of the next scheduled expiry so we can skip
    // clearTimeout+setTimeout on bumps that don't advance the deadline (the
    // common case: bumping a device that is not near the head).
    private nextExpiry = Infinity

    static SILENT = 1

    constructor(
        private ttl = 30_000
    ) {
        super()
    }

    // Move `value` to the tail (freshest end) with a new timestamp, inserting
    // it if unknown. remove() nulls both links, so the item is always re-linked
    // from scratch; the list is kept ordered oldest-first (head) to newest (tail).
    bump(value: string, time: number, flags?: any) {
        const existing = this.mapping.get(value)
        const item = existing
            ? this.remove(existing)!
            : this.create(value, flags)

        item.time = time || Date.now()

        // Append at the tail: the list must stay ordered oldest-first, because
        // check() only ever walks it from the head and stops at the first live
        // item.
        item.prev = this.tail
        item.next = null
        if (this.tail) {
            this.tail.next = item
        }
        else {
            this.head = item
        }
        this.tail = item

        this.scheduleCheck()
    }

    drop(value: string, flags?: any) {
        this._drop(this.mapping.get(value), flags)
    }

    stop() {
        clearTimeout(this.timer!)
    }

    // Only arm a new timer when the new head expiry is EARLIER than the one
    // already scheduled. On a steady stream of heartbeats the head barely moves —
    // most bump() calls skip clearTimeout+setTimeout entirely, eliminating O(N)
    // timer allocations per heartbeat cycle.
    private scheduleCheck() {
        if (!this.head) {
            return
        }
        const nextDue = this.head.time + this.ttl
        if (nextDue < this.nextExpiry) {
            clearTimeout(this.timer!)
            this.nextExpiry = nextDue
            const delay = Math.max(0, nextDue - Date.now())
            this.timer = setTimeout(() => {
                this.nextExpiry = Infinity
                this.check()
            }, delay)
        }
    }

    private check() {
        const now = Date.now()
        let item: TTLItem | null
        while ((item = this.head)) {
            if (now - item.time > this.ttl) {
                this._drop(item, 0)
            }
            else {
                break
            }
        }
        this.scheduleCheck()
    }

    // Create a detached item; bump() links it into the list.
    private create(value: string, flags: any) {
        const item = new TTLItem(value, 0, null, null)
        this.mapping.set(value, item)
        if ((flags & TTLSet.SILENT) !== TTLSet.SILENT) {
            this.emit('insert', value)
        }
        return item
    }

    private _drop(item: TTLItem | undefined | null, flags?: any) {
        if (item) {
            // If we are removing the current head the next-due deadline
            // changes; reset nextExpiry so scheduleCheck() recalculates it
            // against the new head.
            const wasHead = item === this.head
            this.remove(item)
            this.mapping.delete(item.value)
            if ((flags & TTLSet.SILENT) !== TTLSet.SILENT) {
                this.emit('drop', item.value)
            }
            if (wasHead) {
                this.nextExpiry = Infinity
            }
        }
    }

    private remove(item: TTLItem) {
        if (!item) {
            return null
        }
        if (item.prev) {
            item.prev.next = item.next
        }
        if (item.next) {
            item.next.prev = item.prev
        }
        if (item === this.head) {
            this.head = item.next
        }
        if (item === this.tail) {
            this.tail = item.prev
        }
        item.next = item.prev = null
        return item
    }
}

export default TTLSet
