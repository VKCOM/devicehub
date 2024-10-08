import assert from 'assert'
import * as jws from 'jws'
import _ from 'lodash'
export const encode = function(options) {
    assert.ok(options.payload, 'payload required')
    assert.ok(options.secret, 'secret required')
    var header = {
        alg: 'HS256'
    }
    if (options.header) {
        header = _.merge(header, options.header)
    }
    return jws.sign({
        header: header
        , payload: options.payload
        , secret: options.secret
    })
}
export const decode = function(payload, secret) {
    if (!jws.verify(payload, 'HS256', secret)) {
        return null
    }
    var decoded = jws.decode(payload, {
        json: true
    })
    var exp = decoded.header.exp
    if (exp && exp <= Date.now()) {
        return null
    }
    return decoded.payload
}
