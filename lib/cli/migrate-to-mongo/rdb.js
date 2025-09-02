import r from 'rethinkdb'
import Promise from 'bluebird'
import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
const db = Object.create(null)
const log = logger.createLogger('rdb')
function connect() {
    let options = {
        // These environment variables are exposed when we --link to a
        // RethinkDB container.
        url: process.env.RETHINKDB_PORT_28015_TCP || 'tcp://127.0.0.1:28015',
        db: process.env.RETHINKDB_ENV_DATABASE || 'stf',
        authKey: process.env.RETHINKDB_ENV_AUTHKEY,
        adbPortsRange: process.env.adbPortsRange || '29000-29999'
    }
    return srv.resolve(options.url)
        .then(function(records) {
            function next() {
                let record = records.shift()
                if (!record) {
                    throw new Error('No hosts left to try')
                }
                log.info('Connecting to %s:%d', record.name, record.port)
                return r.connect({
                    host: record.name,
                    port: record.port,
                    db: options.db,
                    authKey: options.authKey
                })
                    .catch(r.Error.RqlDriverError, function() {
                        log.info('Unable to connect to %s:%d', record.name, record.port)
                        return next()
                    })
            }
            return next()
        })
}
// Export connection as a Promise
db.connect = function() {
    let connection
    let queue = []
    let goingDown = false
    lifecycle.observe(function() {
        goingDown = true
        if (connection) {
            return connection.close()
        }
    })
    function createConnection() {
        return connect()
            .then(function(conn) {
                connection = conn
                conn.on('close', function closeListener() {
                    log.warn('Connection closed')
                    connection = null
                    conn.removeListener('close', closeListener)
                    if (!goingDown) {
                        createConnection()
                    }
                })
                queue.splice(0).forEach(function(resolver) {
                    resolver.resolve(conn)
                })
                return conn
            })
            .catch(function(err) {
                log.fatal(err.message)
                lifecycle.fatal()
            })
    }
    createConnection()
    return new Promise(function(resolve, reject) {
        if (connection) {
            resolve(connection)
        }
        else {
            queue.push({
                resolve: resolve,
                reject: reject
            })
        }
    })
}
// Verifies that we can form a connection. Useful if it's necessary to make
// sure that a handler doesn't run at all if the database is on a break. In
// normal operation connections are formed lazily. In particular, this was
// an issue with the processor unit, as it started processing messages before
// it was actually truly able to save anything to the database. This lead to
// lost messages in certain situations.
db.ensureConnectivity = function(fn) {
    return function() {
        let args = [].slice.call(arguments)
        return db.connect().then(function() {
            return fn.apply(null, args)
        })
    }
}
// Close connection, we don't really care if it hasn't been created yet or not
db.close = function() {
    return db.connect().then(function(conn) {
        return conn.close()
    })
}
// Small utility for running queries without having to acquire a connection
db.run = function(q, options) {
    return db.connect().then(function(conn) {
        return q.run(conn, options)
    })
}
export default db
