import assert from 'assert'
import * as jws from 'jws'
import _ from 'lodash'
import {ONE_MONTH} from './apiutil.js'
export const encode = function(options) {
    assert.ok(options.payload, 'payload required')
    assert.ok(options.secret, 'secret required')
    let header = {
        alg: 'HS256',
        exp: Date.now() + ONE_MONTH
    }
    if (options.header) {
        header = _.merge(header, options.header)
    }
    return jws.sign({
        header: header,
        payload: options.payload,
        secret: options.secret
    })
}
export const decode = function(payload, secret) {
    if (!payload) {
        return null
    }
    if (!secret) {
        throw new Error('Secret is not set')
    }
    if (!jws.verify(payload, 'HS256', secret)) {
        return null
    }
    let decoded = jws.decode(payload, {
        json: true
    })
    let exp = decoded.header.exp
    if (exp && exp <= Date.now()) {
        return null
    }
    return decoded.payload
}
