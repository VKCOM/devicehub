import * as dbapi from '../../../db/api.js'
import * as jwtutil from '../../../util/jwtutil.js'
import logger from '../../../util/logger.js'


export default (function(options) {
    const log = logger.createLogger('websocket')
    return function(socket, next) {
        try {
            let req = socket.request
            const tokenRaw = socket.handshake.auth.token
            const token = jwtutil.decode(tokenRaw, options.secret)
            req.internalJwt = tokenRaw
            return !token?.email ? next(new Error('Invalid user')) : dbapi.loadUser(token.email)
                .then(function(user) {
                    if (user) {
                        req.user = user
                        return next()
                    }
                    else {
                        return next(new Error('Invalid user'))
                    }
                })
                .catch((e) => {
                    log.error(e)
                    return next(new Error('Unknown error'))
                })
        }
        catch (e) {
            log.error(e)
            return next(new Error('Missing authorization token'))
        }
    }
})
