//
// Keeps keys and text in the order they were typed.
//
// Agent commands (key events, ASCII text) are socket writes that finish at once. Other text goes
// through the ADB keyboard broadcast, a shell command that takes a few hundred milliseconds, so a
// key pressed after it would reach the device first. While a broadcast runs, later input waits for
// it, and text typed meanwhile is joined into one broadcast instead of a shell call per character.
//

export class InputQueue {
    private tail: Promise<void> = Promise.resolve()
    private pending = 0
    private waitingText: {text: string} | null = null

    constructor(private onError: (err: unknown) => void) {}

    /** Whether earlier input is still on its way, new input has to queue behind it */
    get isBusy(): boolean {
        return this.pending > 0
    }

    /** Instant work, runs right away unless earlier input is still on its way */
    run(work: () => void): void {
        if (!this.pending) {
            try {
                work()
            }
            catch (err) {
                this.onError(err)
            }
            return
        }

        this.enqueue(async() => work())
    }

    /** Text for a slow sender; text added before that call starts is sent with it */
    text(text: string, send: (text: string) => Promise<unknown>): void {
        if (this.waitingText) {
            this.waitingText.text += text
            return
        }

        const item = {text}
        this.waitingText = item
        this.enqueue(async() => {
            if (this.waitingText === item) {
                this.waitingText = null
            }
            await send(item.text)
        })
    }

    private enqueue(job: () => Promise<void>): void {
        this.pending++
        this.tail = this.tail
            .then(job)
            .catch(this.onError)
            .finally(() => {
                this.pending--
            })
    }
}
