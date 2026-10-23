/*
 * Device group updates that run as MongoDB aggregation pipelines: their
 * semantics only show on a real server. Opt-in, against a throwaway database:
 *   MONGODB_INTEGRATION_TESTS=1 npx vitest run test/unit/db/device-group.integration.test.ts
 * MONGODB_PORT_27017_TCP points to the server (default mongodb://127.0.0.1:27017).
 */
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'

const enabled = process.env.MONGODB_INTEGRATION_TESTS === '1'

describe.skipIf(!enabled)('device group updates (real MongoDB)', () => {
    let db: any
    let dbapi: any
    const devices = () => db.connection.collection('devices')
    const group = (serial: string) => devices().findOne({serial}).then((device: any) => device.group)

    beforeAll(async() => {
        process.env.MONGODB_DB_NAME = `devicehub_test_${process.pid}_${Date.now()}`
        db = (await import('../../../lib/db/index.js')).default
        dbapi = (await import('../../../lib/db/api.js')).default
        await db.connect()
    })

    afterAll(async() => {
        await db?.connection.dropDatabase()
        await db?.connection.client.close()
    })

    beforeEach(() => devices().deleteMany({}))

    const insert = (serial: string, groupFields: Record<string, unknown>) =>
        devices().insertOne({serial, group: {id: 'g1', origin: 'g1', name: 'one', originName: 'one', ...groupFields}})

    describe('lockDeviceByCurrent', () => {
        it('locks a device of one of the user groups', async() => {
            await insert('s1', {lock: false})
            await dbapi.lockDeviceByCurrent(['g1'], 's1')
            expect((await group('s1')).lock).toBe(true)
        })

        // The bug let any user take any device
        it('does not lock a device of another group', async() => {
            await insert('s1', {id: 'other', lock: false})
            const stats = await dbapi.lockDeviceByCurrent(['g1'], 's1')
            expect(stats.modifiedCount).toBe(0)
            expect((await group('s1')).lock).toBe(false)
        })

        it('does not lock a device locked by someone else', async() => {
            await insert('s1', {lock: true})
            const stats = await dbapi.lockDeviceByCurrent(['g1'], 's1')
            expect(stats.modifiedCount).toBe(0)
            expect((await group('s1')).lock).toBe(true)
        })

        // The bug removed the field of every device it was asked to lock
        it('locks a device without a lock field', async() => {
            await insert('s1', {})
            await dbapi.lockDeviceByCurrent(['g1'], 's1')
            expect((await group('s1')).lock).toBe(true)
        })
    })

    describe('lockDeviceByOrigin', () => {
        it('locks a device whose origin group is one of the user groups', async() => {
            await insert('s1', {id: 'booking', lock: false})
            await dbapi.lockDeviceByOrigin(['g1'], 's1')
            expect((await group('s1')).lock).toBe(true)
        })

        it('does not lock a device of another origin group', async() => {
            await insert('s1', {origin: 'other', lock: false})
            const stats = await dbapi.lockDeviceByOrigin(['g1'], 's1')
            expect(stats.modifiedCount).toBe(0)
            expect((await group('s1')).lock).toBe(false)
        })
    })

    describe('updateDeviceGroupName', () => {
        it('renames the current group of a device sitting in its origin group', async() => {
            await insert('s1', {})
            await dbapi.updateDeviceGroupName('s1', {id: 'g1', name: 'renamed', class: 'bookable'})
            expect(await group('s1')).toMatchObject({name: 'renamed', originName: 'renamed'})
        })

        it('keeps the name of a booking when its origin group is renamed', async() => {
            await insert('s1', {id: 'booking', name: 'my booking'})
            await dbapi.updateDeviceGroupName('s1', {id: 'g1', name: 'renamed', class: 'bookable'})
            expect(await group('s1')).toMatchObject({name: 'my booking', originName: 'renamed'})
        })

        it('keeps the names when an inactive booking is renamed', async() => {
            await insert('s1', {id: 'booking', name: 'my booking'})
            await dbapi.updateDeviceGroupName('s1', {id: 'booking', name: 'renamed', class: 'once', isActive: false})
            expect(await group('s1')).toMatchObject({name: 'my booking', originName: 'one'})
        })
    })
})
