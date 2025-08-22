
import dbapi from '../../../db/api.js'
import * as jwtutil from '../../../util/jwtutil.js'
import logger from '../../../util/logger.js'
import * as apiutil from '../../../util/apiutil.js'

const log = logger.createLogger('api:helpers:securityHandlers')
let upsertQueue

// Specifications: https://tools.ietf.org/html/rfc6750#section-2.1
async function accessTokenAuth(req, res, next) {
    let operationTag
    if (req.operationDoc) {
        operationTag = req.operationDoc.tags
    }
    else {
        operationTag = 'not-swagger'
    }


    const isNotAllowed = (user) => !user || (
        user.privilege === apiutil.USER && operationTag.indexOf('admin') > -1
    )
    const forbidden = {
        status: 403,
        message: 'Forbidden: privileged operation (admin)'
    }

    if (req.headers.authorization) {
        const authHeader = req.headers.authorization.split(' ')
        const format = authHeader[0]
        const tokenId = authHeader[1]
        if (format !== 'Bearer') {
            log.error('Invalid Header Format')
            throw {
                status: 401,
                message: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header or missed cookie')
            throw {
                status: 401,
                message: 'No Credentials'
            }
        }

        let data
        try {
            data = jwtutil.decode(tokenId, req.options.secret)
        }
        catch(e) {
            const token = await dbapi.loadAccessTokenById(tokenId)
            if (!token) {
                throw {
                    status: 401,
                    message: 'Unknown token'
                }
            }
            data = jwtutil.decode(token.jwt, req.options.secret)
        }

        if (!data?.email) {
            throw {
                status: 401,
                message: 'Bad token'
            }
        }

        await upsertQueue
        const user = await dbapi.loadUser(data.email)

        if (user) {
            if (isNotAllowed(user)) {
                throw forbidden
            }
            req.user = user
            req.internalJwt = tokenId
            return true
        }
        else {
            // Solve the problem with asynchronous requests (db duplicate key)
            // when we get many requests that require upsert (updateOne -> not modified -> insert)
            upsertQueue = (upsertQueue || Promise.resolve()).then(() => dbapi.saveUserAfterLogin({
                name: data.name,
                email: data.email,
                ip: req.ip,
                ...(data.privilege && {privilege: data.privilege})
            })).catch((/** @type {Error} */ err) => {
                if (err?.message && !err?.message?.includes('duplicate')) {
                    throw err
                }
            })

            await upsertQueue

            const user = await dbapi.loadUser(data.email)
            if (isNotAllowed(user)) {
                throw forbidden
            }

            req.user = user
            req.internalJwt = tokenId
            return true
        }
    }

    else if (req.headers.internal) {
        let authHeader = req.headers.internal.split(' ')
        let format = authHeader[0]
        let tokenId = authHeader[1]
        if (format !== 'Internal') {
            throw {
                status: 401,
                message: 'Authorization header should be in "Internal $AUTH_TOKEN" format'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header')
            throw {
                status: 401,
                message: 'Bad Credentials'
            }
        }
        let data = jwtutil.decode(tokenId, req.options.secret)
        if (!data) {
            throw {
                status: 401,
                message: 'Bad JWT'
            }
        }
        try {
            const user = dbapi.loadUser(data.email)
            if (user) {
                if (isNotAllowed(user)) {
                    throw forbidden
                }
                req.user = user
                return true
            }
            else {
                throw {
                    status: 401,
                    message: 'User is not exist'
                }
            }
        }
        catch (err) {
            log.error('Could. not load user', err)
            throw {
                status: 401,
                message: 'Could not load user'
            }
        }
    }

    else if (req.headers.channel && req.headers.device) {
        let serial = req.headers.device
        return dbapi.loadDeviceBySerial(serial).then(device => {
            // Need to check that the channel is from this device or an endpoint check
            const internalJwt = jwtutil.encode({
                payload: {
                    email: device.owner.email,
                    name: device.owner.name
                },
                secret: req.options.secret
            })
            req.internalJwt = internalJwt
            return true
        })
    }
    else {
        throw {
            status: 401,
            message: 'Requires Authentication'
        }
    }
}
export {accessTokenAuth}
export default {
    accessTokenAuth: accessTokenAuth
}
