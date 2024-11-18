import logger from '../../util/logger.js'
import rdb from './rdb.js'
import r from 'rethinkdb'
import * as db from '../../db/index.js'
import Promise from 'bluebird'
export const command = 'migrate-to-mongo'
export const describe = 'Migrates the database to mongoDB.'
export const builder = function(yargs) {
    return yargs
}
export const handler = function() {
    const log = logger.createLogger('cli:migrate-to-mongo')
    log.info('Starting migrate to mongodb')
    const tables = ['users', 'groups', 'logs', 'stats', 'accessTokens', 'devices', 'vncauth']
    function performMigrate() {
        return db.connect().then(client => {
            Promise.all(tables.map((table) => {
                return rdb.run(r.table(table)).then(cursor => {
                    return cursor.toArray()
                        .then(tableData => {
                            return client.collection(table).insertMany(tableData).then(stats => {
                                log.info('Migration result for ' + table + ' inserted ' + stats.insertedCount)
                            })
                        })
                        .catch(e => {
                            log.error('Error while migrating ' + table + ' ' + e)
                        })
                })
            }))
                .then(() => {
                    log.info('Migration ended')
                    process.exit(0)
                })
        })
    }
    performMigrate()
}
