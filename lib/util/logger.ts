import {printf} from 'fast-printf'
import {EventEmitter} from 'events'
import chalk from 'chalk'

export enum LogLevel {
    DEBUG = 1,
    VERBOSE = 2,
    INFO = 3,
    IMPORTANT = 4,
    WARNING = 5,
    ERROR = 6,
    FATAL = 7,
}

const innerLogger = new EventEmitter()

type LogArguments = [string, ...any[]]

export interface LogEntry {
    unit: string;
    timestamp: Date;
    priority: LogLevel;
    tag: string;
    pid: number;
    identifier: string;
    args: LogArguments;
}

export class Log extends EventEmitter {
    private tag: string
    private localIdentifier: string | null = null

    // Track stdout backpressure state
    private static stdoutBlocked = false
    private static pendingWrites: string[] = []
    private static drainListenerAttached = false

    private static readonly unitColors: Record<string, chalk.ChalkChain[]> = {
        websocket: [chalk.gray, chalk.bgBlack],
        'groups-engine': [chalk.gray, chalk.bgBlack],
        poorxy: [chalk.gray, chalk.bgBlack],
        api: [chalk.green, chalk.bgGreen],
        triproxy: [chalk.magenta, chalk.bgMagenta],
        processor: [chalk.red, chalk.bgRed],
        provider: [chalk.blue, chalk.bgBlue],
        device: [chalk.cyan, chalk.bgCyan],
    }

    private static readonly names: Record<LogLevel, string> = {
        [LogLevel.DEBUG]: 'DBG',
        [LogLevel.VERBOSE]: 'VRB',
        [LogLevel.INFO]: 'INF',
        [LogLevel.IMPORTANT]: 'IMP',
        [LogLevel.WARNING]: 'WRN',
        [LogLevel.ERROR]: 'ERR',
        [LogLevel.FATAL]: 'FTL',
    }

    private static readonly styles = {
        [LogLevel.DEBUG]: 'grey',
        [LogLevel.VERBOSE]: 'cyan',
        [LogLevel.INFO]: 'green',
        [LogLevel.IMPORTANT]: 'magenta',
        [LogLevel.WARNING]: 'yellow',
        [LogLevel.ERROR]: 'red',
        [LogLevel.FATAL]: 'red',
    } as const

    constructor(tag: string) {
        super()
        this.tag = tag
    }

    setLocalIdentifier(identifier: string): void {
        this.localIdentifier = identifier
    }

    debug(...args: LogArguments): void {
        this._write(this._entry(LogLevel.DEBUG, args))
    }

    verbose(...args: LogArguments): void {
        this._write(this._entry(LogLevel.VERBOSE, args))
    }

    info(...args: LogArguments): void {
        this._write(this._entry(LogLevel.INFO, args))
    }

    important(...args: LogArguments): void {
        this._write(this._entry(LogLevel.IMPORTANT, args))
    }

    warn(...args: LogArguments): void {
        this._write(this._entry(LogLevel.WARNING, args))
    }

    error(...args: LogArguments): void {
        this._write(this._entry(LogLevel.ERROR, args))
    }

    fatal(...args: LogArguments): void {
        this._write(this._entry(LogLevel.FATAL, args))
    }

    private _entry(priority: LogLevel, args: LogArguments): LogEntry {
        return {
            unit: 'unknown',
            timestamp: new Date(),
            priority,
            tag: this.tag,
            pid: process.pid,
            identifier: this.localIdentifier || '*',
            args
        }
    }

    private _format(entry: LogEntry): string {
        for (let i = 0; i < entry.args?.length || 0; i++) {
            if (typeof entry.args[i] !== 'string') {
                entry.args[0] = JSON.stringify(entry.args[0])
            }
        }

        const [fg, bg] = Log.unitColors[entry.unit] ?? [chalk.yellow, chalk.bgYellow]
        return (
            `${chalk.grey(entry.timestamp.toJSON())} ${fg(bg(entry.unit))} ${this._name(entry.priority)}/${chalk.bold(entry.tag)} ${entry.pid} [${entry.identifier}] ${printf(...entry.args)}\n`
        )
    }

    private _name(priority: LogLevel): string {
        const name = Log.names[priority]
        const color = Log.styles[priority]
        return chalk[color](name)
    }

    private _write(entry: LogEntry): void {
        setImmediate(() => {
            const output = this._format(entry)

            // Emit events immediately
            this.emit('entry', entry)
            innerLogger.emit('entry', entry)

            // Handle stdout backpressure
            if (Log.stdoutBlocked) {
                // If stdout is blocked, queue the output
                Log.pendingWrites.push(output)
                return
            }

            // Try to write directly to stdout
            const success = process.stdout.write(output)
            if (!success) {
                // stdout buffer is full, set up drain listener if not already done
                Log.stdoutBlocked = true
                Log.setupDrainListener()
            }
        })
    }

    private static setupDrainListener(): void {
        if (Log.drainListenerAttached) {
            return
        }

        Log.drainListenerAttached = true
        process.stdout.once('drain', () => {
            Log.drainListenerAttached = false
            Log.stdoutBlocked = false

            // Flush any pending writes
            while (Log.pendingWrites.length > 0) {
                const output = Log.pendingWrites.shift()!
                const success = process.stdout.write(output)
                if (!success) {
                    // stdout is blocked again
                    Log.stdoutBlocked = true
                    Log.setupDrainListener()
                    break
                }
            }
        })
    }
}
export const createLogger = (tag: string): Log => {
    return new Log(tag)
}

class Logger {
    Level = LogLevel
    unit = 'unknown'
    globalIdentifier = '*'
    createLogger = createLogger

    setGlobalIdentifier(identifier: string) {
        this.globalIdentifier = identifier
        return this
    }

    on = innerLogger.on.bind(innerLogger)
}

const consoleLogger = createLogger('console')
console.log = consoleLogger.info.bind(consoleLogger)
console.error = consoleLogger.error.bind(consoleLogger)

export default new Logger()
