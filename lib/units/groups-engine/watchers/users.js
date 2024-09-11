/**
* Copyright © 2019-2024 code initially contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const timeutil = require('../../../util/timeutil')
const r = require('rethinkdb')
const _ = require('lodash')
const logger = require('../../../util/logger')
const wireutil = require('../../../wire/util')
const wire = require('../../../wire')
const db = require('../../../db')

module.exports = function(pushdev) {
  const log = logger.createLogger('watcher-users')

  function sendUserChange(user, isAddedGroup, groups, action, targets) {
    pushdev.send([
      wireutil.global
    , wireutil.envelope(
        new wire.UserChangeMessage(
          user
        , isAddedGroup
        , groups
        , action
        , targets
        , timeutil.now('nano')))
    ])
  }

<<<<<<< Updated upstream
  db.run(r
    .table('users')
    .pluck(
      'email'
    , 'name'
    , 'privilege'
    , {groups: ['quotas', 'subscribed']}
    , {settings: ['alertMessage']}
    )
    .changes(), function(err, cursor) {
    if (err) {
      throw err
    }
    return cursor
  })
  .then(function(cursor) {
    cursor.each(function(err, data) {
      if (err) {
        throw err
=======
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
>>>>>>> Stashed changes
      }
      if (data.old_val === null) {
        sendUserChange(data.new_val, false, [], 'created', ['settings'])
      }
      else if (data.new_val === null) {
        sendUserChange(data.old_val, false, [], 'deleted', ['settings'])
      }
      else {
        const targets = []

<<<<<<< Updated upstream
        if (!_.isEqual(
               data.new_val.groups.quotas.allocated
             , data.old_val.groups.quotas.allocated)) {
          targets.push('settings')
          targets.push('view')
        }
        else if (!_.isEqual(
                    data.new_val.groups.quotas.consumed
                  , data.old_val.groups.quotas.consumed)) {
          targets.push('view')
        }
        else if (data.new_val.groups.quotas.defaultGroupsNumber !==
          data.old_val.groups.quotas.defaultGroupsNumber ||
          data.new_val.groups.quotas.defaultGroupsDuration !==
          data.old_val.groups.quotas.defaultGroupsDuration ||
          data.new_val.groups.quotas.defaultGroupsRepetitions !==
          data.old_val.groups.quotas.defaultGroupsRepetitions ||
          data.new_val.groups.quotas.repetitions !==
          data.old_val.groups.quotas.repetitions ||
          !_.isEqual(data.new_val.groups.subscribed, data.old_val.groups.subscribed)) {
          targets.push('settings')
        }
        else if (!_.isEqual(
               data.new_val.settings.alertMessage
             , data.old_val.settings.alertMessage)) {
          targets.push('menu')
        }
        if (targets.length) {
          sendUserChange(
            data.new_val
          , data.new_val.groups.subscribed.length > data.old_val.groups.subscribed.length
          , _.xor(data.new_val.groups.subscribed, data.old_val.groups.subscribed)
          , 'updated'
          , targets)
=======
          if (newDoc.groups && oldDoc.groups) {
            if (newDoc.groups.quotas && oldDoc.groups.quotas) {
              if (!_.isEqual(
                newDoc.groups.quotas.allocated
                , oldDoc.groups.quotas.allocated)) {
                targets.push('settings')
                targets.push('view')
              }
              else if (!_.isEqual(
                newDoc.groups.quotas.consumed
                , oldDoc.groups.quotas.consumed)) {
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
          else if (!_.isEqual(
            newDoc.settings.alertMessage
            , oldDoc.settings.alertMessage)) {
            targets.push('menu')
          }
          if (targets.length) {
            sendUserChange(
              newDoc
              , newDoc.groups.subscribed.length > oldDoc.groups.subscribed.length
              , _.xor(newDoc.groups.subscribed, oldDoc.groups.subscribed)
              , 'updated'
              , targets)
          }
>>>>>>> Stashed changes
        }
      }
    })
  })
  .catch(function(err) {
    log.error('An error occured during USERS table watching', err.stack)
  })
}
