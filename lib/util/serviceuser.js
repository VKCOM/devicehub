import db from '../db/index.js'
import dbapi from '../db/api.js'
import * as jwtutil from './jwtutil.js'
import util from 'util'
import {v4 as uuidv4} from 'uuid'
export const generate = async function(email, name, admin, secret) {
    await db.connect()

    const tokenTitle = 'serviceToken'
    let jwt = jwtutil.encode({
        payload: {
            email: email
            , name: name
        }
        , secret: secret
    })
    let tokenId = util.format('%s-%s', uuidv4(), uuidv4()).replace(/-/g, '')
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
