import {Any} from '../../../wire/google/protobuf/any.js'
import {deviceKey} from '../../../wire/frame.js'
import type {SilentDeviceState} from '../../../wire/silent-device-state.js'
import {
    DeviceAbsentMessage,
    DeviceLogcatEntryMessage,
    SilentDeviceSnapshot,
    type SilentDeviceEvent,
    type SilentEventContext
} from '../../../wire/wire.js'

export type SilentUpdate = {context: SilentEventContext} & (
    {type: 'snapshot'; snapshot: SilentDeviceState} |
    {type: 'absent'} |
    {type: 'log'; entry: DeviceLogcatEntryMessage}
)
type Subscriber = (event: SilentUpdate) => void

/** Decode once, then deliver only to sessions watching this provider + serial. */
export class SilentDeviceDispatcher {
    private subscribers = new Map<string, Set<Subscriber>>()

    constructor(private onError: (error: unknown) => void) {}

    subscribe(provider: string, serial: string, subscriber: Subscriber): () => void {
        const key = deviceKey(provider, serial)
        let subscribers = this.subscribers.get(key)
        if (!subscribers) {
            this.subscribers.set(key, subscribers = new Set())
        }

        subscribers.add(subscriber)

        return () => {
            subscribers.delete(subscriber)
            if (!subscribers.size && this.subscribers.get(key) === subscribers) {
                this.subscribers.delete(key)
            }
        }
    }

    dispatch(message: SilentDeviceEvent): void {
        const subscribers = this.subscribers.get(deviceKey(message.providerName, message.serial))
        const {context, event} = message

        if (!subscribers?.size || !context || !event) {
            return
        }

        let update: SilentUpdate
        try {
            if (Any.contains(event, SilentDeviceSnapshot)) {
                update = {context, type: 'snapshot', snapshot: JSON.parse(Any.unpack(event, SilentDeviceSnapshot).json)}
            }
            else if (Any.contains(event, DeviceAbsentMessage)) update = {context, type: 'absent'}
            else if (Any.contains(event, DeviceLogcatEntryMessage)) {
                update = {context, type: 'log', entry: Any.unpack(event, DeviceLogcatEntryMessage)}
            }
            else return
        }
        catch (error) {
            this.onError(error); return
        }

        for (const subscriber of subscribers) {
            try {
                subscriber(update)
            }
            catch (error) {
                this.onError(error)
            }
        }
    }

    close(): void {
        this.subscribers.clear()
    }
}
