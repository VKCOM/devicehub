import util from 'util'
import uuid from 'uuid'
import dbapi from '../db/api.mjs'
export const generate = function() {
    const name = 'fakeuser-' + util.format('%s', uuid.v4()).replace(/-/g, '')
    const email = name + '@openstf.com'
    return dbapi.createUser(email, name, '127.0.0.1').return(email)
}
