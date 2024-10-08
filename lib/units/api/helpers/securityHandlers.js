/* eslint-disable no-throw-literal */
import dbapi from '../../../db/api.mjs'
import * as jwtutil from '../../../util/jwtutil.js'
import logger from '../../../util/logger.js'
import apiutil from '../../../util/apiutil.js'
const log = logger.createLogger('api:helpers:securityHandlers')
// Specifications: https://tools.ietf.org/html/rfc6750#section-2.1
async function accessTokenAuth(req, scopes, definition) {
    console.log('!accessTokenAuth')
    if (process.env.MAINTENANCE_MODE === '1') {
        throw {
            status: 500
            , success: false
            , description: 'Maintenance Mode. Please wait'
        }
    }
    let operationTag
    if (req.operationDoc) {
        operationTag = req.operationDoc.tags
    }
    else {
        operationTag = 'not-swagger'
    }
    if (req.headers.authorization) {
        let authHeader = req.headers.authorization.split(' ')
        let format = authHeader[0]
        let tokenId = authHeader[1]
        if (format !== 'Bearer') {
            return {
                status: 401
                , success: false
                , description: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header')
            throw {
                status: 401
                , success: false
                , description: 'Bad Credentials'
            }
        }
        try {
            const token = await dbapi.loadAccessToken(tokenId)
            if (!token) {
                throw {
                    status: 401
                    , success: false
                    , description: 'Bad Credentials'
                }
            }
            let jwt = token.jwt
            let data = jwtutil.decode(jwt, req.options.secret)
            if (!data) {
                throw {
                    status: 401
                    , success: false
                    , description: 'Cant decode JWT'
                }
            }
            const user = await dbapi.loadUser(data.email)
            if (user) {
                if (user.privilege === apiutil.USER && operationTag.indexOf('admin') > -1) {
                    throw {
                        status: 403
                        , success: false
                        , description: 'Forbidden: privileged operation (admin)'
                    }
                }
                req.user = user
                req.internalJwt = jwt
                return true
            }
            else {
                throw {
                    status: 404
                    , success: false
                    , description: 'User is not exist'
                }
            }
        }
        catch (err) {
            log.error('Failed to load user or token: ', err)
            throw err
        }
    }
    // Request is coming from browser app
    // TODO: Remove this once frontend become stateless
    //       and start sending request without session
    else if (req.session && req.session.jwt) {
        const user = await dbapi.loadUser(req.session.jwt.email)
        console.log(user)
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
                , success: false
                , description: 'Internal Server Error'
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
                , success: false
                , description: 'Authorization header should be in "Internal $AUTH_TOKEN" format'
            }
        }
        if (!tokenId) {
            log.error('Bad Access Token Header')
            throw {
                status: 401
                , success: false
                , description: 'Bad Credentials'
            }
        }
        let data = jwtutil.decode(tokenId, req.options.secret)
        if (!data) {
            throw {
                status: 401
                , success: false
                , description: 'Cant decode JWT'
            }
        }
        try {
            const user = dbapi.loadUser(data.email)
            if (user) {
                if (user.privilege === apiutil.USER && operationTag.indexOf('admin') > -1) {
                    throw {
                        status: 403
                        , success: false
                        , description: 'Forbidden: privileged operation (admin)'
                    }
                }
                req.user = user
                return true
            }
            else {
                throw {
                    status: 404
                    , success: false
                    , description: 'User is not exist'
                }
            }
        }
        catch (err) {
            logger.error('Could. not load user', err)
            throw {
                status: 401
                , success: false
                , description: 'Could not load user'
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
            , success: false
            , description: 'Requires Authentication'
        }
    }
}
export {accessTokenAuth}
export default {
    accessTokenAuth: accessTokenAuth
}
