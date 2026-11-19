import {describe, expect, it, vi} from 'vitest'
import {createGroupInvite, createGroupKick, foreignOwner} from '../../../../lib/units/websocket/support/group-invite.js'

const user = {email: 'me@example.com', name: 'Me', group: 'g-me', privilege: 'admin'}
const request = {timeout: 900_000, requirements: {serial: {value: 's1', match: 'exact' as const}}}

function invite(owner?: {email: string; name: string} | null) {
    const deps = {
        user,
        loadDevice: vi.fn(async() => ({serial: 's1', owner})),
        loadAdbKeys: vi.fn(async() => [{fingerprint: 'fp'}]),
        join: vi.fn(async() => {}),
        fail: vi.fn()
    }
    return {deps, run: createGroupInvite(deps)}
}

describe('group.invite', () => {
    it('joins a free device', async() => {
        const {deps, run} = invite(null)
        await run('s1', 'rc', request)
        expect(deps.join).toHaveBeenCalledExactlyOnceWith('s1', 'rc', {
            owner: {email: user.email, name: user.name, group: user.group},
            timeout: 900_000,
            requirements: request.requirements,
            keys: ['fp']
        })
        expect(deps.fail).not.toHaveBeenCalled()
    })

    it('refreshes a device the user already owns, e.g. from another tab', async() => {
        const {deps, run} = invite({email: user.email, name: user.name})
        await run('s1', 'rc', request)
        expect(deps.join).toHaveBeenCalledOnce()
    })

    it('answers busy instead of taking over a device of another user, even for an admin', async() => {
        const {deps, run} = invite({email: 'other@example.com', name: 'Other'})
        await run('s1', 'rc', request)
        expect(deps.join).not.toHaveBeenCalled()
        expect(deps.fail).toHaveBeenCalledExactlyOnceWith('s1', 'rc', 'busy', {owner: {name: 'Other'}})
    })

    it('reports a failure of the device lookup', async() => {
        const {deps, run} = invite(null)
        deps.loadDevice.mockRejectedValueOnce(new Error('db down'))
        await run('s1', 'rc', request)
        expect(deps.join).not.toHaveBeenCalled()
        expect(deps.fail).toHaveBeenCalledWith('s1', 'rc', 'db down')
    })

    it('treats an unknown device as free and lets the device answer', () => {
        expect(foreignOwner(null, user)).toBeNull()
        expect(foreignOwner({owner: null}, user)).toBeNull()
    })
})

function kick(owner: {email: string; name: string} | null, privilege = 'user') {
    const deps = {
        user: {email: user.email, privilege},
        adminPrivilege: 'admin',
        loadDevice: vi.fn(async() => ({serial: 's1', owner})),
        ungroup: vi.fn(async() => {}),
        fail: vi.fn()
    }
    return {deps, run: createGroupKick(deps)}
}

describe('group.kick', () => {
    it('releases a device the user owns', async() => {
        const {deps, run} = kick({email: user.email, name: user.name})
        await run('s1', 'rc', request)
        expect(deps.ungroup).toHaveBeenCalledExactlyOnceWith('s1', 'rc', request.requirements)
        expect(deps.fail).not.toHaveBeenCalled()
    })

    it('refuses to release a device of another user', async() => {
        const {deps, run} = kick({email: 'other@example.com', name: 'Other'})
        await run('s1', 'rc', request)
        expect(deps.ungroup).not.toHaveBeenCalled()
        expect(deps.fail).toHaveBeenCalledExactlyOnceWith('s1', 'rc', 'not_owner')
    })

    it('lets an admin release a device of another user', async() => {
        const {deps, run} = kick({email: 'other@example.com', name: 'Other'}, 'admin')
        await run('s1', 'rc', request)
        expect(deps.loadDevice).not.toHaveBeenCalled()
        expect(deps.ungroup).toHaveBeenCalledOnce()
    })

    it('passes a free device to the device to answer', async() => {
        const {deps, run} = kick(null)
        await run('s1', 'rc', request)
        expect(deps.ungroup).toHaveBeenCalledOnce()
    })

    it('reports a failure of the device lookup', async() => {
        const {deps, run} = kick(null)
        deps.loadDevice.mockRejectedValueOnce(new Error('db down'))
        await run('s1', 'rc', request)
        expect(deps.ungroup).not.toHaveBeenCalled()
        expect(deps.fail).toHaveBeenCalledWith('s1', 'rc', 'db down')
    })
})
