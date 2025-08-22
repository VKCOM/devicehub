import util from 'util'
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

export const LogLevelLabel: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DBG',
    [LogLevel.VERBOSE]: 'VRB',
    [LogLevel.INFO]: 'INF',
    [LogLevel.IMPORTANT]: 'IMP',
    [LogLevel.WARNING]: 'WRN',
    [LogLevel.ERROR]: 'ERR',
    [LogLevel.FATAL]: 'FTL',
}

const innerLogger = new EventEmitter()

export interface LogEntry {
    timestamp: Date;
    priority: LogLevel;
    tag: string;
    pid: number;
    identifier: string;
    message: string;
}

export class Log extends EventEmitter {
    private tag: string
    private localIdentifier: string | null = null

    private readonly names: Record<LogLevel, string> = LogLevelLabel

    private readonly styles = {
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

    debug(...args: any[]): void {
        this._write(this._entry(LogLevel.DEBUG, args))
    }

    verbose(...args: any[]): void {
        this._write(this._entry(LogLevel.VERBOSE, args))
    }

    info(...args: any[]): void {
        this._write(this._entry(LogLevel.INFO, args))
    }

    important(...args: any[]): void {
        this._write(this._entry(LogLevel.IMPORTANT, args))
    }

    warn(...args: any[]): void {
        this._write(this._entry(LogLevel.WARNING, args))
    }

    error(...args: any[]): void {
        this._write(this._entry(LogLevel.ERROR, args))
    }

    fatal(...args: any[]): void {
        this._write(this._entry(LogLevel.FATAL, args))
    }

    private _entry(priority: LogLevel, args: any[]): LogEntry {
        return {
            timestamp: new Date(),
            priority,
            tag: this.tag,
            pid: process.pid,
            identifier: this.localIdentifier || globalLogger.globalIdentifier,
            message: util.format(...args),
        }
    }

    private _format(entry: LogEntry): string {
        return util.format(
            '%s %s/%s %d [%s] %s',
            chalk.grey(entry.timestamp.toJSON()),
            this._name(entry.priority),
            chalk.bold(entry.tag),
            entry.pid,
            entry.identifier,
            entry.message
        )
    }

    private _name(priority: LogLevel): string {
        const name = this.names[priority]
        const color = this.styles[priority]
        return chalk[color](name)
    }

    private _write(entry: LogEntry): void {

        console.error(this._format(entry))
        this.emit('entry', entry)
        innerLogger.emit('entry', entry)
    }
}
export const createLogger = (tag: string): Log => {
    return new Log(tag)
}

class Logger {
    Level = LogLevel
    LevelLabel = LogLevelLabel
    globalIdentifier = '*'
    createLogger = createLogger

    setGlobalIdentifier(identifier: string) {
        this.globalIdentifier = identifier
        return this
    }

    on = innerLogger.on.bind(innerLogger)
}
const globalLogger = new Logger()
export default globalLogger
