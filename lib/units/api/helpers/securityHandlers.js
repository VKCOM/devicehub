/* eslint-disable no-throw-literal */
import * as dbapi from '../../../db/api.js'
import * as jwtutil from '../../../util/jwtutil.js'
import logger from '../../../util/logger.js'
import * as apiutil from '../../../util/apiutil.js'
const log = logger.createLogger('api:helpers:securityHandlers')
// Specifications: https://tools.ietf.org/html/rfc6750#section-2.1
async function accessTokenAuth(req) {
    let operationTag
    if (req.operationDoc) {
        operationTag = req.operationDoc.tags
    }
    else {
        operationTag = 'not-swagger'
    }
    if (req.headers.authorization) {
        const authHeader = req.headers.authorization.split(' ')
        const format = authHeader[0]
        const tokenId = authHeader[1]
        if (format !== 'Bearer') {
            log.error('Invalid Header Format')
            throw {
                status: 401
                , message: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header or missed cookie')
            throw {
                status: 401
                , message: 'No Credentials'
            }
        }
        try {
            let data
            try {
                const jwt = tokenId
                data = jwtutil.decode(jwt, req.options.secret)
            }
            catch(e) {
                const token = await dbapi.loadAccessToken(tokenId)
                if (!token) {
                    throw {
                        status: 401
                        , message: 'Unknown token'
                    }
                }
                data = jwtutil.decode(token.jwt, req.options.secret)
            }
            if (data === null) {
                throw {
                    status: 401
                    , message: 'Bad token'
                }
            }
            const user = await dbapi.loadUser(data.email)
            if (user) {
                if (user.privilege === apiutil.USER && operationTag.indexOf('admin') > -1) {
                    throw {
                        status: 403
                        , message: 'Forbidden: privileged operation (admin)'
                    }
                }
                req.user = user
                req.internalJwt = tokenId
                return true
            }
            else {
                await dbapi.saveUserAfterLogin({
                    name: data.name
                    , email: data.email
                    , ip: req.ip
                })
                const user = await dbapi.loadUser(data.email)
                req.user = user
                req.internalJwt = tokenId
                return true
            }
        }
        catch (err) {
            log.error(err)
            throw {
                status: err.status ?? 500
                , message: err.message ?? 'Internal server error (auth)'
            }
        }
    }
    else if (req.headers.internal) {
        let authHeader = req.headers.internal.split(' ')
        let format = authHeader[0]
        let tokenId = authHeader[1]
        if (format !== 'Internal') {
            throw {
                status: 401
                , message: 'Authorization header should be in "Internal $AUTH_TOKEN" format'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header')
            throw {
                status: 401
                , message: 'Bad Credentials'
            }
        }
        let data = jwtutil.decode(tokenId, req.options.secret)
        if (!data) {
            throw {
                status: 401
                , message: 'Bad JWT'
            }
        }
        try {
            const user = dbapi.loadUser(data.email)
            if (user) {
                if (user.privilege === apiutil.USER && operationTag.indexOf('admin') > -1) {
                    throw {
                        status: 403
                        , message: 'Forbidden: privileged operation (admin)'
                    }
                }
                req.user = user
                return true
            }
            else {
                throw {
                    status: 401
                    , message: 'User is not exist'
                }
            }
        }
        catch (err) {
            log.error('Could. not load user', err)
            throw {
                status: 401
                , message: 'Could not load user'
            }
        }
    }
    else if (req.headers.channel && req.headers.device) {
        let serial = req.headers.device
        return dbapi.loadDeviceBySerial(serial).then(device => {
            // Нужна проверка что канал именно от этого девайса или проверочки на эндпоинт
            const internalJwt = jwtutil.encode({
                payload: {
                    email: device.owner.email
                    , name: device.owner.name
                }
                , secret: req.options.secret
            })
            req.internalJwt = internalJwt
            return true
        })
    }
    else {
        throw {
            status: 401
            , message: 'Requires Authentication'
        }
    }
}
export {accessTokenAuth}
export default {
    accessTokenAuth: accessTokenAuth
}
