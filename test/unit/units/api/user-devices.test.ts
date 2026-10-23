import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../lib/db/api.js', () => ({
    default: {
        lockDeviceByCurrent: vi.fn(),
        unlockDevice: vi.fn(),
        insertUserAdbKey: vi.fn(),
        loadDevice: vi.fn()
    }
}))

import dbapi from '../../../../lib/db/api.js'
import {addAdbPublicKey, addUserDevice, deleteUserDeviceBySerial} from '../../../../lib/units/api/controllers/user.js'
import {GroupMessage, UngroupMessage} from '../../../../lib/wire/wire.js'

const response = () => {
    const res = {status: vi.fn(), json: vi.fn(), setHeader: vi.fn()}
    res.status.mockReturnValue(res)
    return res
}

describe('POST /user/devices', () => {
    beforeEach(() => {
        vi.mocked(dbapi.lockDeviceByCurrent).mockResolvedValue({
            modifiedCount: 1,
            changes: [{new_val: {serial: '099643733J004550', present: true, ready: true, using: false, owner: null, provider: {name: 'p1'}}}]
        })
    })

    // A user who never added an ADB key has no `adbKeys` at all
    it('takes a device for a user without ADB keys', async() => {
        const runTransaction = vi.fn().mockResolvedValue({success: true})
        const req = {
            body: {serial: '099643733J004550', timeout: 900000},
            user: {email: 'u@x', name: 'u', group: 'g', groups: {subscribed: []}},
            options: {txmanager: {runTransaction}}
        }
        const res = response()

        await addUserDevice(req, res)

        expect(res.json).toHaveBeenCalledWith({success: true, description: 'Device successfully added'})
        expect(runTransaction).toHaveBeenCalledWith('p1', '099643733J004550', GroupMessage,
            expect.objectContaining({timeout: 900000, keys: []}))
    })
})

describe('POST /user/adbPublicKeys', () => {
    it('answers 400 to a malformed key and stores nothing', async() => {
        const res = response()
        await addAdbPublicKey({body: {publickey: 'not a key'}, user: {email: 'u@x'}}, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(dbapi.insertUserAdbKey).not.toHaveBeenCalled()
    })
})

describe('DELETE /user/devices/:serial', () => {
    const user = {email: 'u@x', name: 'u', group: 'g', groups: {subscribed: []}}

    beforeEach(() => {
        vi.mocked(dbapi.loadDevice).mockResolvedValue({
            serial: 's1', present: true, ready: true, using: true, provider: {name: 'p1'},
            owner: {email: 'u@x', name: 'u', group: 'g'}
        })
    })

    it('answers once the device is released', async() => {
        const runTransaction = vi.fn().mockResolvedValue({success: true})
        const res = response()

        await deleteUserDeviceBySerial({params: {serial: 's1'}, user, options: {txmanager: {runTransaction}}}, res)

        expect(runTransaction).toHaveBeenCalledWith('p1', 's1', UngroupMessage, expect.anything())
        expect(res.json).toHaveBeenCalledWith({success: true, description: 'Device successfully removed'})
    })

    // Releasing the devices of a deleted group: the response belongs to the group request
    it('leaves the response alone when called internally', async() => {
        const res = response()

        const released = await deleteUserDeviceBySerial({
            isInternal: true, serial: 's1', user, options: {txmanager: {runTransaction: vi.fn().mockResolvedValue({success: true})}}
        }, res)

        expect(released).toBe(true)
        expect(res.json).not.toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalled()
    })

    it('answers 504 with the reason when the device does not respond', async() => {
        const res = response()

        await deleteUserDeviceBySerial({
            params: {serial: 's1'}, user,
            options: {txmanager: {runTransaction: vi.fn().mockRejectedValue(new Error('Timeout when running transaction'))}}
        }, res)

        expect(res.status).toHaveBeenCalledWith(504)
    })
})
