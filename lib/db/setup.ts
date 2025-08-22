import {Db} from 'mongodb'
import logger from '../util/logger.ts'
import tables from './tables.ts'

interface TableOptions {
    primaryKey: string;
}

export default async function setupDb(conn: Db): Promise<Db> {
    const log = logger.createLogger('db:setup')

    function alreadyExistsError(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'msg' in err &&
            typeof (err as any).msg === 'string' &&
            (err as any).msg.includes('already exists')
        )
    }

    function noMasterAvailableError(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'msg' in err &&
            typeof (err as any).msg === 'string' &&
            (err as any).msg.includes('No master available')
        )
    }

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
            if (alreadyExistsError(err)) {
                log.info('Table "%s" already exists', table)
            }
            else if (noMasterAvailableError(err)) {
                log.info('No master available')
                await new Promise((resolve) => setTimeout(resolve, 1000))
                return createTable(table, options) // retry
            }
            else {
                throw err
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
