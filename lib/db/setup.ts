import {Db, MongoServerError} from 'mongodb'
import logger from '../util/logger.js'
import tables from './tables.ts'

interface TableOptions {
    primaryKey: string;
}

export default async function setupDb(conn: Db): Promise<Db> {
    const log = logger.createLogger('db:setup')

    async function createTable(
        table: string,
        options: TableOptions
    ): Promise<void> {
        const index: Record<string, 1> = {[options.primaryKey]: 1}

        try {
            await conn.createCollection(table, {
                changeStreamPreAndPostImages: {enabled: true},
            })

            log.info('Table "%s" created', table)

            await conn.collection(table).createIndex(index, {unique: true})
        }
        catch (err) {
            if(err instanceof MongoServerError) {
                if(err.message.includes('already exists')) {
                    log.info('Table "%s" already exists', table)
                    return
                }
                else if (err.message.includes('No master available')) {
                    await new Promise((resolve) => setTimeout(resolve, 1000))
                    return createTable(table, options) // retry
                }
            }
        }
    }

    // Create all tables in parallel
    await Promise.all(
        Object.entries(tables).map(([table, options]) =>
            createTable(table, options as TableOptions)
        )
    )

    return conn
}
