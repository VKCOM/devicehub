import * as apiutil from '../../../util/apiutil.js'
import * as Sentry from '@sentry/node'
import dbapi from '../../api.js'
import db from '../../index.js'
import logger from '../../../util/logger.js'

import mongo from 'mongodb'

const log = logger.createLogger('groups-scheduler')

const debounce = (fn, wait) => {
    let timeout
    return (...args) => {
        clearTimeout(timeout)
        timeout = setTimeout(fn, wait, ...args)
    }
}

export default class GroupsScheduler {
    currentTimeout = null
    taskQueue = []
    scheduledTasks = new Map()

    /** @type {mongo.Collection<mongo.Document>} */
    // @ts-ignore
    groupsClient

    setScheduledTask(groupId, {type, time, job}) {
        this.scheduledTasks.set(groupId, {type, time, job})
        for (const i in this.taskQueue) {
            if (this.scheduledTasks.get(this.taskQueue[i])?.time > time) {
                // @ts-ignore
                this.taskQueue.push(groupId, ...this.taskQueue.splice(i, this.taskQueue.length - i))
                return
            }
        }
        this.taskQueue.push(groupId)
    }

    scheduleNextTask() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout)
            this.currentTimeout = null
        }

        if (!this.taskQueue?.length || !this.scheduledTasks.size) {
            log.debug('No tasks to schedule')
            return
        }

        const [groupId] = this.taskQueue.splice(0, 1)
        const task = this.scheduledTasks.get(groupId)

        const now = Date.now()
        const delay = Math.max(0, task.time - now)
        if (delay >= apiutil.ONE_YEAR) {
            this.scheduledTasks.delete(groupId)
            return this.scheduleNextTask()
        }

        log.info(
            `Scheduling next task ${
                task.type
            } for group ${
                groupId
            } in ${
                Math.floor(delay / 1000)
            }s`
        )

        // @ts-ignore
        this.currentTimeout = setTimeout(async() => {
            this.scheduledTasks.delete(groupId)

            await this.processTask(groupId, task)

            this.scheduleNextTask()
        }, delay)
    }

    async processTask(groupId, task) {
        try {
            const group = await dbapi.getGroup(groupId)
            if (!group) {
                return
            }

            log.info(`Processing task ${task.type} for group ${groupId} \n${JSON.stringify(group, null, 2)}!\n\n`)

            return await task.job(group)
        }
        catch (err) {
            Sentry.captureException(err)
            // @ts-ignore
            log.error(`Error processing task ${task.type} for group ${groupId}:`, err?.stack || err)
        }
    }

    processGroup(group) {
        const now = Date.now()
        const groupId = group.id

        if (!group.dates?.length) {
            log.warn(`Dates list is empty in group with id "${groupId}"`)
            return
        }

        const stopTime = group.dates[0].stop.getTime()

        if (apiutil.isOriginGroup(group.class)) {
            this.setScheduledTask(groupId, {
                type: 'UPD_ORIGIN_GROUP_LIFETIME'
                , time: stopTime
                , job: (group) => this.updateOriginGroupLifetime(group)
            })
        }
        else if (group.isActive || group.state === apiutil.WAITING) {
            this.setScheduledTask(groupId, {
                type: 'HANDLE_EXPIRED_ACTIVE_GROUP'
                , time: stopTime
                , job: (group) => (
                    group.dates.length === 1 ||
                    (group.class === apiutil.ONCE && group.devices.length === 0)
                ) ? this.deleteUserGroup(group) : this.doBecomeUnactiveGroup(group)
            })
        }
        else if (!group.isActive) {
            for (const i in group.dates) {
                if (now >= group.dates[i].stop.getTime()) {
                    if (group.dates[i].stop === group.dates[group.dates.length - 1].stop) {
                        return this.deleteUserGroup(group)
                    }
                }
                else if (now < group.dates[i].start.getTime()) {
                    return this.doCleanElapsedGroupDates(group, i)
                }

                // TODO: for-loop is useless
                return this.doBecomeActiveGroup(group, i)
            }
        }
    }

    scheduleAllGroupsTasks = debounce(() => Sentry.startSpan(
        {name: 'groups-engine scheduler'},
        async() => {
            try {
                const groups = await dbapi.getReadyGroupsOrderByIndex('startTime')
                this.scheduledTasks.clear()
                this.taskQueue = []

                await Promise.all(groups?.map((group) => this.processGroup(group)) || [])

                this.scheduleNextTask()
            }
            catch (err) {
                Sentry.captureException(err)
                // @ts-ignore
                log.error('Error loading groups and scheduling tasks:', err?.stack || err)
            }
        }), 3000)

    async setupChangeStream() {
        try {
            this.changeStream = this.groupsClient.watch()

            this.changeStream.on('change', async(change) => {
                log.info('Detected change in groups collection:', change.operationType)

                // Reload all groups and reschedule
                await this.scheduleAllGroupsTasks()
            })

            this.changeStream.on('error', (error) => {
                Sentry.captureException(error)
                log.error('Error in change stream:', error)
            })

            this.changeStream.on('close', () => {
                log.warn('Change stream closed, attempting to reconnect')
                setTimeout(this.setupChangeStream, 5000)
            })

            log.info('MongoDB change stream set up successfully')
        }
        catch (err) {
            Sentry.captureException(err)
            // @ts-ignore
            log.error('Error setting up change stream:', err?.stack || err)

            setTimeout(this.setupChangeStream, 5000)
        }
    }

    genIndexesLoop = () => setTimeout(() => {
        dbapi.generateIndexes()
        this.genIndexesLoop()
    }, apiutil.ONE_HOUR * 8)

    doBecomeUnactiveGroup(group) {
        return this.updateGroupDates(group, 1, false)
    }

    doCleanElapsedGroupDates(group, incr) {
        return this.updateGroupDates(group, incr, false)
    }

    doBecomeActiveGroup(group, incr) {
        return this.updateGroupDates(group, incr, true)
    }

    updateOriginGroupLifetime(group) {
        const now = Date.now()
        return this.groupsClient.updateOne({id: group.id}, {
            $set: {
                dates: [{
                    start: new Date(now)
                    , stop: new Date(Math.max(
                        now + (group.dates[0].stop - group.dates[0].start)
                        , apiutil.ONE_HOUR
                    ))
                }]
            }
        }).then(() => this.scheduleAllGroupsTasks())
    }

    deleteUserGroup(group) {
        return dbapi.deleteUserGroup(group.id)
    }

    async updateGroupDates(group, incr, isActive) {
        const repetitions = group.repetitions - incr
        const dates = group.dates.slice(incr)
        const duration = group.devices.length * (dates[0].stop - dates[0].start) * (repetitions + 1)

        try {
            await this.groupsClient.updateOne({id: group.id}, {
                $set: {
                    dates: dates
                    , repetitions: repetitions
                    , duration: duration
                    , isActive: isActive
                    , state: apiutil.READY
                }
            })
            await dbapi.updateUserGroupDuration(group.owner.email, group.duration, duration)
            await this.scheduleAllGroupsTasks()
        }
        catch (err) {
            throw err
        }
    }

    async init() {
        try {
            await db.connect()
            this.groupsClient = db.collection('groups')

            await dbapi.unlockBookingObjects()
            await this.scheduleAllGroupsTasks()
        }
        catch (err) {
            throw err
        }
    }

    async listen() {
        try {
            if (!this.groupsClient) {
                await this.init()
            }

            await this.setupChangeStream()
            this.genIndexesLoop()
        }
        catch (err) {
            throw err
        }
    }
}
