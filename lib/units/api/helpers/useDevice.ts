//
// Pure device-acquisition logic, decoupled from express/dbapi/ZMQ.
//
// The take-control flow is two transactions against a single device, addressed
// by (provider.name, serial) via the app-side TransactionManager:
//   1. GroupMessage  — join the device into the requesting user's group. The
//      device replies okay() once it has joined, so the transaction resolving
//      IS the join confirmation (no separate JoinGroupMessage broadcast needed).
//   2. ConnectStartMessage — start the remote connection. The device replies
//      okay(url), so the connect url arrives in the reply's `data` field.
//
// `runTransaction` is injected so this can be unit-tested without any transport;
// the caller binds it to its TransactionManager and the device's provider/serial.
//
import type {MessageType} from '@protobuf-ts/runtime'
import datautil from '../../../util/datautil.js'
import deviceutil from '../../../util/deviceutil.js'
import wireutil from '../../../wire/util.js'
import type {TransactionResult} from '../../../wire/transmanager.js'
import {GroupMessage, ConnectStartMessage, OwnerMessage} from '../../../wire/wire.js'

export const UseDeviceError = Object.freeze({
    NOT_FOUND: 0,
    ALREADY_IN_USE: 1,
    FAILED_JOIN: 2,
    FAILED_CONNECT: 3,
})

export type RunTransaction = <T extends object>(
    messageType: MessageType<T>,
    message: T,
    opts?: {timeout?: number}
) => Promise<TransactionResult>

export interface UseDeviceParams {
    user: any
    device: any
    usage?: string | null
    timeout?: number | null
    runTransaction: RunTransaction
    log?: {info: (...args: any[]) => void}
}

// Resolves with the device's remote-connect url, or rejects with a
// UseDeviceError code.
export async function useDevice(
    {user, device, usage = null, timeout = null, runTransaction, log}: UseDeviceParams
): Promise<string> {
    if (!device) {
        return Promise.reject(UseDeviceError.NOT_FOUND)
    }

    datautil.normalize(device, user)
    if (!deviceutil.isAddable(device)) {
        return Promise.reject(UseDeviceError.ALREADY_IN_USE)
    }

    const requirements = wireutil.toDeviceRequirements({
        serial: {value: device.serial, match: 'exact'},
    })

    try {
        await runTransaction(GroupMessage, {
            owner: OwnerMessage.create({
                email: user.email,
                name: user.name,
                group: user.group,
            }),
            requirements,
            usage: usage || undefined,
            timeout: timeout || undefined,
            keys: user.adbKeys?.map((k: {fingerprint: string}) => k.fingerprint) || [],
        })
    }
    catch (err: any) {
        log?.info('Group transaction failed: %s', err?.message ?? err)
        return Promise.reject(UseDeviceError.FAILED_JOIN)
    }

    log?.info('%s added to user group %s', device.serial, user.email)

    try {
        const result = await runTransaction(ConnectStartMessage, {})
        return result.data ?? ''
    }
    catch (err: any) {
        log?.info('Connect transaction failed: %s', err?.message ?? err)
        return Promise.reject(UseDeviceError.FAILED_CONNECT)
    }
}
