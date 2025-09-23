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
    private mapping: Record<string, TTLItem> = {}
    private timer: NodeJS.Timeout | null = null

    static SILENT = 1

    constructor(
        private ttl = 30_000
    ) {
        super()
    }

    bump(value: string, time: number, flags?: any) {
        const item =
            this.remove(this.mapping[value]) ||
            this.create(value, this.tail, flags)

        item.time = time || Date.now()
        this.tail = item
        if (item.prev) {
            item.prev.next = item
        }
        else {
            this.head = item
        }

        this.scheduleCheck()
    }

    drop(value: string, flags?: any) {
        this._drop(this.mapping[value], flags)
    }

    stop() {
        clearTimeout(this.timer!)
    }

    private scheduleCheck() {
        clearTimeout(this.timer!)
        if (this.head) {
            const delay = Math.max(0, this.ttl - (Date.now() - this.head.time))
            this.timer = setTimeout(this.check.bind(this), delay)
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

    private create(value: string, prev: TTLItem | null, flags: any) {
        const item = new TTLItem(value, 0, prev, null)
        this.mapping[value] = item
        if ((flags & TTLSet.SILENT) !== TTLSet.SILENT) {
            this.emit('insert', value)
        }
        return item
    }

    private _drop(item: TTLItem, flags?: any) {
        if (item) {
            this.remove(item)
            delete this.mapping[item.value]
            if ((flags & TTLSet.SILENT) !== TTLSet.SILENT) {
                this.emit('drop', item.value)
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
