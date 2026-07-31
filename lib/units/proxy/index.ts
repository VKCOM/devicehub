//
// proxy: the single central ROUTER (bind), the only public entry for the app
// side. It reads only the routing header frames and never decodes the Envelope
// body. All routing decisions live in the pure ProxyRouting module; this unit
// is just the ZMQ I/O glue.
//
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import {RouterSocket} from '../../util/zmqsocket.js'
import {ProxyRouting} from './routing.js'

interface Options {
    name?: string
    endpoints: {
        router: string
    }
}

export default async (options: Options) => {
    const log = logger.createLogger('proxy')
    if (options.name) {
        logger.setGlobalIdentifier(options.name)
    }

    const routing = new ProxyRouting()
    const router = new RouterSocket()

    // Fire-and-forget: with mandatory=true the send is in-memory and nearly
    // instant, so awaiting each one buys nothing. EHOSTUNREACH for a gone peer
    // is caught and logged per send.
    router.on('frames', (frames: Buffer[]) => {
        try {
            const sends = routing.route(frames)
            for (const {target, frames: out} of sends) {
                router.send([target, ...out]).catch((err: any) => {
                    log.warn('Undeliverable to %s: %s', target.toString(), err?.message)
                })
            }
        }
        catch (err: any) {
            log.error('Routing error: %s', err?.message || err)
        }
    })

    await router.bind(options.endpoints.router)
    log.info('proxy ROUTER listening on %s', options.endpoints.router)

    lifecycle.observe(() => router.close())

    // Returned so callers/tests can drive teardown explicitly.
    return {router, routing}
}
