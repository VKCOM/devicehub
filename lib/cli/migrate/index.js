/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/
import logger from '../../util/logger.js'
const log = logger.createLogger('cli:migrate')
import db from '../../db/index.js'
import dbapi from '../../db/api.js'
import * as apiutil from '../../util/apiutil.js'
import Promise from 'bluebird'


export const command = 'migrate'

export const describe = 'Migrates the database to the latest version.'

export const builder = function(yargs) {
    return yargs
}

export const handler = function() {
    return db.setup()
        .then(function() {
            return new Promise(function(resolve, reject) {
                setTimeout(function() {
                    // @ts-ignore
                    return dbapi.getGroupByIndex(apiutil.ROOT, 'privilege').then(function(group) {
                        if (!group) {
                            const env = {
                                STF_ROOT_GROUP_NAME: 'Common',
                                STF_ADMIN_NAME: 'administrator',
                                STF_ADMIN_EMAIL: 'administrator@fakedomain.com'
                            }
                            for (const i in env) {
                                if (process.env[i]) {
                                    env[i] = process.env[i]
                                }
                            }
                            return dbapi.createBootStrap(env)
                        }
                        return group
                    })
                        .then(function() {
                            resolve(true)
                        })
                        .catch(function(err) {
                            reject(err)
                        })
                }, 1000)
            })
        })
        .catch(function(err) {
            log.fatal('Migration had an error:', err.stack)
            process.exit(1)
        })
        .finally(function() {
            process.exit(0)
        })
}

export * as default from './index.js'
