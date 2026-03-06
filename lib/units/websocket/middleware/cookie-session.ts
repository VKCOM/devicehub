import cookieSession from 'cookie-session'
import type {Socket} from 'socket.io'

interface CookieSessionOptions {
    name: string
    keys: string[]
}

export default (options: CookieSessionOptions) => {
    const session = cookieSession(options)
    return (socket: Socket, next: (err?: Error) => void) => {
        const req = socket.request
        const res = Object.create(null)
        session(req as any, res, next as any)
    }
}
