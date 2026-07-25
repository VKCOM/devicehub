/* *
 * Copyright 2026 Matan Baruch <matan.baruch@unity3d.com> - Licensed under the Apache license 2.0
 * */
import client from 'prom-client'
import * as apiutil from './apiutil.js'
import {DeviceStatus} from '../wire/wire.js'

// Aggregate device states, computed the same way the device table does in
// ui/src/lib/utils/get-device-state.util.ts; the 'using' and 'automation' states are not computed
// here since they only mean something inside a given user session
export const DEVICE_STATES = [
    'absent',
    'offline',
    'unauthorized',
    'preparing',
    'busy',
    'available',
    'unhealthy',
    'present'
]

export const GROUP_STATES = [apiutil.PENDING, apiutil.READY, apiutil.WAITING]
export const GROUP_CLASSES = Object.keys(apiutil.CLASS_DURATION)
export const USER_PRIVILEGES = [apiutil.ROOT, apiutil.ADMIN, apiutil.USER]

export const register = new client.Registry()

register.setDefaultLabels({app: 'devicehub'})
client.collectDefaultMetrics({register: register})

export const gauges = {
    devicesTotal: new client.Gauge({
        name: 'devicehub_devices_total',
        help: 'Number of devices known to DeviceHub, whether they are present or not',
        registers: [register]
    }),
    devicesByState: new client.Gauge({
        name: 'devicehub_devices_by_state',
        help: 'Number of devices per aggregate device state',
        labelNames: ['state'],
        registers: [register]
    }),
    devicesAvailable: new client.Gauge({
        name: 'devicehub_devices_available',
        help: 'Number of devices in the available state',
        registers: [register]
    }),
    devicesBusy: new client.Gauge({
        name: 'devicehub_devices_busy',
        help: 'Number of devices in the busy state',
        registers: [register]
    }),
    providersTotal: new client.Gauge({
        name: 'devicehub_providers_total',
        help: 'Number of distinct providers serving at least one present device',
        registers: [register]
    }),
    usersTotal: new client.Gauge({
        name: 'devicehub_users_total',
        help: 'Number of users known to DeviceHub',
        registers: [register]
    }),
    usersByPrivilege: new client.Gauge({
        name: 'devicehub_users_by_privilege',
        help: 'Number of users per privilege',
        labelNames: ['privilege'],
        registers: [register]
    }),
    groupsTotal: new client.Gauge({
        name: 'devicehub_groups_total',
        help: 'Number of groups known to DeviceHub',
        registers: [register]
    }),
    groupsActive: new client.Gauge({
        name: 'devicehub_groups_active',
        help: 'Number of groups which are currently active',
        registers: [register]
    }),
    groupsByState: new client.Gauge({
        name: 'devicehub_groups_by_state',
        help: 'Number of groups per group state',
        labelNames: ['state'],
        registers: [register]
    }),
    groupsByClass: new client.Gauge({
        name: 'devicehub_groups_by_class',
        help: 'Number of groups per group class',
        labelNames: ['class'],
        registers: [register]
    })
}

const zeroFill = function(values) {
    return values.reduce((counts, value) => {
        counts[value] = 0
        return counts
    }, Object.create(null))
}

// Counts only the already known label values so that an unexpected document can't create an
// unbounded number of time series
const count = function(counts, value) {
    const current = counts[value]

    if (typeof current === 'number') {
        counts[value] = current + 1
    }
}

const setLabeled = function(gauge, label, counts) {
    gauge.reset()
    Object.keys(counts).forEach((value) => {
        gauge.set({[label]: value}, counts[value])
    })
}

export const deviceState = function(device) {
    if (!device.present) {
        return 'absent'
    }
    if (device.status === DeviceStatus.OFFLINE) {
        return 'offline'
    }
    if (device.status === DeviceStatus.UNAUTHORIZED) {
        return 'unauthorized'
    }
    if (device.status === DeviceStatus.ONLINE) {
        if (!device.ready) {
            return 'preparing'
        }
        return device.owner ? 'busy' : 'available'
    }
    if (device.status === DeviceStatus.PREPARING && device.manufacturer === 'Apple') {
        return 'available'
    }
    if (device.status === DeviceStatus.UNHEALTHY) {
        return 'unhealthy'
    }
    return 'present'
}

export const aggregateDevices = function(devices) {
    const stats = {
        total: devices.length,
        available: 0,
        busy: 0,
        providers: 0,
        byState: zeroFill(DEVICE_STATES)
    }
    const providers = Object.create(null)

    devices.forEach((device) => {
        const state = deviceState(device)

        count(stats.byState, state)

        if (state === 'available') {
            stats.available += 1
        }
        if (state === 'busy') {
            stats.busy += 1
        }
        if (device.present && device.provider && device.provider.name) {
            providers[device.provider.name] = true
        }
    })
    stats.providers = Object.keys(providers).length
    return stats
}

export const aggregateUsers = function(users) {
    const stats = {
        total: users.length,
        byPrivilege: zeroFill(USER_PRIVILEGES)
    }

    users.forEach((user) => count(stats.byPrivilege, user.privilege))
    return stats
}

export const aggregateGroups = function(groups) {
    const stats = {
        total: groups.length,
        active: 0,
        byState: zeroFill(GROUP_STATES),
        byClass: zeroFill(GROUP_CLASSES)
    }

    groups.forEach((group) => {
        if (group.isActive) {
            stats.active += 1
        }
        count(stats.byState, group.state)
        count(stats.byClass, group.class)
    })
    return stats
}

export const update = function(devices, users, groups) {
    const deviceStats = aggregateDevices(devices)
    const userStats = aggregateUsers(users)
    const groupStats = aggregateGroups(groups)

    gauges.devicesTotal.set(deviceStats.total)
    gauges.devicesAvailable.set(deviceStats.available)
    gauges.devicesBusy.set(deviceStats.busy)
    gauges.providersTotal.set(deviceStats.providers)
    setLabeled(gauges.devicesByState, 'state', deviceStats.byState)

    gauges.usersTotal.set(userStats.total)
    setLabeled(gauges.usersByPrivilege, 'privilege', userStats.byPrivilege)

    gauges.groupsTotal.set(groupStats.total)
    gauges.groupsActive.set(groupStats.active)
    setLabeled(gauges.groupsByState, 'state', groupStats.byState)
    setLabeled(gauges.groupsByClass, 'class', groupStats.byClass)
}

export default {
    register: register,
    gauges: gauges,
    deviceState: deviceState,
    aggregateDevices: aggregateDevices,
    aggregateUsers: aggregateUsers,
    aggregateGroups: aggregateGroups,
    update: update
}
