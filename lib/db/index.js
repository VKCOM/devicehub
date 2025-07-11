import mongo from 'mongodb'
import _setup from './setup.js'
import srv from '../util/srv.js'
import EventEmitter from 'events'
import {SocketWrapper} from '../util/zmqutil.js'
import GroupChangeHandler from './handlers/group/index.js'
import * as zmqutil from '../util/zmqutil.js'
import Promise from 'bluebird'
import lifecycle from '../util/lifecycle.js'
import logger from '../util/logger.js'
import wireutil from '../wire/util.js'

const log = logger.createLogger('db')

const options = {
    // These environment variables are exposed when we --link to a
    // MongoDB container.
    url: process.env.MONGODB_PORT_27017_TCP || 'mongodb://127.0.0.1:27017',
    db: process.env.MONGODB_DB_NAME || 'stf',
    authKey: process.env.MONGODB_ENV_AUTHKEY,
    adbPortsRange: process.env.adbPortsRange || '29000-29999'
}

/** @type {{ init: (push?: SocketWrapper, pushdev?: SocketWrapper, channelRouter?: EventEmitter) => Promise<void> | void, isPrepared: boolean }[]} */
const handlers = [
    GroupChangeHandler
]

export default class DbClient {

    /** @type { mongo.Db } */
    static connection

    /**
     * Create a connection and initialize the change handlers for entities. \
     * Called once. \
     * \
     * Note: No longer needed to get collection. \
     * Use `DbClient.collection('name')` \
     * Or  `DbClient.groups`
     *
     * @param {SocketWrapper=} push
     * @param {SocketWrapper=} pushdev
     * @param {EventEmitter= } channelRouter
     * @param {boolean=      } groupsSheduler
     * @returns { globalThis.Promise<mongo.Db> } */
    static connect = async(push, pushdev, channelRouter, groupsSheduler = false) => {
        // Init entities change handlers
        if (push && pushdev && channelRouter) {
            for (const changeHandler of handlers) {
                if (!changeHandler.isPrepared) {
                    await changeHandler.init(push, pushdev, channelRouter)
                }
            }
        }

        if (groupsSheduler) {
            await GroupChangeHandler.initScheduler()
        }

        if (DbClient.connection) {
            return DbClient.connection
        }

        const records = await srv.resolve(options.url)
        if (!records.shift()) {
            throw new Error('No hosts left to try')
        }

        const client = new mongo.MongoClient(options.url, {monitorCommands: false})
        const conn = await client.connect()

        return DbClient.connection = conn.db(options.db)
    }

    static collection = (name) => DbClient.connection.collection(name)

    static get groups() {
        return DbClient.collection('groups')
    }

    static get users() {
        return DbClient.collection('users')
    }

    static get devices() {
        return DbClient.collection('devices')
    }

    /**
     * @param {{
       sub: SocketWrapper | string[]
       subdev: SocketWrapper | string[]
       push: SocketWrapper | string[]
       pushdev: SocketWrapper | string[]
       channelRouter?: EventEmitter
     }} args
     * @param {ReturnType<typeof logger.createLogger>=} _log
     * @returns { globalThis.Promise<{sub: SocketWrapper, subdev: SocketWrapper, push: SocketWrapper, pushdev: SocketWrapper, channelRouter: EventEmitter}> } */
    static async createZMQSockets({sub, subdev, push, pushdev, channelRouter}, _log = log) {
        if (Array.isArray(sub)) {
            const _sub = zmqutil.socket('sub')
            await Promise.all(sub.map(async(endpoint) => {
                try {
                    srv.attempt(
                        await srv.resolve(endpoint)
                        , async(record) => {
                            _log.info('Receiving input from "%s"', record.url)
                            _sub.connect(record.url)
                        }
                    )
                }
                catch (err) {
                    _log.fatal('Unable to connect to sub endpoint', err)
                    lifecycle.fatal()
                }
            }))
            sub = _sub
        }

        if (Array.isArray(subdev)) {
            const _subdev = zmqutil.socket('sub')
            await Promise.all(subdev.map(async(endpoint) => {
                try {
                    srv.attempt(
                        await srv.resolve(endpoint)
                        , async(record) => {
                            _log.info('Receiving input from "%s"', record.url)
                            _subdev.connect(record.url)
                        }
                    )
                }
                catch (err) {
                    _log.fatal('Unable to connect to subdev endpoint', err)
                    lifecycle.fatal()
                }
            }))
            subdev = _subdev
        }

        if (Array.isArray(push)) {
            const _push = zmqutil.socket('push')
            Promise.all(push.map(async(endpoint) => {
                try {
                    srv.attempt(
                        await srv.resolve(endpoint)
                        , async(record) => {
                            _log.info('Sending output to "%s"', record.url)
                            _push.connect(record.url)
                        }
                    )
                }
                catch (err) {
                    _log.fatal('Unable to connect to push endpoint', err)
                    lifecycle.fatal()
                }
            }))
            push = _push
        }

        if (Array.isArray(pushdev)) {
            const _pushdev = zmqutil.socket('push')
            Promise.all(pushdev.map(async(endpoint) => {
                try {
                    srv.attempt(
                        await srv.resolve(endpoint)
                        , async(record) => {
                            _log.info('Sending output to "%s"', record.url)
                            _pushdev.connect(record.url)
                        }
                    )
                }
                catch (err) {
                    _log.fatal('Unable to connect to pushdev endpoint', err)
                    lifecycle.fatal()
                }
            }))
            pushdev = _pushdev
        }

        if (!channelRouter) {
            channelRouter = new EventEmitter()
            ;[wireutil.global].forEach((channel) => {
                _log.info('Subscribing to permanent channel "%s"', channel)
                sub.subscribe(channel)
                subdev.subscribe(channel)
            })

            sub.on('message', (channel, data) => {
                channelRouter?.emit(channel.toString(), channel, data)
            })

            subdev.on('message', (channel, data) => {
                channelRouter?.emit(channel.toString(), channel, data)
            })
        }

        /** @type { {sub: SocketWrapper, subdev: SocketWrapper, push: SocketWrapper, pushdev: SocketWrapper, channelRouter: EventEmitter} } */
        return {sub, subdev, push, pushdev, channelRouter}
    }

    // Verifies that we can form a connection. Useful if it's necessary to make
    // sure that a handler doesn't run at all if the database is on a break. In
    // normal operation connections are formed lazily. In particular, this was
    // an issue with the processor unit, as it started processing messages before
    // it was actually truly able to save anything to the database. This lead to
    // lost messages in certain situations.
    static ensureConnectivity = (fn) => function() {
        let args = [].slice.call(arguments)
        return DbClient.connect().then(function() {
            return fn.apply(null, args)
        })
    }

    // Sets up the database
    static setup = () => DbClient.connect().then(conn => _setup(conn))
    static getRange = () => '20000-29999'
}
