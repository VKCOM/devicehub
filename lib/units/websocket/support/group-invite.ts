//
// `group.invite` of the main namespace: takes control of a device for the connected user.
//
// A device owned by a different user is never taken over, admins included, the same as
// the REST API (`deviceutil.isAddable`). An invite of the current owner refreshes its
// ownership, so several tabs of one user keep working.
//
// `group.kick` releases a device only for its owner or an admin, the same as the REST API
// (`deviceutil.isOwnedByUser`).
//
import type {DeviceGroupRequest} from './device-command-handlers.js'

interface InviteUser {
    email: string
    name: string
    group: string
}

interface KickUser {
    email: string
    privilege?: string
}

interface StoredDevice {
    owner?: {email?: string; name?: string} | null
}

export interface GroupInviteDeps {
    user: InviteUser
    loadDevice: (serial: string) => Promise<StoredDevice | null | undefined>
    loadAdbKeys: (email: string) => Promise<Array<{fingerprint: string}>>
    join: (serial: string, responseChannel: string, message: {
        owner: InviteUser
        timeout?: number
        requirements: DeviceGroupRequest['requirements']
        keys: string[]
    }) => Promise<void>
    fail: (serial: string, responseChannel: string, data: string, body?: object) => void
}

/** Owner of the device when it is a different user, otherwise null */
export const foreignOwner = (device: StoredDevice | null | undefined, user: {email: string}) =>
    device?.owner?.email && device.owner.email !== user.email ? device.owner : null

export const createGroupInvite = ({user, loadDevice, loadAdbKeys, join, fail}: GroupInviteDeps) =>
    async(serial: string, responseChannel: string, data: Partial<DeviceGroupRequest> = {}) => {
        try {
            const owner = foreignOwner(await loadDevice(serial), user)
            if (owner) {
                fail(serial, responseChannel, 'busy', {owner: {name: owner.name ?? null}})
                return
            }

            const keys = await loadAdbKeys(user.email)
            await join(serial, responseChannel, {
                owner: {email: user.email, name: user.name, group: user.group},
                timeout: data.timeout || undefined,
                requirements: data.requirements ?? {},
                keys: keys.map(key => key.fingerprint)
            })
        }
        catch (err: any) {
            fail(serial, responseChannel, err?.message || 'fail')
        }
    }

export interface GroupKickDeps {
    user: KickUser
    adminPrivilege: string
    loadDevice: (serial: string) => Promise<StoredDevice | null | undefined>
    ungroup: (serial: string, responseChannel: string, requirements: DeviceGroupRequest['requirements']) => Promise<void>
    fail: (serial: string, responseChannel: string, data: string) => void
}

export const createGroupKick = ({user, adminPrivilege, loadDevice, ungroup, fail}: GroupKickDeps) =>
    async(serial: string, responseChannel: string, data: Partial<DeviceGroupRequest> = {}) => {
        try {
            if (user.privilege !== adminPrivilege && foreignOwner(await loadDevice(serial), user)) {
                fail(serial, responseChannel, 'not_owner')
                return
            }

            await ungroup(serial, responseChannel, data.requirements ?? {})
        }
        catch (err: any) {
            fail(serial, responseChannel, err?.message || 'fail')
        }
    }
