import proxyaddr from 'proxy-addr'
export default (function(options) {
    return function(socket, next) {
        var req = socket.request
        req.ip = proxyaddr(req, options.trust)
        next()
    }
})
