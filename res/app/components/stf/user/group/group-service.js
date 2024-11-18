let Promise = require('bluebird')

module.exports = function GroupServiceFactory(
    socket
    , TransactionService
    , TransactionError
) {
    let groupService = {
    }

    groupService.invite = function(device) {
        let minute = 1000 * 60
        let timeout = device.group.id === device.group.origin ? minute * 15 : 1 // 1 for Infinity
        timeout = device.group.class === 'once' ? minute * 40 : timeout
        if (!device.usable) {
            return Promise.reject(new Error('Device is not usable'))
        }

        let tx = TransactionService.create(device)
        socket.emit('group.invite', device.channel, tx.channel, {
            requirements: {
                serial: {
                    value: device.serial
                    , match: 'exact'
                }
            }
            , timeout: timeout
        })
        return tx.promise
            .then(function(result) {
                return result.device
            })
            .catch(TransactionError, function() {
                throw new Error('Device refused to join the group')
            })
    }

    groupService.kick = function(device, force) {
        if (!force && !device.usable) {
            return Promise.reject(new Error('Device is not usable'))
        }


        let tx = TransactionService.create(device)
        socket.emit('group.kick', device.channel, tx.channel, {
            requirements: {
                serial: {
                    value: device.serial
                    , match: 'exact'
                }
            }
        })
        return tx.promise
            .then(function(result) {
                return result.device
            })
            .catch(TransactionError, function() {
                throw new Error('Device refused to join the group')
            })
    }

    return groupService
}
