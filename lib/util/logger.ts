import util from "util";
import { EventEmitter } from "events";
import chalk from "chalk";

// Уровни логирования
export enum LogLevel {
    DEBUG = 1,
    VERBOSE = 2,
    INFO = 3,
    IMPORTANT = 4,
    WARNING = 5,
    ERROR = 6,
    FATAL = 7,
}

// Метки уровней логирования
export const LogLevelLabel: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: "DBG",
    [LogLevel.VERBOSE]: "VRB",
    [LogLevel.INFO]: "INF",
    [LogLevel.IMPORTANT]: "IMP",
    [LogLevel.WARNING]: "WRN",
    [LogLevel.ERROR]: "ERR",
    [LogLevel.FATAL]: "FTL",
};

// Внутренний эмиттер
const innerLogger = new EventEmitter();

export interface LogEntry {
    timestamp: Date;
    priority: LogLevel;
    tag: string;
    pid: number;
    identifier: string;
    message: string;
}

export class Log extends EventEmitter {
    private tag: string;
    private localIdentifier: string | null = null;

    private readonly names: Record<LogLevel, string> = LogLevelLabel;

    private readonly styles: Record<LogLevel, keyof typeof chalk> = {
        [LogLevel.DEBUG]: "grey",
        [LogLevel.VERBOSE]: "cyan",
        [LogLevel.INFO]: "green",
        [LogLevel.IMPORTANT]: "magenta",
        [LogLevel.WARNING]: "yellow",
        [LogLevel.ERROR]: "red",
        [LogLevel.FATAL]: "red",
    };

    constructor(tag: string) {
        super();
        this.tag = tag;
    }

    setLocalIdentifier(identifier: string): void {
        this.localIdentifier = identifier;
    }

    debug(...args: any[]): void {
        this._write(this._entry(LogLevel.DEBUG, args));
    }

    verbose(...args: any[]): void {
        this._write(this._entry(LogLevel.VERBOSE, args));
    }

    info(...args: any[]): void {
        this._write(this._entry(LogLevel.INFO, args));
    }

    important(...args: any[]): void {
        this._write(this._entry(LogLevel.IMPORTANT, args));
    }

    warn(...args: any[]): void {
        this._write(this._entry(LogLevel.WARNING, args));
    }

    error(...args: any[]): void {
        this._write(this._entry(LogLevel.ERROR, args));
    }

    fatal(...args: any[]): void {
        this._write(this._entry(LogLevel.FATAL, args));
    }

    private _entry(priority: LogLevel, args: any[]): LogEntry {
        return {
            timestamp: new Date(),
            priority,
            tag: this.tag,
            pid: process.pid,
            identifier: this.localIdentifier || Logger.globalIdentifier,
            message: util.format(...args),
        };
    }

    private _format(entry: LogEntry): string {
        return util.format(
            "%s %s/%s %d [%s] %s",
            chalk.grey(entry.timestamp.toJSON()),
            this._name(entry.priority),
            chalk.bold(entry.tag),
            entry.pid,
            entry.identifier,
            entry.message
        );
    }

    private _name(priority: LogLevel): string {
        const name = this.names[priority];
        const color = this.styles[priority];
        return chalk[color](name);
    }

    private _write(entry: LogEntry): void {
        // eslint-disable-next-line no-console
        console.error(this._format(entry));
        this.emit("entry", entry);
        innerLogger.emit("entry", entry);
    }
}
export const createLogger = (tag: string): Log => {
    return new Log(tag);
};
const Logger = {
    Level: LogLevel,
    LevelLabel: LogLevelLabel,
    globalIdentifier: "*",
    createLogger,

    setGlobalIdentifier(identifier: string): typeof Logger {
        Logger.globalIdentifier = identifier;
        return Logger;
    },

    on: innerLogger.on.bind(innerLogger),
};
export default Logger;
