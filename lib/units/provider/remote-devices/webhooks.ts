import logger from '../../../util/logger.js'

export type RemoteDeviceEvent =
    | 'device.connected'
    | 'device.connect_failed'
    | 'device.ready'
    | 'device.acquired'
    | 'device.released'
    | 'device.disconnected'

export interface WebhookPayload {
    event: RemoteDeviceEvent
    provider: string
    serial: string
    timestamp: number
    data: Record<string, unknown>
}

const log = logger.createLogger('provider:webhooks')

/*
 * Webhook subscriptions. One URL may serve many devices, it is dropped once
 * its last device unsubscribes. Delivery is fire & forget: no retries.
 */
export class WebhookHub {
    private urls = new Map<string, Set<string>>()
    private bySerial = new Map<string, string>()

    constructor(
        private provider: string,
        private timeoutMs = 5000,
        private send: typeof fetch = fetch
    ) {}

    subscribe(serial: string, url: string) {
        this.unsubscribe(serial)
        this.bySerial.set(serial, url)

        const serials = this.urls.get(url) ?? new Set<string>()
        serials.add(serial)
        this.urls.set(url, serials)
    }

    unsubscribe(serial: string) {
        const url = this.bySerial.get(serial)
        if (!url) {
            return
        }

        this.bySerial.delete(serial)

        const serials = this.urls.get(url)
        serials?.delete(serial)
        if (!serials?.size) {
            this.urls.delete(url)
        }
    }

    /* URL -> subscribed serials, for diagnostics */
    subscriptions(): Record<string, string[]> {
        return Object.fromEntries(Array.from(this.urls, ([url, serials]) => [url, Array.from(serials)]))
    }

    emit(serial: string, event: RemoteDeviceEvent, data: Record<string, unknown> = {}) {
        const url = this.bySerial.get(serial)
        if (!url) {
            return
        }

        const payload: WebhookPayload = {event, provider: this.provider, serial, timestamp: Date.now(), data}

        this.send(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(this.timeoutMs)
        })
            .then(res => {
                // Unread bodies keep the connection busy until garbage collection
                res.body?.cancel().catch(() => {})
                if (!res.ok) {
                    log.warn('Webhook "%s" for "%s" [%s] responded %s', url, serial, event, res.status)
                }
            })
            .catch(err => {
                log.warn('Webhook "%s" for "%s" [%s] failed: %s', url, serial, event, err?.message || err)
            })
    }
}
