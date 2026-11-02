/**
 * The worker's end of the device-side reverse helper
 * (vendor/devicehub-reverse/src/devicehub/reverse/Helper.java).
 *
 * Every exchange is its own stream to the helper's abstract socket, opened
 * through the provider's adb server like any other service, so it works
 * wherever that server runs:
 *
 *   control stream   "listen <port>\n"  ->  "OK\n" | "FAIL <reason>\n",
 *                    then one "<token>\n" per connection an app makes
 *   connection       "attach <token>\n" ->  the app's socket, both ways
 *
 * One adb stream per connection, not minirev's single multiplexed one: adb's
 * per-stream flow control carries the backpressure, so a slow user stalls their
 * own connection and nothing else, and no byte is ever dropped for want of room.
 */

import type {ReverseDevice} from './stream.ts'
import type {ReverseBinding} from './session.ts'

/** The helper's abstract socket name */
export const HELPER_SOCKET = 'devicehub-reverse'

/** A new stream to the helper; adbkit's openLocal socket. */
export type OpenHelperStream = () => Promise<ReverseDevice>

/** A token is 32 hex chars; anything much longer is not the helper talking */
const MAX_LINE = 256

/**
 * A device port the helper listens on for us: one bound forward. The control
 * stream is the binding itself — the helper unbinds the port when it ends, and
 * when the helper dies the stream ends too.
 */
export class HelperForward implements ReverseBinding {
    private buffered = ''
    private closed = false
    private lost = false

    private constructor(
        private control: ReverseDevice,
        private openStream: OpenHelperStream,
        private accept: (device: ReverseDevice) => void,
        private onLost: () => void
    ) {}

    /**
     * Ask the helper to listen on `devicePort`. Resolves once the port is really
     * listening — the helper binds before it answers — so an app connecting
     * right after the user's `adb reverse` returns finds it open. Rejects with
     * the helper's reason when it cannot bind.
     *
     * `onLost` is called if the forward goes away on its own (the helper died);
     * not after close().
     */
    static async listen(
        openStream: OpenHelperStream,
        devicePort: number,
        accept: (device: ReverseDevice) => void,
        onLost: () => void
    ): Promise<HelperForward> {
        const control = await openStream()
        const forward = new HelperForward(control, openStream, accept, onLost)
        await forward.start(devicePort)
        return forward
    }

    /** Unbind the port. Connections already attached are their streams' to close. */
    close(): void {
        if (this.closed) {
            return
        }
        this.closed = true
        this.control.end()
        this.control.destroy()
    }

    private start(devicePort: number): Promise<void> {
        return new Promise((resolve, reject) => {
            let answered = false
            const answer = (line: string) => {
                answered = true
                if (line === 'OK') {
                    resolve()
                    return
                }
                this.close()
                reject(new Error(line.startsWith('FAIL ') ? line.slice(5) : `unexpected answer "${line}"`))
            }
            const gone = () => {
                if (!answered) {
                    answered = true
                    this.closed = true
                    this.control.destroy()
                    reject(new Error('the reverse helper closed the stream'))
                    return
                }
                if (!this.closed && !this.lost) {
                    this.lost = true
                    this.control.destroy()
                    this.onLost()
                }
            }

            this.control.on('readable', () => {
                let chunk: Buffer | null
                while ((chunk = this.control.read()) !== null) {
                    this.buffered += chunk.toString('ascii')
                    let newline: number
                    while ((newline = this.buffered.indexOf('\n')) !== -1) {
                        const line = this.buffered.slice(0, newline)
                        this.buffered = this.buffered.slice(newline + 1)
                        if (!answered) {
                            answer(line)
                        }
                        else if (!this.closed && !this.lost) {
                            void this.attach(line)
                        }
                    }
                    if (this.buffered.length > MAX_LINE) {
                        gone()
                        return
                    }
                }
            })
            this.control.on('end', gone)
            this.control.on('close', gone)
            // Never removed: adbkit re-emits a socket error with no listener of
            // ours on the shared adb client, which nobody listens to — a crash
            this.control.on('error', gone)
            this.control.write(Buffer.from(`listen ${devicePort}\n`, 'ascii'))
        })
    }

    /**
     * Fetch the connection the helper just accepted. A stream that cannot be
     * opened costs only that connection: the helper closes it when nobody
     * attaches in time.
     */
    private async attach(token: string): Promise<void> {
        let device: ReverseDevice
        try {
            device = await this.openStream()
        }
        catch {
            return
        }
        device.write(Buffer.from(`attach ${token}\n`, 'ascii'))
        this.accept(device)
    }
}
