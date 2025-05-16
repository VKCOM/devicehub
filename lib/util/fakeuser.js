import util from 'util'
import {v4 as uuidv4} from 'uuid'
import dbapi from '../db/api.js'
export const generate = function() {
    const name = 'fakeuser-' + util.format('%s', uuidv4()).replace(/-/g, '')
    const email = name + '@openstf.com'
    return dbapi.createUser(email, name, '127.0.0.1').then(() => email)
}
