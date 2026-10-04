import {DescribeSilentDevice} from '../../../wire/wire.js'

export const getSilentDevice = async(req, res) => {
    if (!req.user?.email) {
        return res.status(401).json({success: false, description: 'Unauthorized'})
    }

    const {provider, serial} = req.params
    if (!provider || !serial || provider.includes('\0') || serial.includes('\0')) {
        return res.status(400).json({success: false, description: 'Invalid device address'})
    }

    try {
        const result = await req.options.txmanager.runTransaction(provider, serial, DescribeSilentDevice, {
            actor: {email: req.user.email, name: req.user.name, group: req.user.group, adbKeys: []}
        }, {timeout: 10_000})

        return res.json({success: true, device: result.body.device})
    }
    catch (err) {
        const status = {forbidden: 403, unauthorized: 401, not_silent: 404}[err?.data] || 504
        return res.status(status).json({success: false, description: err?.data || 'Device did not respond'})
    }
}
