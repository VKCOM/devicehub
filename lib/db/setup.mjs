import Promise from 'bluebird'
import logger from '../util/logger.js'
import tables from './tables.mjs'

export default function(conn) {
  let log = logger.createLogger('db:setup')

  function alreadyExistsError(err) {
    return err.msg && err.msg.indexOf('already exists') !== -1
  }

  function noMasterAvailableError(err) {
    return err.msg && err.msg.indexOf('No master available') !== -1
  }

  function createTable(table, options) {
    let index = {}
    index[options.primaryKey] = 1

      return conn.createCollection(table, {changeStreamPreAndPostImages: {enabled: true}})
        .then(function() {
          log.info('Table "%s" created', table)
          return conn.collection(table).createIndex(
              index
              , {
                unique: true
              }
        )
        })
        .catch(alreadyExistsError, function() {
          log.info('Table "%s" already exists', table)
          return Promise.resolve()
        })
        .catch(noMasterAvailableError, function() {
          return Promise.delay(1000).then(function() {
            return createTable(table, options)
          })
        })
  }


  return Promise.all(Object.keys(tables).map(function(table) {
    return createTable(table, tables[table])
  })).return(conn)
}
