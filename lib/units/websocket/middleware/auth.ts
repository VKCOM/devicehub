import dbapi from '../../../db/api.js'
import * as jwtutil from '../../../util/jwtutil.js'
import logger from '../../../util/logger.js'
import {createAccessTokenCheck} from '../../../util/access-token-check.js'
import type {Socket} from 'socket.io'

/* Shared by every namespace of the unit */
const accessTokenExists = createAccessTokenCheck(id => dbapi.loadAccessTokenById(id).then(Boolean))

interface AuthOptions {
    secret: string
}

export default (options: AuthOptions) => {
    const log = logger.createLogger('websocket')
    return async (socket: Socket, next: (err?: Error) => void) => {
        try {
            const req = socket.request as any
            const tokenRaw = socket.handshake.auth.token
            const token = jwtutil.decode(tokenRaw, options.secret)
            req.internalJwt = tokenRaw

            if (!token?.email) {
                return next(new Error('Invalid user'))
            }

            try {
                if (token.jti && !await accessTokenExists(token.jti)) {
                    return next(new Error('Invalid user'))
                }

                const user = await dbapi.loadUser(token.email)
                if (user) {
                    req.user = user
                    return next()
                }
                else {
                    return next(new Error('Invalid user'))
                }
            }
            catch (e: any) {
                log.error('WS Auth error: %s', e?.message ?? 'Unknown error')
                return next(new Error('Unknown error'))
            }
        }
        catch (e: any) {
            log.error('WS Auth error: %s', e?.message ?? 'Unknown error')
            return next(new Error('Missing authorization token'))
        }
    }
}
