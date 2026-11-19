import EventEmitter from 'node:events'
import logger from './logger.ts'

const log = logger.createLogger('util:lifecycle')

type LifecycleObserver = () => Promise<unknown> | unknown

export default new (class Lifecycle {
    cleanups: LifecycleObserver[] = []
    cleanupsFatal: LifecycleObserver[] = []
    ending = false

    constructor() {
        process.on("SIGINT", this.graceful.bind(this))
        process.on("SIGTERM", this.graceful.bind(this))
    }

    share(name: string, emitter: EventEmitter) {
        emitter.on("end", () => {
            if (!this.ending) {
                log.fatal(`${name} ended we shall share its fate`)
                this.fatal()
            }
        })

        emitter.on("error", (err) => {
            if (!this.ending) {
                log.fatal(`${name} had an error ${err.stack}`)
                this.fatal()
            }
        })

        if ('end' in emitter) {
            this.observe(() => {
                if(typeof emitter.end === 'function') {
                    emitter.end()
                }
            })
        }
        return emitter
    }

    graceful(err: Error) {
        log.info(`Winding down for graceful exit ${err || ''}`)
        if (this.ending) {
            log.error(
                "Repeated gracefull shutdown request. Exiting immediately."
            )
            process.exit(1)
        }

        this.ending = true
        return Promise.all(this.cleanups.map((fn) => fn())).then(() =>
            process.exit(0)
        )
    }

    // @ts-ignore
    fatal(err?: Error | string): never {
        log.fatal(`Shutting down due to fatal error ${err || ''}`)
        this.ending = true
        // Fatal shutdown used to run only cleanupsFatal. Device workers put
        // their sockets and child processes in the normal cleanup list, so a
        // fatal exit left minicap/STFService/reverse-helper processes behind
        // on the phone. The next worker then inherited their abstract sockets.
        // Publish the fatal presence first (while transport is alive), then
        // release all ordinary resources before exiting.
        Promise.allSettled(this.cleanupsFatal.map((fn) => fn()))
            .then(() => Promise.allSettled(this.cleanups.map((fn) => fn())))
            .then(() => process.exit(1))
    }

    observe(cleanupFn: LifecycleObserver) {
        this.cleanups.push(cleanupFn)
    }

    observeFatal(cleanupFn: LifecycleObserver) {
        this.cleanupsFatal.push(cleanupFn)
    }
})()
