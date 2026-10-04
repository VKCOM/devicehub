import {describe, expect, it, vi} from 'vitest'
import {getSilentDevice} from '../../../../lib/units/api/controllers/silent-devices.js'
import {DescribeSilentDevice} from '../../../../lib/wire/wire.js'

describe('GET silent-devices/provider/serial', () => {
    const response = () => { const res = {status: vi.fn(), json: vi.fn()}; res.status.mockReturnValue(res); return res }
    it('uses the exact provider and authenticated actor in a single transaction', async () => {
        const device = {serial: 'same', provider: {name: 'p2'}}
        const runTransaction = vi.fn().mockResolvedValue({body: {device}})
        const req = {params: {provider: 'p2', serial: 'same'}, user: {email: 'verified', name: 'name', group: 'g'}, options: {txmanager: {runTransaction}}}
        const res = response()
        await getSilentDevice(req, res)
        expect(runTransaction).toHaveBeenCalledTimes(1)
        expect(runTransaction).toHaveBeenCalledWith('p2', 'same', DescribeSilentDevice, {
            actor: {...req.user, adbKeys: []}
        }, {timeout: 10_000})
        expect(res.json).toHaveBeenCalledWith({success: true, device})
    })
    it.each([['forbidden', 403], ['not_silent', 404], ['unauthorized', 401], [undefined, 504]])('maps %s to %s', async (data, status) => {
        const req = {params: {provider: 'p', serial: 's'}, user: {email: 'verified'}, options: {txmanager: {runTransaction: vi.fn().mockRejectedValue({data})}}}
        const res = response()
        await getSilentDevice(req, res)
        expect(res.status).toHaveBeenCalledWith(status)
    })
})
