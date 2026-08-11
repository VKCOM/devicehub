//
// Presence tracking for the processor, on top of TTLSet.
//
// The uniqueness KEY is the deviceKey (providerName + serial): device serials
// are not globally unique (emulators share e.g. "emulator-5554"), so tracking
// by bare serial would collapse two distinct devices behind different
// providers. The emitted events, however, carry the bare serial to match the
// existing wire payload (DevicePresentMessage/DeviceAbsentMessage take
// {serial}). So the tracker remembers deviceKey -> serial and reports the right
// serial on timeout.
//
import {EventEmitter} from 'events'
import TTLSet from '../../util/ttlset.js'
import {deviceKey} from '../../wire/frame.js'

export interface PresenceEvent {
    serial: string
    providerName: string
}

export interface PresenceTracker {
    on(event: 'present' | 'absent', listener: (e: PresenceEvent) => void): this
}

export class PresenceTracker extends EventEmitter {
    private ttlset: TTLSet
    // deviceKey -> {serial, providerName}, so a timeout drop can report them.
    private meta = new Map<string, PresenceEvent>()

    constructor(ttlMs: number) {
        super()
        this.ttlset = new TTLSet(ttlMs)

        this.ttlset.on('insert', (key: string) => {
            const e = this.meta.get(key)
            if (e) {
                this.emit('present', e)
            }
        })

        this.ttlset.on('drop', (key: string) => {
            const e = this.meta.get(key)
            this.meta.delete(key)
            if (e) {
                this.emit('absent', e)
            }
        })
    }

    // Record a heartbeat for a device. Emits 'present' the first time (unless
    // silent, e.g. during initial state load).
    bump(providerName: string, serial: string, time: number, opts: {silent?: boolean} = {}) {
        const key = deviceKey(providerName, serial)
        this.meta.set(key, {serial, providerName})
        this.ttlset.bump(key, time, opts.silent ? TTLSet.SILENT : 0)
    }

    // A device introduction: drop any stale entry silently, then bump so a
    // fresh 'present' is emitted (mirrors the reaper introduction flow).
    introduce(providerName: string, serial: string, time: number) {
        const key = deviceKey(providerName, serial)
        this.ttlset.drop(key, TTLSet.SILENT)
        this.bump(providerName, serial, time)
    }

    // Drop a device silently (e.g. an explicit absent from the device).
    forget(providerName: string, serial: string) {
        const key = deviceKey(providerName, serial)
        this.meta.delete(key)
        this.ttlset.drop(key, TTLSet.SILENT)
    }

    stop() {
        this.ttlset.stop()
    }
}
