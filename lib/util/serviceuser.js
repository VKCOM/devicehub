import * as dbapi from '../db/api.js'
import * as jwtutil from './jwtutil.js'
import util from 'util'
import uuid from 'uuid'
export const generate = function(email, name, admin, secret) {
    const tokenTitle = 'serviceToken'
    let jwt = jwtutil.encode({
        payload: {
            email: email
            , name: name
        }
        , secret: secret
    })
    let tokenId = util.format('%s-%s', uuid.v4(), uuid.v4()).replace(/-/g, '')
    return dbapi.createUser(email, name, '127.0.0.1').then(stats => {
        if (!stats.insertedId) {
            throw Error('User is not created in database. Check MongoDB logs')
        }
        let userInfo = {
            email: email
        }
        return dbapi.saveUserAccessToken(email, {
            title: tokenTitle
            , id: tokenId
            , jwt: jwt
        }).then(() => {
            userInfo.token = tokenId
            if (admin) {
                return dbapi.grantAdmin(email).then(() => {
                    return userInfo
                })
            }
            return userInfo
        })
    })
}
