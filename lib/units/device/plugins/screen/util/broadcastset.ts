import EventEmitter from 'events'

interface BroadcastSetEvents {
    insert: (id: string) => void
    remove: (id: string) => void
    nonempty: () => void
    empty: () => void
}

export default class BroadcastSet<T = any> extends EventEmitter {
    private set: Record<string, T>
    public count: number

    constructor() {
        super()
        this.set = Object.create(null)
        this.count = 0
    }

    on<K extends keyof BroadcastSetEvents>(event: K, listener: BroadcastSetEvents[K]): this {
        return super.on(event, listener)
    }

    once<K extends keyof BroadcastSetEvents>(event: K, listener: BroadcastSetEvents[K]): this {
        return super.once(event, listener)
    }

    emit<K extends keyof BroadcastSetEvents>(
        event: K,
        ...args: Parameters<BroadcastSetEvents[K]>
    ): boolean {
        return super.emit(event, ...args)
    }

    off<K extends keyof BroadcastSetEvents>(event: K, listener: BroadcastSetEvents[K]): this {
        return super.off(event, listener)
    }

    removeListener<K extends keyof BroadcastSetEvents>(
        event: K,
        listener: BroadcastSetEvents[K]
    ): this {
        return super.removeListener(event, listener)
    }

    insert(id: string, ws: T): void {
        if (!(id in this.set)) {
            this.set[id] = ws
            this.count += 1
            this.emit('insert', id)
            if (this.count === 1) {
                this.emit('nonempty')
            }
        }
    }

    remove(id: string): void {
        if (id in this.set) {
            delete this.set[id]
            this.count -= 1
            this.emit('remove', id)
            if (this.count === 0) {
                this.emit('empty')
            }
        }
    }

    values(): T[] {
        return Object.keys(this.set).map((id) => {
            return this.set[id]
        })
    }

    keys(): string[] {
        return Object.keys(this.set)
    }

    get(id: string): T | undefined {
        return this.set[id]
    }
}
