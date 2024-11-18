import * as apiutil from '../../../util/apiutil.js'
import * as dbapi from '../../../db/api.js'
function writeStats(req, res) {
    const user = req.user.name
    const serial = req.query.serial
    const action = req.query.action
    dbapi.writeStats(user, serial, action)
        .then((r) => {
            apiutil.respond(res, 200, r)
        })
        .catch(() => {
            apiutil.internalError(res, 'Failed')
        })
}
export {writeStats}
export default {
    writeStats: writeStats
}
