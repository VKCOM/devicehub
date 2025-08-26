import EventEmitter from "node:events";
import logger from "./logger.ts";

const log = logger.createLogger("util:lifecycle");

type LifecycleObserver = () => Promise<unknown> | unknown;

export default new (class Lifecycle {
    cleanups: LifecycleObserver[] = [];
    ending = false;

    constructor() {
        process.on("SIGINT", this.graceful.bind(this));
        process.on("SIGTERM", this.graceful.bind(this));
    }

    share(name, emitter: EventEmitter, options) {
        emitter.on("end", () => {
            if (!this.ending) {
                log.fatal(`${name} ended; we shall share its fate`)
                this.fatal();
            }
        });

        emitter.on("error", (err) => {
            if (!this.ending) {
                log.fatal(`${name} had an error ${err.stack}`)
                this.fatal();
            }
        });

        if (emitter.end) {
            this.observe(() => {
                emitter.end();
            });
        }
        return emitter;
    }

    graceful(err: Error) {
        log.info(`Winding down for graceful exit ${err || ''}`)
        if (this.ending) {
            log.error(
                "Repeated gracefull shutdown request. Exiting immediately."
            );
            process.exit(1);
        }

        this.ending = true;
        return Promise.all(this.cleanups.map((fn) => fn())).then(() =>
            process.exit(0)
        );
    }

    fatal(err?: Error): never {
        log.fatal(`Shutting down due to fatal error ${err || ''}`)
        this.ending = true;
        process.exit(1);
    }

    observe(cleanupFn: LifecycleObserver) {
        this.cleanups.push(cleanupFn);
    }
})();
