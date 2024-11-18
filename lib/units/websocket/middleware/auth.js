import * as dbapi from '../../../db/api.js'
import * as jwtutil from '../../../util/jwtutil.js'
import * as cookie from 'cookie'

export default (function(options) {
    return function(socket, next) {
        let req = socket.request
        let token
        const cookies = cookie.parse(req.headers.cookie)
        if (cookies.token) {
            token = jwtutil.decode(cookies.token, options.secret)
        }
        else {
            token = req.session.jwt
        }
        if (token) {
            return dbapi.loadUser(token.email)
                .then(function(user) {
                    if (user) {
                        req.user = user
                        next()
                    }
                    else {
                        next(new Error('Invalid user'))
                    }
                })
                .catch(next)
        }
        else {
            next(new Error('Missing authorization token'))
        }
    }
})
