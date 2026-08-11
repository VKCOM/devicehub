import {describe, it, expect, vi} from 'vitest'
import {useDevice, UseDeviceError} from '../../../../lib/units/api/helpers/useDevice.ts'
import {GroupMessage, ConnectStartMessage} from '../../../../lib/wire/wire.ts'

// Pure acquisition logic, decoupled from express/dbapi/ZMQ. It takes an already
// loaded device, the requesting user and a `runTransaction` closure (bound to a
// single AppTransport/TransactionManager) and drives the two-step take-control
// flow: join the device's group, then start the remote connection. It returns
// the connect url or rejects with a UseDeviceError code.

const addableDevice = (over: object = {}) => ({
    serial: 'serial-1',
    present: true,
    ready: true,
    using: false,
    owner: null,
    provider: {name: 'provider-a'},
    ...over,
})

const user = {email: 'u@e.com', name: 'u', group: 'g1', adbKeys: [{fingerprint: 'fp1'}]}

describe('useDevice', () => {
    it('joins the group then starts connect, resolving with the connect url', async () => {
        const device = addableDevice()
        const runTransaction = vi.fn()
            // GroupMessage -> join confirmed
            .mockResolvedValueOnce({success: true, data: 'success', body: {}})
            // ConnectStartMessage -> url carried in `data`
            .mockResolvedValueOnce({success: true, data: 'ws://device:1234', body: {}})

        const url = await useDevice({device, user, usage: 'automation', runTransaction})

        expect(url).toBe('ws://device:1234')
        expect(runTransaction).toHaveBeenCalledTimes(2)
        expect(runTransaction.mock.calls[0][0]).toBe(GroupMessage)
        expect(runTransaction.mock.calls[1][0]).toBe(ConnectStartMessage)
    })

    it('rejects NOT_FOUND when no device is given', async () => {
        const runTransaction = vi.fn()
        await expect(useDevice({device: null, user, runTransaction}))
            .rejects.toBe(UseDeviceError.NOT_FOUND)
        expect(runTransaction).not.toHaveBeenCalled()
    })

    it('rejects ALREADY_IN_USE when the device is not addable', async () => {
        const device = addableDevice({using: true, owner: {email: 'other@e.com'}})
        const runTransaction = vi.fn()
        await expect(useDevice({device, user, runTransaction}))
            .rejects.toBe(UseDeviceError.ALREADY_IN_USE)
        expect(runTransaction).not.toHaveBeenCalled()
    })

    it('rejects FAILED_JOIN when the group transaction rejects', async () => {
        const device = addableDevice()
        const runTransaction = vi.fn().mockRejectedValueOnce(new Error('timeout'))
        await expect(useDevice({device, user, runTransaction}))
            .rejects.toBe(UseDeviceError.FAILED_JOIN)
        expect(runTransaction).toHaveBeenCalledTimes(1)
    })

    it('rejects FAILED_CONNECT when the connect transaction rejects', async () => {
        const device = addableDevice()
        const runTransaction = vi.fn()
            .mockResolvedValueOnce({success: true, data: 'success', body: {}})
            .mockRejectedValueOnce(new Error('timeout'))
        await expect(useDevice({device, user, runTransaction}))
            .rejects.toBe(UseDeviceError.FAILED_CONNECT)
        expect(runTransaction).toHaveBeenCalledTimes(2)
    })

    it('passes the device serial requirement and owner to the group transaction', async () => {
        const device = addableDevice()
        const runTransaction = vi.fn()
            .mockResolvedValueOnce({success: true, data: 'success', body: {}})
            .mockResolvedValueOnce({success: true, data: 'url', body: {}})

        await useDevice({device, user, usage: 'automation', timeout: 5000, runTransaction})

        const groupMsg = runTransaction.mock.calls[0][1]
        expect(groupMsg.owner.email).toBe('u@e.com')
        expect(groupMsg.usage).toBe('automation')
        expect(groupMsg.timeout).toBe(5000)
        expect(groupMsg.keys).toEqual(['fp1'])
    })
})
