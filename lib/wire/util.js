import {v4 as uuidv4} from 'uuid'
import wire from './index.js'
const wireutil = {
    global: '*ALL',
    makePrivateChannel: function() {
        // @ts-ignore
        return uuidv4(null, Buffer.alloc(16)).toString('base64')
    },
    toDeviceStatus: function(type) {
        return wire.DeviceStatus[{
            device: 'ONLINE',
            emulator: 'ONLINE',
            unauthorized: 'UNAUTHORIZED',
            offline: 'OFFLINE',
            connecting: 'CONNECTING',
            authorizing: 'AUTHORIZING'
        }[type]]
    },
    toDeviceRequirements: function(requirements) {
        return Object.keys(requirements).map(function(name) {
            var item = requirements[name]
            return new wire.DeviceRequirement(name, item.value, wire.RequirementType[item.match.toUpperCase()])
        })
    },
    toInstalledApps: function(installedApps) {
        if (installedApps.length > 0) {
            return installedApps.map(instApp => {
                return new wire.Applications(instApp.bundleId, instApp.bundleName)
            })
        }
        else {
            return []
        }
    },
    envelope: function(message) {
        return new wire.Envelope(message.$code, message.encode()).encodeNB()
    },
    transaction: function(channel, message) {
        return new wire.Envelope(message.$code, message.encode(), channel)
            .encodeNB()
    },
    reply: function(source) {
        var seq = 0
        return {
            okay: function(data, body) {
                return wireutil.envelope(new wire.TransactionDoneMessage(source, seq++, true, data === null ? null : (data || 'success'), body ? JSON.stringify(body) : null))
            },
            fail: function(data, body) {
                return wireutil.envelope(new wire.TransactionDoneMessage(source, seq++, false, data || 'fail', body ? JSON.stringify(body) : null))
            },
            tree: function(data, body) {
                return wireutil.envelope(new wire.TransactionTreeMessage(source, seq++, true, data === null ? null : (data || 'success'), body ? JSON.stringify(body) : null))
            },
            progress: function(data, progress) {
                return wireutil.envelope(new wire.TransactionProgressMessage(source, seq++, data, ~~progress))
            },
            device: function(data, body) {
                return wireutil.envelope(new wire.TransationGetMessage(source, body ? JSON.stringify(body) : null))
            }
        }
    }
}
export default wireutil
