import * as deviceData from '@devicefarmer/stf-device-db'
import * as browserData from '@devicefarmer/stf-browser-db'
import logger from './logger.js'
const log = logger.createLogger('util:datautil')
const datautil = Object.create(null)
datautil.applyData = function(device) {
    let match
    try {
        match = deviceData.find({
            model: device.model
            , name: device.product
        })
    }
    catch (e) {
        match = false
    }
    if (match) {
        device.name = match.name.id
        device.releasedAt = match.date
        device.image = match.image
        device.cpu = match.cpu
        device.memory = match.memory
        if (match.display && match.display.s) {
            device.display = device.display || {}
            device.display.inches = match.display.s
        }
    }
    return device
}
datautil.applyBrowsers = function(device) {
    if (device.browser) {
        device.browser.apps.forEach(function(app) {
            var data = browserData[app.type]
            if (data) {
                app.developer = data.developer
            }
        })
    }
    return device
}
datautil.applyOwner = function(device, user) {
    device.using = !!device.owner &&
        (device.owner.email === user.email || user.privilege === 'admin')
    return device
}
// Only owner can see this information
datautil.applyOwnerOnlyInfo = function(device, user, isGenerator) {
    if (!isGenerator) {
        if (device.owner && (device.owner.email === user.email || user.privilege === 'admin')) {
            // No-op
        }
        else {
            device.remoteConnect = false
            device.remoteConnectUrl = null
        }
    }
    else {
        device.remoteConnect = false
    }
}
datautil.normalize = function(device, user, isGenerator) {
    datautil.applyData(device)
    datautil.applyBrowsers(device)
    datautil.applyOwner(device, user)
    datautil.applyOwnerOnlyInfo(device, user, isGenerator)
    if (!device.present) {
        device.owner = null
    }
}
export default datautil
