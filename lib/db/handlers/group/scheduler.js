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

    setScheduledTask({groupId, type, time = 0, job}) {
        if (Date.now() >= time) {
            this.processTask({groupId, type, time, job})
        }

        const key = Symbol()
        this.scheduledTasks.set(key, {groupId, type, time, job})
        for (const i in this.taskQueue) {
            if (this.scheduledTasks.get(this.taskQueue[i])?.time > time) {
                // @ts-ignore
                this.taskQueue.push(key, ...this.taskQueue.splice(i, this.taskQueue.length - i))
                return
            }
        }
        this.taskQueue.push(key)
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

        const [key] = this.taskQueue.splice(0, 1)
        const task = this.scheduledTasks.get(key)

        const now = Date.now()
        const delay = Math.max(0, task.time - now)
        if (delay >= apiutil.ONE_YEAR) {
            this.scheduledTasks.delete(key)
            return this.scheduleNextTask()
        }

        log.info(
            `Scheduling next task ${
                task.type
            } for group ${
                task.groupId
            } in ${
                Math.floor(delay / 1000)
            }s`
        )

        // @ts-ignore
        this.currentTimeout = setTimeout(async() => {
            this.scheduledTasks.delete(key)

            await this.processTask(task)

            this.scheduleNextTask()
        }, delay)
    }

    async processTask(task) {
        try {
            const group = await dbapi.getGroup(task.groupId)
            if (!group) {
                return
            }

            log.info(`Processing task ${task.type} for group ${task.groupId} \n${JSON.stringify(group, null, 2)}!\n\n`)

            return await task.job(group)
        }
        catch (err) {
            Sentry.captureException(err)
            // @ts-ignore
            log.error(`Error processing task ${task.type} for group ${task.groupId}:`, err?.stack || err)
        }
    }

    processGroup(group) {
        if (!group.dates?.length) {
            log.warn(`Dates list is empty in group with id "${group.id}"`)
            return
        }

        const now = Date.now()
        const groupId = group.id
        const isOrigin = apiutil.isOriginGroup(group.class)
        const lastWindow = group.dates[group.dates.length - 1]

        if (now >= lastWindow.stop) {
            this.setScheduledTask({
                groupId, type: 'HANDLE_EXPIRED_GROUP_WINDOW'
                , time: lastWindow.stop.getTime()
                , job: (group) => isOrigin ?
                    this.updateOriginGroupLifetime(group) :
                    this.deleteUserGroup(group)
            })
            return
        }

        if (isOrigin) {
            return
        }

        if (group.class !== apiutil.ONCE) {
            const windowIndex = group.dates.findIndex((w, i) => i > group.repetitions - 1 && now < w.stop)
            if (windowIndex > 0) { // only immediately update length of group.dates
                this.setScheduledTask({
                    groupId, type: 'HANDLE_EXPIRED_GROUP_WINDOW'
                    , time: group.dates[windowIndex - 1].stop.getTime()
                    , job: (group) => this.updateGroupDates(group, windowIndex, group.isActive)
                })
                group.dates.slice(windowIndex)
            }
        }

        const window = group.dates[0]
        const isLastRepetition = group.dates.length === 1

        if (now < window.stop && !group.isActive) { // if not, then the next task onExpire will be executed immediately
            this.setScheduledTask({
                groupId, type: 'ACTIVATE_GROUP'
                , time: window.start.getTime()
                , job: this.doBecomeActiveGroup
            })
        }

        this.setScheduledTask({
            groupId, type: 'HANDLE_EXPIRED_GROUP_WINDOW'
            , time: window.stop.getTime()
            , job: (group) => (
                group.class === apiutil.ONCE || isLastRepetition
            ) ? this.deleteUserGroup(group) : this.doBecomeUnactiveGroup(group)
        })
    }

    genIndexesLoop = () => setTimeout(() => {
        dbapi.generateIndexes()
        this.genIndexesLoop()
    }, apiutil.ONE_HOUR * 8)

    doBecomeActiveGroup = (group) => Promise.all([
        db.groups.updateOne({id: group.id}, {$set: {isActive: true}})
        , dbapi.updateDevicesCurrentGroup(group.devices, group)
    ])

    doBecomeUnactiveGroup = (group, windowIndex = 0) =>
        this.updateGroupDates(group, windowIndex, true)

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

    async updateGroupDates(group, windowIndex, isActive) {
        const repetitions = group.repetitions - (windowIndex)
        const dates = group.dates.slice(windowIndex)
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

            if (!isActive && group.devices?.length) {
                await dbapi.updateDevicesCurrentGroupFromOrigin(group.devices)
            }

            await dbapi.updateUserGroupDuration(group.owner.email, group.duration, duration)
            await this.scheduleAllGroupsTasks()
        }
        catch (err) {
            throw err
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
}
