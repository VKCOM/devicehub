
import crypto from 'node:crypto'
import {DeviceRequirement, DeviceStatus, Envelope, RequirementType, TransactionDoneMessage, TransactionProgressMessage} from './wire.ts'
import { Any } from './google/protobuf/any.ts';
import { createLogger } from '../util/logger.ts';
import {MessageType} from "@protobuf-ts/runtime";
import { ADBDeviceType } from '../units/provider/ADBObserver.js';

export const DEVICE_STATUS_MAP = {
    device: 'ONLINE',
    // emulator: 'ONLINE',
    unauthorized: 'UNAUTHORIZED',
    offline: 'OFFLINE',
    // connecting: 'CONNECTING',
    // authorizing: 'AUTHORIZING',
    unknown: 'OFFLINE',
    recovery: 'OFFLINE',
    bootloader: 'OFFLINE',
    sideload: 'OFFLINE'
} as const satisfies Record<ADBDeviceType, string> // TODO: replace value type with proper type once it's ready

const log = createLogger('wireutil')

const wireutil = {
    global: '*ALL',
    makePrivateChannel() {
        return crypto.randomBytes(16).toString('base64')
    },
    toDeviceStatus(type: keyof typeof DEVICE_STATUS_MAP) {
        return DeviceStatus[DEVICE_STATUS_MAP[type]]
    },
    toDeviceRequirements(requirements: Record<string, {value: string, match: 'semver' | 'glob' | 'exact'}>) {
        return Object.keys(requirements).map(function(name) {
            let item = requirements[name]
            return DeviceRequirement.create({
                name,
                value: item.value,
                type: RequirementType[item.match.toUpperCase() as 'SEMVER' | 'GLOB' | 'EXACT']
            })
        })
    },
    /**
     * @deprecated Do not use raw envelope with a message. Use `pack` for type safety
     */
    envelope(message: object) {
        return this.oldSend(message)
    },
    // envelope(Message.create({...})) // <- forbidden - no way to extract the type
    // envelope(new wire.Message(...))

    pack<T extends object>(messageType: MessageType<T>, message: T, channel: string | undefined = undefined) {
        return Envelope.toBinary({ message: Any.pack(message, messageType), channel} )
    },

    tr<T extends object>(channel: string, messageType: MessageType<T>, message: T) {
        return Envelope.toBinary({ message: Any.pack(message, messageType), channel} )
    },

    /**
     * @deprecated Use `tr` for type safety
     */
    transaction(channel: string, message: object) {
        return this.oldSend(message, channel)
    },

    oldSend(message: object, channel: string | undefined = undefined) {
        // @ts-expect-error
        const messageType = message.__proto__.constructor.type as MessageType<object>
        return this.pack(messageType, message, channel)
    },

    reply(source: string) {
        let seq = 0
        return {
            okay(data?: string, body?: string | object) {
                return wireutil.pack(TransactionDoneMessage, {
                    source,
                    seq: seq++,
                    success: true,
                    data: data ?? 'success',
                    body: body ? JSON.stringify(body) : undefined
                })
            },
            fail(data?: string, body?:string | object) {
                return wireutil.pack(TransactionDoneMessage, {
                    source,
                    seq: seq++,
                    success: false,
                    data: data ?? 'fail',
                    body: body ? JSON.stringify(body) : undefined
                })
            },
            progress(data: string, progress: number) {
                if (!Number.isInteger(progress)) {
                    log.warn('Somebody is sending non integer as progress: %s', data)
                    progress = Math.round(progress)
                }
                return wireutil.pack(TransactionProgressMessage, {
                    source,
                    seq: seq++,
                    data: data,
                    progress: progress
                })
            }
        }
    }
}
export default wireutil
