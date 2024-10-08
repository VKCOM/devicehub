import mongo from 'mongodb'

import _setup from './setup.mjs'
import logger from '../util/logger.js'
import lifecycle from '../util/lifecycle.js'
import srv from '../util/srv.js'
const log = logger.createLogger('db')

let mongoClient
let options = {
  // These environment variables are exposed when we --link to a
  // MongoDB container.
  url: process.env.MONGODB_PORT_27017_TCP || 'mongodb://127.0.0.1:27017'
  , db: process.env.MONGODB_DB_NAME || 'stf'
  , authKey: process.env.MONGODB_ENV_AUTHKEY
  , adbPortsRange: process.env.adbPortsRange || '29000-29999'
}

function _connect() {
  return srv.resolve(options.url)
    .then(records => {
      let record = records.shift()

      if (!record) {
        throw new Error('No hosts left to try')
      }
      const client = new mongo.MongoClient(options.url, {monitorCommands: true})
      client.on('commandFailed', (event) => log.info('Command faled: ' + JSON.stringify(event)))
      if (mongoClient) {
        return mongoClient
      }
      else {
        mongoClient = client.connect()
        return mongoClient
      }
    })
}

export function connect() {
  return _connect()
    .then(function(client) {
      return client.db(options.db)
    })
    .catch(function(err) {
      log.fatal(err.message)
      lifecycle.fatal()
    })
}

// Verifies that we can form a connection. Useful if it's necessary to make
// sure that a handler doesn't run at all if the database is on a break. In
// normal operation connections are formed lazily. In particular, this was
// an issue with the processor unit, as it started processing messages before
// it was actually truly able to save anything to the database. This lead to
// lost messages in certain situations.
export function ensureConnectivity(fn) {
  return function() {
    let args = [].slice.call(arguments)
    return connect().then(function() {
      return fn.apply(null, args)
    })
  }
}


// Sets up the database
export function setup() {
  return connect().then(function(conn) {
    return _setup(conn)
  })
}

export function getRange() {
  return '20000-29999'
}

export * as default from './index.mjs'
