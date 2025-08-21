import _ from 'lodash'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import timeutil from '../../../util/timeutil.js'

class UserChangeHandler {

    isPrepared = false
    log = logger.createLogger('change-handler-users')

    init(push, pushdev, channelRouter) {
        this.pushdev = pushdev
        this.isPrepared = !!this.pushdev
    }

    sendUserChange = (user, isAddedGroup, groups, action, targets) => {
        function wireUserField() {
            const wireUser = _.cloneDeep(user)
            delete wireUser._id
            delete wireUser.ip
            delete wireUser.group
            delete wireUser.lastLoggedInAt
            delete wireUser.createdAt
            delete wireUser.forwards
            delete wireUser.acceptedPolicy
            delete wireUser.groups.lock
            delete wireUser.groups.defaultGroupsDuration
            delete wireUser.groups.defaultGroupsNumber
            delete wireUser.groups.defaultGroupsRepetitions
            delete wireUser.groups.repetitions
            return wireUser
        }
        const userField = wireUserField()
        this.pushdev.send([
            wireutil.global,
            wireutil.envelope(new wire.UserChangeMessage(
                userField
                , isAddedGroup
                , groups
                , action
                , targets
                , timeutil.now('nano')
            ))
        ])
    }

    updateUserHandler = (oldUser, newUser) => {
        if (newUser === null && oldUser === null) {
            this.log.info('New user doc and old user doc is NULL')
            return false
        }
        const targets = []
        if (newUser?.groups && oldUser?.groups) {
            if (newUser.groups.quotas && oldUser.groups.quotas) {
                if (!_.isEqual(newUser.groups.quotas.allocated, oldUser.groups.quotas.allocated)) {
                    targets.push('settings')
                    targets.push('view')
                }
                else if (!_.isEqual(newUser.groups.quotas.consumed, oldUser.groups.quotas.consumed)) {
                    targets.push('view')
                }
                else if (newUser.groups.quotas.defaultGroupsNumber !==
                    oldUser.groups.quotas.defaultGroupsNumber ||
                    newUser.groups.quotas.defaultGroupsDuration !==
                    oldUser.groups.quotas.defaultGroupsDuration ||
                    newUser.groups.quotas.defaultGroupsRepetitions !==
                    oldUser.groups.quotas.defaultGroupsRepetitions ||
                    newUser.groups.quotas.repetitions !==
                    oldUser.groups.quotas.repetitions ||
                    !_.isEqual(newUser.groups.subscribed, oldUser.groups.subscribed)) {
                    targets.push('settings')
                }
            }
        }
        if (!_.isEqual(newUser?.settings.alertMessage, oldUser?.settings.alertMessage)) {
            targets.push('menu')
        }
        if (targets.length) {
            this.sendUserChange(newUser, newUser.groups.subscribed.length > oldUser.groups.subscribed.length
                , _.xor(newUser.groups.subscribed, oldUser.groups.subscribed), 'updated', targets)
        }
        return !_.isEqual(newUser, oldUser)
    }

}

// Temporary solution needed to avoid situations
// where a unit may not initialize the change handler,
// but use the db module. In this case, any methods of this handler
// do nothing and will not cause an error.
/** @type {UserChangeHandler} */
export default new Proxy(new UserChangeHandler(), {

    /** @param {string} prop */
    get(target, prop) {
        if (target.isPrepared || prop === 'init' || typeof target[prop] !== 'function') {
            return target[prop]
        }

        return () => {}
    }
})
