import timeutil from '../../../util/timeutil.js'
import _ from 'lodash'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import * as db from '../../../db/index.mjs'
export default (function(pushdev) {
    const log = logger.createLogger('watcher-users')
    function sendUserChange(user, isAddedGroup, groups, action, targets) {
        pushdev.send([
            wireutil.global
            , wireutil.envelope(new wire.UserChangeMessage(user, isAddedGroup, groups, action, targets, timeutil.now('nano')))
        ])
    }
    let changeStream
    db.connect().then(client => {
        const users = client.collection('users')
        changeStream = users.watch([
            {
                $project: {
                    'fullDocument.email': 1
                    , 'fullDocument.name': 1
                    , 'fullDocument.privilege': 1
                    , 'fullDocument.groups.quotas': 1
                    , 'fullDocument.groups.subscribed': 1
                    , 'fullDocument.settings.alertMessage': 1
                    , 'fullDocumentBeforeChange.email': 1
                    , 'fullDocumentBeforeChange.name': 1
                    , 'fullDocumentBeforeChange.privilege': 1
                    , 'fullDocumentBeforeChange.groups.quotas': 1
                    , 'fullDocumentBeforeChange.groups.subscribed': 1
                    , 'fullDocumentBeforeChange.settings.alertMessage': 1
                    , operationType: 1
                }
            }
        ], {fullDocument: 'whenAvailable', fullDocumentBeforeChange: 'whenAvailable'})
        changeStream.on('change', next => {
            log.info('Users watcher next: ' + JSON.stringify(next))
            try {
                let newDoc, oldDoc
                let operationType = next.operationType
                if (next.fullDocument) {
                    newDoc = next.fullDocument
                }
                else {
                    newDoc = null
                }
                if (next.fullDocumentBeforeChange) {
                    oldDoc = next.fullDocumentBeforeChange
                }
                else {
                    oldDoc = null
                }
                if (newDoc === null && oldDoc === null) {
                    log.info('New user doc and old user doc is NULL')
                    return false
                }
                if (operationType === 'insert') {
                    sendUserChange(newDoc, false, [], 'created', ['settings'])
                }
                else if (operationType === 'delete') {
                    sendUserChange(oldDoc, false, [], 'deleted', ['settings'])
                }
                else {
                    const targets = []
                    if (newDoc.groups && oldDoc.groups) {
                        if (newDoc.groups.quotas && oldDoc.groups.quotas) {
                            if (!_.isEqual(newDoc.groups.quotas.allocated, oldDoc.groups.quotas.allocated)) {
                                targets.push('settings')
                                targets.push('view')
                            }
                            else if (!_.isEqual(newDoc.groups.quotas.consumed, oldDoc.groups.quotas.consumed)) {
                                targets.push('view')
                            }
                            else if (newDoc.groups.quotas.defaultGroupsNumber !==
                                oldDoc.groups.quotas.defaultGroupsNumber ||
                                newDoc.groups.defaultGroupsDuration !==
                                    oldDoc.groups.quotas.defaultGroupsDuration ||
                                newDoc.groups.defaultGroupsRepetitions !==
                                    oldDoc.groups.quotas.defaultGroupsRepetitions ||
                                newDoc.groups.repetitions !==
                                    oldDoc.groups.quotas.repetitions ||
                                !_.isEqual(newDoc.groups.subscribed, oldDoc.groups.subscribed)) {
                                targets.push('settings')
                            }
                        }
                    }
                    else if (!_.isEqual(newDoc.settings.alertMessage, oldDoc.settings.alertMessage)) {
                        targets.push('menu')
                    }
                    if (targets.length) {
                        sendUserChange(newDoc, newDoc.groups.subscribed.length > oldDoc.groups.subscribed.length, _.xor(newDoc.groups.subscribed, oldDoc.groups.subscribed), 'updated', targets)
                    }
                }
            }
            catch (e) {
                log.error(e)
            }
        })
    })
})
