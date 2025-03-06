import util from 'util'
import events from 'events'
import chalk from 'chalk'

const innerLogger = new events.EventEmitter()
const Logger = {}

Logger.Level = {
    DEBUG: 1
    , VERBOSE: 2
    , INFO: 3
    , IMPORTANT: 4
    , WARNING: 5
    , ERROR: 6
    , FATAL: 7,
}
// Exposed for other modules
Logger.LevelLabel = {
    '1': 'DBG'
    , '2': 'VRB'
    , '3': 'INF'
    , '4': 'IMP'
    , '5': 'WRN'
    , '6': 'ERR'
    , '7': 'FTL',
}
Logger.globalIdentifier = '*'

/**
 * @constructor
 * @param {string} tag - name for logger
 */
function Log(tag) {
    this.tag = tag
    this.names = {
        '1': 'DBG'
        , '2': 'VRB'
        , '3': 'INF'
        , '4': 'IMP'
        , '5': 'WRN'
        , '6': 'ERR'
        , '7': 'FTL',
    }
    this.styles = {
        '1': 'grey'
        , '2': 'cyan'
        , '3': 'green'
        , '4': 'magenta'
        , '5': 'yellow'
        , '6': 'red'
        , '7': 'red',
    }
    this.localIdentifier = null
    events.EventEmitter.call(this)
}
util.inherits(Log, events.EventEmitter)

/**
 * Create a new logger
 * @param {string} tag - name for logger
 * @returns {Log} logger
 */
Logger.createLogger = function(tag) {
    return new Log(tag)
}
Logger.setGlobalIdentifier = function(identifier) {
    Logger.globalIdentifier = identifier
    return Logger
}
Log.Entry = function(timestamp, priority, tag, pid, identifier, message) {
    this.timestamp = timestamp
    this.priority = priority
    this.tag = tag
    this.pid = pid
    this.identifier = identifier
    this.message = message
}
Log.prototype.setLocalIdentifier = function(identifier) {
    this.localIdentifier = identifier
}
Log.prototype.debug = function() {
    this._write(this._entry(Logger.Level.DEBUG, arguments))
}
Log.prototype.verbose = function() {
    this._write(this._entry(Logger.Level.VERBOSE, arguments))
}
Log.prototype.info = function() {
    this._write(this._entry(Logger.Level.INFO, arguments))
}
Log.prototype.important = function() {
    this._write(this._entry(Logger.Level.IMPORTANT, arguments))
}
Log.prototype.warn = function() {
    this._write(this._entry(Logger.Level.WARNING, arguments))
}
Log.prototype.error = function() {
    this._write(this._entry(Logger.Level.ERROR, arguments))
}
Log.prototype.fatal = function() {
    this._write(this._entry(Logger.Level.FATAL, arguments))
}
Log.prototype._entry = function(priority, args) {
    return new Log.Entry(
        new Date(),
        priority,
        this.tag,
        process.pid,
        this.localIdentifier || Logger.globalIdentifier,
        util.format.apply(util, args)
    )
}
Log.prototype._format = function(entry) {
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
Log.prototype._name = function(priority) {
    return chalk[this.styles[priority]](this.names[priority])
}
/* eslint no-console: 0 */
Log.prototype._write = function(entry) {
    console.error(this._format(entry))
    this.emit('entry', entry)
    innerLogger.emit('entry', entry)
}

Logger.on = innerLogger.on

export default Logger
