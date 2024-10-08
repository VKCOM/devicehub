import cookieSession from 'cookie-session'
export default (function(options) {
    var session = cookieSession(options)
    return function(socket, next) {
        var req = socket.request
        var res = Object.create(null)
        session(req, res, next)
    }
})
