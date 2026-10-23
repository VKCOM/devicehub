/*
 * Whether access tokens still exist: deleting a token revokes it. A token is
 * looked up at most once per `ttlMs`, so a revoked token keeps working for up
 * to that long. Concurrent checks of a token share one lookup; a failed lookup
 * is not cached. Beyond `maxSize` tokens, the least recently looked up is dropped.
 */
export const createAccessTokenCheck = (
    exists: (id: string) => Promise<boolean>,
    {ttlMs = 120_000, maxSize = 10_000} = {}
) => {
    const checked = new Map<string, {valid: boolean, at: number}>()
    const pending = new Map<string, Promise<boolean>>()

    return (id: string): Promise<boolean> => {
        const cached = checked.get(id)
        if (cached && Date.now() - cached.at < ttlMs) {
            return Promise.resolve(cached.valid)
        }

        const inFlight = pending.get(id)
        if (inFlight) {
            return inFlight
        }

        const lookup = exists(id)
            .then(valid => {
                // Map order is lookup order: re-insert, then drop the oldest
                checked.delete(id)
                checked.set(id, {valid, at: Date.now()})
                if (checked.size > maxSize) {
                    checked.delete(checked.keys().next().value!)
                }
                return valid
            })
            .finally(() => pending.delete(id))
        pending.set(id, lookup)
        return lookup
    }
}
