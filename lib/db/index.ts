import mongo from 'mongodb'
import _setup from './setup.js'
import srv from '../util/srv.js'
import GroupChangeHandler from './handlers/group/index.js'
import UserChangeHandler from './handlers/user/index.js'
import logger from '../util/logger.js'
import type {AppTransport} from '../wire/app-transport.js'
import type {TransactionManager} from '../wire/transmanager.js'

const log = logger.createLogger('db')

const options = {
    // These environment variables are exposed when we --link to a
    // MongoDB container.
    url: process.env.MONGODB_PORT_27017_TCP || 'mongodb://127.0.0.1:27017',
    db: process.env.MONGODB_DB_NAME || 'stf',
    authKey: process.env.MONGODB_ENV_AUTHKEY,
    adbPortsRange: process.env.adbPortsRange || '29000-29999',
}

const handlers: {
    init: (
        transport: AppTransport,
        txmanager?: TransactionManager
    ) => Promise<void> | void;
    isPrepared: boolean;
}[] = [GroupChangeHandler, UserChangeHandler]

export default class DbClient {
    static connection: mongo.Db

    static async connect(): Promise<mongo.Db>;
    static async connect(opts: {
        transport?: AppTransport;
        txmanager?: TransactionManager;
        groupsScheduler?: boolean;
    }): Promise<mongo.Db>;

    /**
     * Create a connection and initialize the change handlers for entities.
     * Called once.
     *
     * The change handlers publish broadcast-to-app events
     * (GroupChange UserChange) over the app-side ROUTER/DEALER transport, and the group
     * handler runs device transactions (Ungroup) via the TransactionManager. A
     * unit that owns those handlers passes its `transport` (and `txmanager`);
     * units that only read the DB call `connect()` with no transport, leaving the
     * handlers as no-ops.
     *
     * Note: No longer needed to get collection.
     * Use `DbClient.collection('name')`
     * Or  `DbClient.groups`
     */
    static async connect(
        opts: {
            transport?: AppTransport;
            txmanager?: TransactionManager;
            groupsScheduler?: boolean;
        } = {}
    ): Promise<mongo.Db> {
        // Init entities change handlers
        if (opts.transport) {
            for (const changeHandler of handlers) {
                if (!changeHandler.isPrepared) {
                    await changeHandler.init(
                        opts.transport,
                        opts.txmanager
                    )
                }
            }
        }

        if (opts.groupsScheduler) {
            await GroupChangeHandler.initScheduler()
        }

        if (DbClient.connection) {
            return DbClient.connection
        }

        const records = await srv.resolve(options.url) // why?
        if (!records.shift()) {
            throw new Error('No hosts left to try')
        }

        // what?
        const client = new mongo.MongoClient(options.url, {
            monitorCommands: false,
        })
        const conn = await client.connect()

        return (DbClient.connection = conn.db(options.db))
    }

    static collection = (name: string) => DbClient.connection.collection(name)

    static get groups() {
        return DbClient.collection('groups')
    }

    static get users() {
        return DbClient.collection('users')
    }

    static get devices() {
        return DbClient.collection('devices')
    }

    static get teams() {
        return DbClient.collection('teams')
    }

    // Verifies that we can form a connection. Useful if it's necessary to make
    // sure that a handler doesn't run at all if the database is on a break. In
    // normal operation connections are formed lazily. In particular, this was
    // an issue with the processor unit, as it started processing messages before
    // it was actually truly able to save anything to the database. This lead to
    // lost messages in certain situations.
    static ensureConnectivity = <T extends (...args: any[]) => any>(fn: T) =>
        async(...args: Parameters<T>): Promise<ReturnType<T>> => {
            await DbClient.connect();
            log.info("Db is up");
            return fn(...args);
        }

    // Sets up the database
    static setup = () => DbClient.connect().then((conn) => _setup(conn))
    static getRange = () => '20000-29999'
}
