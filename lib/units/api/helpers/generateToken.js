import * as jwtutil from '../../../util/jwtutil.js'
import util from 'util'
import {v4 as uuidv4} from 'uuid'

const generateToken = (/** @type {{ email: string; name: string; }} */ user, /** @type {string} */ secret) => {
    const jwt = jwtutil.encode({
        payload: {
            email: user.email,
            name: user.name
        },
        secret: secret
    })
    const id = util.format('%s-%s', uuidv4(), uuidv4()).replace(/-/g, '')
    return {id: id, jwt: jwt}
}

export default generateToken
