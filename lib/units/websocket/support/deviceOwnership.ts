//
// Per-connection device ownership + provider resolution.
//
// Tracks, for one socket:
//   - which serials the connection currently owns (has taken control of), and
//   - the provider.name for a serial (a hint that can be remembered before or
//     independently of ownership so the hot command path avoids a DB lookup).
//
export class DeviceOwnership {
    private owned = new Set<string>()
    private providers = new Map<string, string>()

    // Take control of a device: mark it owned and remember its provider.
    claim(serial: string, providerName: string): void {
        this.owned.add(serial)
        this.providers.set(serial, providerName)
    }

    // Give up control of a device. The provider hint is dropped too.
    release(serial: string): void {
        this.owned.delete(serial)
        this.providers.delete(serial)
    }

    // Cache a serial -> provider.name mapping without granting ownership, so a
    // later command can resolve the provider without hitting the DB.
    rememberProvider(serial: string, providerName: string): void {
        this.providers.set(serial, providerName)
    }

    isOwned(serial: string): boolean {
        return this.owned.has(serial)
    }

    providerOf(serial: string): string | undefined {
        return this.providers.get(serial)
    }
}
