import util from 'util'
import uuid from 'uuid'
import * as dbapi from '../db/api.js'
export const generate = function() {
    const name = 'fakeuser-' + util.format('%s', uuid.v4()).replace(/-/g, '')
    const email = name + '@openstf.com'
    return dbapi.createUser(email, name, '127.0.0.1').return(email)
}
