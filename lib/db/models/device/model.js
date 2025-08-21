/* *
 * Copyright 2025 contains code contributed by V Kontakte LLC - Licensed under the Apache license 2.0
 * */
// @ts-nocheck
import logger from '../../../util/logger.js'
import db from '../../index.js'

const log = logger.createLogger('dbapi:device')

/*
===========================================================
==================== without change DB ====================
===========================================================
*/

// dbapi.loadUserDevices = function(email) {
export const loadUserDevices = function(email) {
    return db.users.findOne({email: email}).then(user => {
        let userGroups = user?.groups.subscribed
        return db.devices.find(
            {
                'owner.email': email,
                present: true,
                'group.id': {$in: userGroups}
            }
        ).toArray()
    })
}

// dbapi.loadPresentDevices = function() {
export const loadPresentDevices = function() {
    return db.devices.find({present: true}).toArray()
}

// dbapi.loadDevicesBySerials = function(serials) {
export const loadDevicesBySerials = function(serials) {
    return db.devices.find({serial: {$in: serials}}).toArray()
}

// dbapi.getDevicesCount = function() {
export const getDevicesCount = function() {
    return db.devices.countDocuments()
}

// dbapi.getOfflineDevicesCount = function() {
export const getOfflineDevicesCount = function() {
    return db.devices.countDocuments(
        {
            present: false
        }
    )
}

// dbapi.getOfflineDevices = function() {
export const getOfflineDevices = function() {
    return db.devices.find(
        {present: false},
        // @ts-ignore
        {_id: 0, 'provider.name': 1}
    ).toArray()
}

// dbapi.getAllocatedAdbPorts = function() {
export const getAllocatedAdbPorts = function() {
    // @ts-ignore
    return db.devices.find({}, {adbPort: 1, _id: 0}).toArray().then(ports => {
        let result = []
        ports.forEach((port) => {
            if (port.adbPort) {
                let portNum
                if (typeof port.adbPort === 'string') {
                    portNum = parseInt(port.adbPort.replace(/["']/g, ''), 10)
                }
                else {
                    portNum = port.adbPort
                }
                result.push(portNum)
            }
        })
        return result.sort((a, b) => a - b)
    })
}

// dbapi.getDeviceDisplaySize = function(serial) {
export const getDeviceDisplaySize = function(serial) {
    return db.devices.findOne({serial: serial})
        .then(result => {
            return result?.display
        })
}

// dbapi.getDeviceType = function(serial) {
export const getDeviceType = function(serial) {
    return db.devices.findOne({serial: serial})
        .then(result => {
            return result?.deviceType
        })
}

// dbapi.generateIndexes = function() {
export const generateIndexes = function() {
    db.devices.createIndex({serial: -1}).then((result) => {
        log.info('Created indexes with result - ' + result)
    })
}

/*
====================================================================
==================== changing DB - use handlers ====================
====================================================================
*/




// dbapi.deleteDevice = function(serial) {
export const deleteDevice = function(serial) {
    return db.devices.deleteOne({serial: serial})
}

/*
====================================================
==================== deprecated ====================
====================================================
*/


