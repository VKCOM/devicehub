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
    if (req.headers.authorization || req.cookies.token) {
        let format, tokenId, isCookie
        if (req.headers.authorization) {
            let authHeader = req.headers.authorization.split(' ')
            format = authHeader[0]
            tokenId = authHeader[1]
        }
        else {
            tokenId = req.cookies.token
            isCookie = true
        }
        if (format !== 'Bearer' && !isCookie) {
            log.error('Invalid Header Format or missed cookie')
            throw {
                status: 401
                , message: 'Authorization header should be in "Bearer $AUTH_TOKEN" format or in token cookie'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header or missed cookie')
            throw {
                status: 401
                , message: 'Bad Credentials'
            }
        }
        try {
            let jwt
            if (!isCookie) {
                const token = await dbapi.loadAccessToken(tokenId)
                if (!token) {
                    throw {
                        status: 401
                        , message: 'Bad Credentials'
                    }
                }
                jwt = token.jwt
            }
            else {
                jwt = tokenId
            }
            let data = jwtutil.decode(jwt, req.options.secret)
            if (!data) {
                throw {
                    status: 401
                    , message: 'Cant decode JWT'
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
                req.internalJwt = jwt
                return true
            }
            else {
                throw {
                    status: 404
                    , message: 'User is not exist'
                }
            }
        }
        catch (err) {
            throw {
                status: err.status ?? 500
                , message: err.message ?? 'Internal server error'
            }
        }
    }
    // Request is coming from browser app
    // TODO: Remove this once frontend become stateless
    //       and start sending request without session
    else if (req.session && req.session.jwt) {
        const user = await dbapi.loadUser(req.session.jwt.email)
        if (user) {
            req.user = user
            const internalJwt = jwtutil.encode({
                payload: {
                    email: req.session.jwt.email
                    , name: req.session.jwt.name
                }
                , secret: req.options.secret
            })
            req.internalJwt = internalJwt
            return true
        }
        else {
            throw {
                status: 500
                , message: 'Internal error'
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
