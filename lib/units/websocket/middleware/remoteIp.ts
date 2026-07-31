import type {Socket} from 'socket.io'

// TODO: switch dep
// @ts-ignore
import proxyaddr from 'proxy-addr'

interface RemoteIpOptions {
    trust: proxyaddr.TrustFunction
}

export default (options: RemoteIpOptions) => {
    return (socket: Socket, next: (err?: Error) => void) => {
        const req = socket.request as any
        req.ip = proxyaddr(req, options.trust)
        next()
    }
}
