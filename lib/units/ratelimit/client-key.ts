import type {Request} from 'express'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/*
 * The client a request is counted against. Behind the local reverse proxy
 * (nginx, poorxy) every request comes from loopback, so the client is the
 * address the proxy puts in X-Real-IP. A client connecting directly could
 * forge that header: its own address is used instead.
 */
export const clientKey = (req: Request): string => {
    const remote = req.socket.remoteAddress ?? ''
    const realIp = req.headers['x-real-ip']

    if (LOOPBACK.has(remote) && typeof realIp === 'string' && realIp) {
        return realIp
    }
    return remote
}
