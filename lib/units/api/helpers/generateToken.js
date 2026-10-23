import * as jwtutil from '../../../util/jwtutil.js'
import {ONE_MONTH} from '../../../util/apiutil.js'
import util from 'util'
import {v4 as uuidv4} from 'uuid'

/* Access token lifetimes in months; 0 never expires */
export const ACCESS_TOKEN_LIFETIMES = [0, 1, 2, 3]

const generateToken = (/** @type {{ email: string; name: string; }} */ user, /** @type {string} */ secret, lifetime = 0) => {
    if (!ACCESS_TOKEN_LIFETIMES.includes(lifetime)) {
        throw new Error(`Invalid access token lifetime: ${lifetime}`)
    }

    const id = util.format('%s-%s', uuidv4(), uuidv4()).replace(/-/g, '')
    const expiresAt = lifetime ? Date.now() + lifetime * ONE_MONTH : null
    const jwt = jwtutil.encode({
        payload: {
            email: user.email,
            name: user.name,
            // Lets the token be revoked by deleting it
            jti: id
        },
        secret: secret,
        exp: expiresAt
    })
    return {id: id, jwt: jwt, expiresAt: expiresAt}
}

export default generateToken
