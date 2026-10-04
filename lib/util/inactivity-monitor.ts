/** Tracks inactivity only; the owner decides what expiration means. All durations are milliseconds. */
export class InactivityMonitor {
    private timer?: ReturnType<typeof setTimeout>
    private lastActivity = 0
    private timeout = 0
    private onTimeout?: () => void

    constructor(private clock = () => performance.now()) {}

    start(timeout: number, onTimeout: () => void): void {
        this.stop()

        // Preserve the existing device timeout conventions: 0 disables, 1 means unlimited.
        if (timeout === 0 || timeout === 1) return
        this.timeout = timeout
        this.onTimeout = onTimeout
        this.lastActivity = this.clock()
        this.checkTimeout()
    }

    keepalive(): void {
        if (this.onTimeout) this.lastActivity = this.clock()
    }

    stop(): void {
        clearTimeout(this.timer)
        this.timer = undefined
        this.onTimeout = undefined
        this.timeout = 0
    }

    private readonly checkTimeout = () => {
        this.timer = undefined
        const remaining = this.timeout - (this.clock() - this.lastActivity)
        if (remaining <= 0) {
            const onTimeout = this.onTimeout
            this.stop()
            onTimeout?.()
        }
        else {
            // Activity only updates the timestamp; a wakeup checks the new deadline.
            this.timer = setTimeout(this.checkTimeout, Math.min(remaining, 2_147_483_647))
            this.timer.unref()
        }
    }
}
