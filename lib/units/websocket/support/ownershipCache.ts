//
// Module-level TTL cache for "which devices does a user currently own".
//
// Rationale: on socket reconnect (page refresh) ownership must be seeded from
// the DB, but multiple sockets for the same email connect in a burst and we
// don't want N parallel queries.  A short TTL (default 10 s) collapses the
// burst into one DB round-trip while staying fresh enough that a race between
// group.kick and the next reconnect is safe (worst-case: stale for <TTL).
//
// Callers supply a `loader` thunk so the cache stays free of DB imports.
//

export interface OwnedDevice {
    serial: string
    providerName: string
}

type Loader = () => Promise<OwnedDevice[]>

interface Entry {
    devices: OwnedDevice[]
    expiresAt: number
}

export class OwnershipCache {
    private readonly ttlMs: number
    private readonly map = new Map<string, Entry>()

    constructor(ttlMs = 10_000) {
        this.ttlMs = ttlMs
    }

    async get(email: string, loader: Loader): Promise<OwnedDevice[]> {
        const now = Date.now()
        const entry = this.map.get(email)
        if (entry && now < entry.expiresAt) {
            return entry.devices
        }
        const devices = await loader()
        this.map.set(email, {devices, expiresAt: now + this.ttlMs})
        return devices
    }

    /** Force the next call to reload (e.g. after a confirmed group.kick). */
    invalidate(email: string): void {
        this.map.delete(email)
    }
}
