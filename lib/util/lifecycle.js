import Promise from 'bluebird'
import logger from './logger.js'

const log = logger.createLogger('util:lifecycle')

export default new class Lifecycle {
    observers = []
    ending = false

    constructor() {
        process.on('SIGINT', this.graceful.bind(this))
        process.on('SIGTERM', this.graceful.bind(this))
    }

    share(name, emitter, options) {
        const opts = Object.assign({
            end: true, error: true
        }, options)

        if (opts.end) {
            emitter.on('end', () => {
                if (!this.ending) {
                    log.fatal(`${name} ended; we shall share its fate`)
                    this.fatal()
                }
            })
        }

        if (opts.error) {
            emitter.on('error', (err) => {
                if (!this.ending) {
                    log.fatal(`${name} had an error ${err.stack}`)
                    this.fatal()
                }
            })
        }

        if (emitter.end) {
            this.observe(() => {
                emitter.end()
            })
        }
        return emitter
    }

    graceful(err) {
        log.info(`Winding down for graceful exit ${err || ''}`)
        if (this.ending) {
            log.error('Repeated gracefull shutdown request. Exiting immediately.')
            process.exit(1)
        }

        this.ending = true
        return Promise.all(this.observers.map(fn => fn()))
            .then(() => process.exit(0))
    }

    fatal(err) {
        log.fatal(`Shutting down due to fatal error ${err || ''}`)
        this.ending = true
        process.exit(1)
    }

    observe(promise) {
        this.observers.push(promise)
    }
}()
