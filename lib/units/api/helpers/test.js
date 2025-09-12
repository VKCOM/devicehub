import * as jwtutil from '../../../util/jwtutil.js'

const a = jwtutil.encode({
    payload: {
        email: user.email,
        name: user.name
    },
    secret: secret
})

console.log(a)
