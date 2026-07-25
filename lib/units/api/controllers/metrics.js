/* *
 * Copyright 2026 Matan Baruch <matan.baruch@unity3d.com> - Licensed under the Apache license 2.0
 * */
import * as apiutil from '../../../util/apiutil.js'
import * as metrics from '../../../util/metrics.js'
import DeviceModel from '../../../db/models/device/index.js'
import GroupModel from '../../../db/models/group/index.js'
import UserModel from '../../../db/models/user/index.js'

// Counters are computed on scrape rather than on a timer, so that the returned values are always
// the ones of the very moment the Prometheus server asked for them
function getMetrics(req, res) {
    // The admin tag of the operation is not enough on its own: the device channel branch of
    // accessTokenAuth() authenticates without setting req.user at all, so check the caller here
    if (!req.user || req.user.privilege === apiutil.USER) {
        apiutil.respond(res, 403, 'Forbidden: privileged operation (admin)')
        return
    }

    Promise.all([
        DeviceModel.getDevicesForMetrics(),
        UserModel.getUsers(),
        GroupModel.getGroups({})
    ])
        .then(([devices, users, groups]) => {
            metrics.update(devices, users, groups)
            return metrics.register.metrics()
        })
        .then((body) => {
            res.set('Content-Type', metrics.register.contentType)
            res.status(200).send(body)
        })
        .catch((err) => {
            apiutil.internalError(res, 'Failed to get metrics: ', err.stack)
        })
}

export {getMetrics}
export default {
    getMetrics: getMetrics
}
