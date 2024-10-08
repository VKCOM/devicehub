/**
 * Copyright © 2023 contains code contributed by V Kontakte LLC, authors: Daniil Smirnov, Egor Platonov - Licensed under the Apache license 2.0
 **/
import util from 'util'
import db from './index.mjs'
import wireutil from '../wire/util.js'
import uuid from 'uuid'
import apiutil from '../util/apiutil.js'
import Promise from 'bluebird'
import _ from 'lodash'

import logger from '../util/logger.js'

const log = logger.createLogger('dbapi')

const dbapi = Object.create(null)

// constant default device data

const DEFAULT_IOS_DEVICE_ARGS = {
  DENSITY: 2
  , FPS: 60
  , ID: 0
  , ROTATION: 0
  , SECURE: true
  , SIZE: 4.971253395080566
  , XDPI: 294.9670104980469
  , YDPI: 295.56298828125
}

//

// dbapi.
export class DuplicateSecondaryIndexError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DuplicateSecondaryIndexError'
    Error.captureStackTrace(this, DuplicateSecondaryIndexError)
  }
}


dbapi.unlockBookingObjects = function() {
  return db.connect().then(client => {
    return Promise.all([
      client.collection('users').updateMany(
        {},
        {
          $set: {'groups.lock': false}
        }
      )
      , client.collection('devices').updateMany(
        {},
        {
          $set: {'group.lock': false}
        }
      )
      , client.collection('groups').updateMany(
        {},
        {
          $set: {
            'lock.user': false
            , 'lock.admin': false
          }
        }
      )
    ])
  })
}

dbapi.getNow = function() {
  return new Date()
}


dbapi.createBootStrap = function(env) {
  const now = Date.now()

  function updateUsersForMigration(group) {
    return dbapi.getUsers().then(function(users) {
      return Promise.map(users, function(user) {
        return db.connect().then(client => {
          let data = {
            privilege: user.email !== group.owner.email ? apiutil.USER : apiutil.ADMIN
            , 'groups.subscribed': []
            , 'groups.lock': false
            , 'groups.quotas.allocated.number': group.envUserGroupsNumber
            , 'groups.quotas.allocated.duration': group.envUserGroupsDuration
            , 'groups.quotas.consumed.duration': 0
            , 'groups.quotas.consumed.number': 0
            , 'groups.defaultGroupsNumber': user.email !== group.owner.email ? 0 : group.envUserGroupsNumber
            , 'groups.defaultGroupsDuration': user.email !== group.owner.email ? 0 : group.envUserGroupsDuration
            , 'groups.defaultGroupsRepetitions': user.email !== group.owner.email ? 0 : group.envUserGroupsRepetitions
            , 'groups.repetitions': group.envUserGroupsRepetitions
          }
          client.collection('users').updateOne(
            {email: user.email},
            {
              $set: data
            }
          )
            .then(function(stats) {
              if (stats.modifiedCount > 0) {
                return dbapi.addGroupUser(group.id, user.email)
              }
              return stats
            })
        })
      })
    })
  }

  function getDevices() {
    return db.connect().then(client => {
      return client.collection('devices').find().toArray()
    })
  }

  function updateDevicesForMigration(group) {
    return getDevices().then(function(devices) {
      return Promise.map(devices, function(device) {
        log.info('Migrating device ' + device.serial)
        return db.connect().then(client => {
          let data = {
            'group.id': group.id
            , 'group.name': group.name
            , 'group.lifeTime': group.lifeTime
            , 'group.owner': group.owner
            , 'group.origin': group.origin
            , 'group.class': group.class
            , 'group.repetitions': group.repetitions
            , 'group.originName': group.originName
            , 'group.lock': false
          }
          return client.collection('devices').updateOne(
            {serial: device.serial},
            {
              $set: data
            }
          ).then(function(stats) {
            if (stats.modifiedCount > 0) {
              return dbapi.addOriginGroupDevice(group, device.serial)
            }
            return stats
          })
        })
      })
    })
  }

  return dbapi.createGroup({
    name: env.STF_ROOT_GROUP_NAME
    , owner: {
      email: env.STF_ADMIN_EMAIL
      , name: env.STF_ADMIN_NAME
    }
    , users: [env.STF_ADMIN_EMAIL]
    , privilege: apiutil.ROOT
    , class: apiutil.BOOKABLE
    , repetitions: 0
    , duration: 0
    , isActive: true
    , state: apiutil.READY
    , dates: [{
      start: new Date(now)
      , stop: new Date(now + apiutil.TEN_YEARS)
    }]
    , envUserGroupsNumber: apiutil.MAX_USER_GROUPS_NUMBER
    , envUserGroupsDuration: apiutil.MAX_USER_GROUPS_DURATION
    , envUserGroupsRepetitions: apiutil.MAX_USER_GROUPS_REPETITIONS
  })
    .then(function(group) {
      return dbapi.saveUserAfterLogin({
        name: group.owner.name
        , email: group.owner.email
        , ip: '127.0.0.1'
      })
        .then(function() {
          return updateUsersForMigration(group)
        })
        .then(function() {
          return updateDevicesForMigration(group)
        })
        .then(function() {
          return dbapi.reserveUserGroupInstance(group.owner.email)
        })
    })
}

dbapi.deleteDevice = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').deleteOne({serial: serial})
  })
}

dbapi.deleteUser = function(email) {
  return db.connect().then(client => {
    return client.collection('users').deleteOne({email: email})
  })
}

dbapi.getReadyGroupsOrderByIndex = function(index) {
  const options = {
    // Sort matched documents in descending order by rating
    sort: [index],
  }
  return db.connect().then(client => {
    return client.collection('groups')
      .find(
        {
          state:
            {
              $ne: apiutil.PENDING
            }
        }
        , options
      )
      .toArray()
  })
}

dbapi.getGroupsByIndex = function(value, index) {
  let findIndex = {}
  findIndex[index] = value
  return db.connect().then(client => {
    return client.collection('groups').find(findIndex).toArray()
  })
}


dbapi.getGroupByIndex = function(value, index) {
  return dbapi.getGroupsByIndex(value, index)
    .then(function(array) {
      return array[0]
    })
}

dbapi.getGroupsByUser = function(email) {
  return db.connect().then(client => {
    return client.collection('groups').find({users: {$in: [email]}}).toArray()
  })
}

dbapi.getGroup = function(id) {
  return db.connect().then(client => {
    return client.collection('groups').findOne({id: id})
  })
}

dbapi.getGroups = function() {
  return db.connect().then(client => {
    return client.collection('groups').find().toArray()
  })
}

dbapi.getUsers = function() {
  return db.connect().then(client => {
    return client.collection('users').find().toArray()
  })
}

dbapi.getEmails = function() {
  return db.connect().then(client => {
    return client.collection('users')
      .find(
        {
          privilege:
            {
              $ne: apiutil.ADMIN
            }
        }
      )
      .project({email: 1, _id: 0})
      .toArray()
  })
}

dbapi.addGroupUser = function(id, email) {
  return db.connect()
    .then(client => {
      return client.collection('groups').findOne({id: id}).then(group => {
        return client.collection('users').findOne({email: email}).then(user => {
          let newUsers, newSubs
          if (group.users) {
            newUsers = group.users
          }
          else {
            newUsers = []
          }

          if (!newUsers.includes(email)) {
            newUsers.push(email)
          }

          if (user.groups.subscribed) {
            newSubs = user.groups.subscribed
          }
          else {
            newSubs = []
          }

          newSubs.push(id)
          return Promise.all([
            client.collection('groups').updateOne(
              {
                id: id
              },
              {
                $set: {
                  users: newUsers
                }
              }
            )
            , client.collection('users').updateOne(
              {
                email: email
              },
              {
                $set: {
                  'groups.subscribed': newSubs
                }
              }
            )
          ])
        })
      })
    })
    .then(function(stats) {
      return stats[0].modifiedCount === 0 && stats[1].modifiedCount === 0 ? 'unchanged' : 'added'
    })
}

dbapi.getAdmins = function() {
  return db.connect().then(client => {
    return client.collection('users')
      .find({
        privilege: apiutil.ADMIN
      })
      .project({email: 1, _id: 0})
      .toArray()
  })
}


dbapi.addAdminsToGroup = function(id) {
  return dbapi.getAdmins().then(admins => {
    return db.connect().then(client => {
      return client.collection('groups').findOne({id: id}).then(group => {
        admins.forEach((admin) => {
          let newUsers = group.users
          if (!newUsers.includes(admin.email)) {
            newUsers.push(admin.email)
          }
          return client.collection('groups').updateOne(
            {
              id: id
            },
            {
              $set: {
                users: newUsers
              }
            }
          ).then(() => {
            return client.collection('users').findOne({email: admin.email})
              .then(user => {
                let newSubs = user.groups.subscribed
                newSubs.push(id)
                return client.collection('users').updateOne(
                  {email: admin.email},
                  {
                    $set: {
                      'groups.subscribed': newSubs
                    }
                  }
                )
              })
          })
        })
      })
    })
  })
}

dbapi.removeGroupUser = function(id, email) {
  return db.connect().then(client => {
    return Promise.all([
      client.collection('groups').updateOne(
        {id: id}
        , [
          {
            $set: {
              users: {
                $setDifference: ['$users', [email]]
              }
            }
          }
        ]
      )
      , client.collection('users').updateOne(
        {email: email}
        , [
          {
            $set: {'groups.subscribed': {$setDifference: ['$groups.subscribed', [id]]}}
          }
        ]
      )
    ])
  })
    .then(function() {
      return 'deleted'
    })
}

dbapi.lockBookableDevice = function(groups, serial) {
  function wrappedlockBookableDevice() {
    return db.connect().then(client => {
      return client.collection('devices').findOne({serial: serial}).then(oldDoc => {
        return client.collection('devices').updateOne(
          {serial: serial},
          [{
            $set: {
              'group.lock': {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$group.lock', false]}
                      , {$ne: ['$group.class', apiutil.STANDARD]}
                      , {$not: [{$eq: [{$setIntersection: [groups, ['$group.origin']]}, []]}]}
                    ]
                  }
                  , true
                  , '$group.lock'
                ]
              }
            }
          }]
        ).then(updateStats => {
          return client.collection('devices').findOne({serial: serial}).then(newDoc => {
            updateStats.changes = [
              {new_val: {...newDoc}, old_val: {...oldDoc}}
            ]
            return updateStats
          })
        })
      })
    })
      .then(function(stats) {
        return apiutil.lockDeviceResult(stats, dbapi.loadBookableDevice, groups, serial)
      })
  }

  return apiutil.setIntervalWrapper(
    wrappedlockBookableDevice
    , 10
    , Math.random() * 500 + 50)
}

dbapi.lockDeviceByCurrent = function(groups, serial) {
  function wrappedlockDeviceByCurrent() {
    return db.connect().then(client => {
      return client.collection('devices').findOne({serial: serial}).then(oldDoc => {
        return client.collection('devices').updateOne(
          {serial: serial},
          [{
            $set: {
              'group.lock': {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$group.lock', false]}
                      , {$not: [{$eq: [{$setIntersection: [groups, ['$group.id']]}, []]}]}
                    ]
                  }
                  , true
                  , '$group.lock'
                ]
              }
            }
          }]
        ).then(updateStats => {
          return client.collection('devices').findOne({serial: serial}).then(newDoc => {
            updateStats.changes = [
              {new_val: {...newDoc}, old_val: {...oldDoc}}
            ]
            return updateStats
          })
        })
      })
    })
      .then(function(stats) {
        return apiutil.lockDeviceResult(stats, dbapi.loadDeviceByCurrent, groups, serial)
      })
  }

  return apiutil.setIntervalWrapper(
    wrappedlockDeviceByCurrent
    , 10
    , Math.random() * 500 + 50)
}

dbapi.lockDeviceByOrigin = function(groups, serial) {
  function wrappedlockDeviceByOrigin() {
    return db.connect().then(client => {
      return client.collection('devices').findOne({serial: serial}).then(oldDoc => {
        return client.collection('devices').updateOne(
          {serial: serial},
          [{
            $set: {
              'group.lock': {
                $cond: [
                  {
                    $and: [
                      {$eq: ['$group.lock', false]}
                      , {$not: [{$eq: [{$setIntersection: [groups, ['$group.origin']]}, []]}]}
                    ]
                  }
                  , true
                  , '$group.lock'
                ]
              }
            }
          }]
        ).then(updateStats => {
          return client.collection('devices').findOne({serial: serial}).then(newDoc => {
            updateStats.changes = [
              {new_val: {...newDoc}, old_val: {...oldDoc}}
            ]
            return updateStats
          })
        })
      })
    })
      .then(function(stats) {
        return apiutil.lockDeviceResult(stats, dbapi.loadDeviceByOrigin, groups, serial)
      })
  }

  return apiutil.setIntervalWrapper(
    wrappedlockDeviceByOrigin
    , 10
    , Math.random() * 500 + 50)
}

dbapi.addOriginGroupDevice = function(group, serial) {
  return db.connect().then(client => {
    return client.collection('groups').findOne({id: group.id}).then((groupData) => {
      let devices = groupData.devices
      if (!devices.includes(serial)) {
        devices.push(serial)
      }
      else {
        return dbapi.getGroup(group.id)
      }
      return client.collection('groups').updateOne(
        {
          id: group.id
        },
        {
          $set: {
            devices: devices
          }
        }).then(function() {
        return dbapi.getGroup(group.id)
      })
    })
  })
}

dbapi.removeOriginGroupDevice = function(group, serial) {
  return db.connect().then(client => {
    return client.collection('groups').updateOne(
      {id: group.id}
      , [
        {$set: {devices: {$setDifference: ['$devices', [serial]]}}}
      ]
    )
      .then(function() {
        return dbapi.getGroup(group.id)
      })
  })
}

dbapi.addGroupDevices = function(group, serials) {
  const duration = apiutil.computeDuration(group, serials.length)

  return dbapi.updateUserGroupDuration(group.owner.email, group.duration, duration)
    .then(function(stats) {
      if (stats.modifiedCount > 0) {
        return dbapi.updateGroup(
          group.id
          , {
            duration: duration
            , devices: _.union(group.devices, serials)
          })
          .then((data) => {
            if (group.class === apiutil.ONCE) {
              return dbapi.updateDevicesCurrentGroup(serials, group)
                .then(() => data)
            }
            return data
          })
      }
      return Promise.reject('quota is reached')
    })
}

dbapi.removeGroupDevices = function(group, serials) {
  const duration = apiutil.computeDuration(group, -serials.length)

  return dbapi.updateUserGroupDuration(group.owner.email, group.duration, duration)
    .then(function() {
      return dbapi.updateGroup(
        group.id
        , {
          duration: duration
          , devices: _.difference(group.devices, serials)
        })
    })
}

function setLockOnDevice(serial, state) {
  return db.connect().then(client => {
    return client.collection('devices').findOne({serial: serial}).then(device => {
      return client.collection('devices').updateOne({
          serial: serial
        }
        ,
        {
          $set: {'group.lock': device.group.lock !== state ? state : device.group.lock}
        }
      )
    })
  })
}

dbapi.lockDevice = function(serial) {
  return setLockOnDevice(serial, true)
}

dbapi.lockDevices = function(serials) {
  return dbapi.setLockOnDevices(serials, true)
}

dbapi.unlockDevice = function(serial) {
  return setLockOnDevice(serial, false)
}

dbapi.unlockDevices = function(serials) {
  return dbapi.setLockOnDevices(serials, false)
}

dbapi.setLockOnDevices = function(serials, lock) {
  return db.connect().then(client => {
    return client.collection('devices').updateMany(
      {serial: {$in: serials}}
      , {
        $set: {
          'group.lock': lock
        }
      }
    )
  })
}

function setLockOnUser(email, state) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(oldDoc => {
      return client.collection('users').updateOne({
          email: email
        }
        ,
        {
          $set: {'groups.lock': oldDoc.groups.lock !== state ? state : oldDoc.groups.lock}
        }
      )
        .then(updateStats => {
          return client.collection('users').findOne({email: email}).then(newDoc => {
            updateStats.changes = [
              {new_val: {...newDoc}, old_val: {...oldDoc}}
            ]
            return updateStats
          })
        })
    })
  })
}

dbapi.lockUser = function(email) {
  function wrappedlockUser() {
    return setLockOnUser(email, true)
      .then(function(stats) {
        return apiutil.lockResult(stats)
      })
  }

  return apiutil.setIntervalWrapper(
    wrappedlockUser
    , 10
    , Math.random() * 500 + 50)
}

dbapi.unlockUser = function(email) {
  return setLockOnUser(email, false)
}

dbapi.lockGroupByOwner = function(email, id) {
  function wrappedlockGroupByOwner() {
    return dbapi.getRootGroup().then(function(rootGroup) {
      return db.connect().then(client => {
        return client.collection('users').findOne({email: email}).then(triggeredUser => {
          return client.collection('groups').findOne({id: id}).then(group => {
            if (!group) {
              return {
                modifiedCount: 0
                , matchedCount: 0
              }
            }
            return client.collection('groups').updateOne(
              {
                id: id
              },
              {
                $set: {
                  'lock.user': !group.lock.admin &&
                  !group.lock.user &&
                  (group.owner.email === email || rootGroup.owner.email === email || triggeredUser.privilege === apiutil.ADMIN) ?
                    true : group.lock.user
                }
              }
            ).then(updateStats => {
              return client.collection('groups').findOne({id: id}).then(newDoc => {
                updateStats.changes = [
                  {new_val: {...newDoc}, old_val: {...group}}
                ]
                return updateStats
              })
            })
          })
        })
      })
        .then(function(stats) {
          const result = apiutil.lockResult(stats)

          if (!result.status) {
            return dbapi.getGroupAsOwnerOrAdmin(email, id).then(function(group) {
              if (!group) {
                result.data.locked = false
                result.status = true
              }
              return result
            })
          }
          return result
        })
    })
  }

  return apiutil.setIntervalWrapper(
    wrappedlockGroupByOwner
    , 10
    , Math.random() * 500 + 50)
}

dbapi.lockGroup = function(id) {
  function wrappedlockGroup() {
    return db.connect().then(client => {
      return client.collection('groups').findOne({id: id}).then(group => {
        return client.collection('groups').updateOne(
          {
            id: id
          },
          {
            $set: {
              'lock.user': !group.lock.admin && !group.lock.user ? true : group.lock.user
            }
          }
        ).then(function(stats) {
          return apiutil.lockResult(stats)
        })
      })
    })
  }

  return apiutil.setIntervalWrapper(
    wrappedlockGroup
    , 10
    , Math.random() * 500 + 50)
}

dbapi.unlockGroup = function(id) {
  return db.connect().then(client => {
    return client.collection('groups').updateMany(
      {id: id},
      {
        $set: {
          'lock.user': false
        }
      }
    )
  })
}

dbapi.adminLockGroup = function(id, lock) {
  function wrappedAdminLockGroup() {
    return db.connect().then(client => {
      return client.collection('groups').findOne({id: id}).then(oldDoc => {
        return client.collection('groups').updateOne({
            id: id
          },
          {
            $set: {
              'lock.user': false
              , 'lock.admin': true
            }
          }
        ).then(updateStats => {
          return client.collection('groups').findOne({id: id}).then(newDoc => {
            updateStats.changes = [
              {new_val: {...newDoc}, old_val: {...oldDoc}}
            ]
            return updateStats
          })
        })
      })
        .then(function(stats) {
          const result = {}

          if (stats.modifiedCount > 0) {
            result.status =
              stats.changes[0].new_val.lock.admin && !stats.changes[0].old_val.lock.user
            if (result.status) {
              result.data = true
              lock.group = stats.changes[0].new_val
            }
          }
          else if (stats.skipped) {
            result.status = true
          }
          return result
        })
    })
  }

  return apiutil.setIntervalWrapper(
    wrappedAdminLockGroup
    , 10
    , Math.random() * 500 + 50)
}

dbapi.adminUnlockGroup = function(lock) {
  if (lock.group) {
    return db.connect().then(client => {
      return client.collection('groups').updateOne(
        {
          id: lock.group.id
        }
        , {
          $set: {
            'lock.user': false
            , 'lock.admin': false
          }
        }
      )
    })
  }
  return true
}

dbapi.getRootGroup = function() {
  return dbapi.getGroupByIndex(apiutil.ROOT, 'privilege').then(function(group) {
    if (!group) {
      throw new Error('Root group not found')
    }
    return group
  })
}

dbapi.getUserGroup = function(email, id) {
  return db.connect().then(client => {
    return client.collection('groups').find({
      users: {$in: [email]}
      , id: id
    }).toArray().then(groups => {
      return groups[0]
    })
  })
}

dbapi.getUserGroups = function(email) {
  return db.connect().then(client => {
    return client.collection('groups').find({users: {$in: [email]}}).toArray()
  })
}

dbapi.getOnlyUserGroups = function(email) {
  return db.connect().then(client => {
    return client.collection('groups').find({
      users: {$in: [email]}
      , 'owner.email': {$ne: email}
    }).toArray()
  })
}

dbapi.getTransientGroups = function() {
  return db.connect().then(client => {
    return client.collection('groups').find({
        class: {$nin: [apiutil.BOOKABLE, apiutil.STANDARD]}
      }
    ).toArray()
  })
}

dbapi.getDeviceTransientGroups = function(serial) {
  return db.connect().then(client => {
    return client.collection('groups').find({
        devices: serial
        , class: {$nin: [apiutil.BOOKABLE, apiutil.STANDARD]}
      }
    ).toArray()
  })
}

dbapi.isDeviceBooked = function(serial) {
  return dbapi.getDeviceTransientGroups(serial)
    .then(function(groups) {
      return groups.length > 0
    })
}

dbapi.isRemoveGroupUserAllowed = function(email, targetGroup) {
  if (targetGroup.class !== apiutil.BOOKABLE) {
    return Promise.resolve(true)
  }
  return db.connect().then(client => {
    return client.collection('groups').aggregate([
      {$match: {'owner.email': email}}
      , {
        $match: {
          $and: [
            {$ne: ['$class', apiutil.BOOKABLE]}
            , {$ne: ['$class', apiutil.STANDARD]}
            , {$not: [{$eq: [{$setIntersection: [targetGroup.devices, ['$devices']]}, []]}]}
          ]
        }
      }
    ]).toArray()
  })
    .then(function(groups) {
      return groups.length === 0
    })
}

dbapi.isUpdateDeviceOriginGroupAllowed = function(serial, targetGroup) {
  return dbapi.getDeviceTransientGroups(serial)
    .then(function(groups) {
      if (groups.length) {
        if (targetGroup.class === apiutil.STANDARD) {
          return false
        }
        for (const group of groups) {
          if (targetGroup.users.indexOf(group.owner.email) < 0) {
            return false
          }
        }
      }
      return true
    })
}

dbapi.getDeviceGroups = function(serial) {
  return db.connect().then(client => {
    return client.collection('groups').find({
        devices: {$in: [serial]}
      }
    ).toArray()
  })
}

dbapi.getGroupAsOwnerOrAdmin = function(email, id) {
  return dbapi.getGroup(id).then(function(group) {
    if (group) {
      if (email === group.owner.email) {
        return group
      }
      return dbapi.loadUser(email).then(function(user) {
        if (user && user.privilege === apiutil.ADMIN) {
          return group
        }
        return false
      })
    }
    return false
  })
}

dbapi.getOwnerGroups = function(email) {
  return dbapi.getRootGroup().then(function(group) {
    if (email === group.owner.email) {
      return dbapi.getGroups()
    }
    return dbapi.getGroupsByIndex(email, 'owner')
  })
}

dbapi.createGroup = function(data) {
  const id = util.format('%s', uuid.v4()).replace(/-/g, '')
  return db.connect().then(client => {
    let object = Object.assign(data, {
      id: id
      , users: _.union(data.users, [data.owner.email])
      , devices: []
      , createdAt: dbapi.getNow()
      , lock: {
        user: false
        , admin: false
      }
      , ticket: null
    })
    return client.collection('groups').insertOne(object)
      .then(() => {
        return dbapi.getGroup(id)
      })
  })
}

dbapi.createUserGroup = function(data) {
  return dbapi.reserveUserGroupInstance(data.owner.email).then(function(stats) {
    if (stats.modifiedCount > 0) {
      return dbapi.getRootGroup().then(function(rootGroup) {
        data.users = [rootGroup.owner.email]
        return dbapi.createGroup(data).then(function(group) {
          return Promise.all([
            dbapi.addGroupUser(group.id, group.owner.email)
            , dbapi.addGroupUser(group.id, rootGroup.owner.email)
          ])
            .then(function() {
              return dbapi.getGroup(group.id)
            })
        })
      })
    }
    return false
  })
}

dbapi.updateGroup = function(id, data) {
  return db.connect().then(client => {
    return client.collection('groups').updateOne(
      {id: id}
      , {
        $set: data
      }
    ).then(() => {
      return client.collection('groups').findOne({id: id})
    })
  })
}

dbapi.reserveUserGroupInstance = function(email) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(user => {
      let consumed, allocated
      try {
        consumed = user.groups.quotas.consumed.number
      }
 catch (TypeError) {
        consumed = 0
      }
      try {
        allocated = user.groups.quotas.allocated.number
      }
 catch (TypeError) {
        allocated = 0
      }
      return client.collection('users').updateOne(
        {email: email},
        {
          $set: {
            'groups.quotas.consumed.number': consumed < allocated ? consumed + 1 : consumed
          }
        }
      )
    })
  })
}

dbapi.releaseUserGroupInstance = function(email) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(user => {
      let consumed
      try {
        consumed = user.groups.quotas.consumed.number
      }
 catch (TypeError) {
        consumed = 0
      }
      return client.collection('users').updateOne(
        {email: email},
        {
          $set: {
            'groups.quotas.consumed.number': consumed >= 1 ? consumed - 1 : consumed
          }
        }
      )
    })
  })
}

dbapi.updateUserGroupDuration = function(email, oldDuration, newDuration) {
  return db.connect().then(client => {
    return client.collection('users').updateOne(
      {email: email}
      , [{
        $set: {
          'groups.quotas.consumed.duration': {
            $cond: [
              {$lte: [{$sum: ['$groups.quotas.consumed.duration', newDuration, -oldDuration]}, '$groups.quotas.allocated.duration']}
              , {$sum: ['$groups.quotas.consumed.duration', newDuration, -oldDuration]}
              , '$groups.quotas.consumed.duration'
            ]
          }
        }
      }]
    )
  })
}

dbapi.updateUserGroupsQuotas = function(email, duration, number, repetitions) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(oldDoc => {
      let consumed = oldDoc.groups.quotas.consumed.duration
      let allocated = oldDoc.groups.quotas.allocated.duration
      let consumedNumber = oldDoc.groups.quotas.consumed.number
      let allocatedNumber = oldDoc.groups.quotas.allocated.number
      return client.collection('users').updateOne(
        {email: email}
        , {
          $set: {
            'groups.quotas.allocated.duration': duration && consumed <= duration &&
            (!number || consumedNumber <= number) ? duration : allocated
            , 'groups.quotas.allocated.number': number && consumedNumber <= number &&
            (!duration || consumed <= duration) ? number : allocatedNumber
            , 'groups.quotas.repetitions': repetitions || oldDoc.groups.quotas.repetitions
          }
        }
      )
        .then(updateStats => {
          return client.collection('users').findOne({email: email}).then(newDoc => {
            updateStats.changes = [
              {new_val: {...newDoc}, old_val: {...oldDoc}}
            ]
            return updateStats
          })
        })
    })
  })
}

dbapi.updateDefaultUserGroupsQuotas = function(email, duration, number, repetitions) {
  return db.connect().then(client => {
    return client.collection('users').updateOne(
      {email: email}
      , [{
        $set: {
          defaultGroupsDuration: {
            $cond: [
              {
                $ne: [duration, null]
              }
              , duration
              , '$groups.quotas.defaultGroupsDuration'
            ]
          }
          , defaultGroupsNumber: {
            $cond: [
              {
                $ne: [number, null]
              }
              , number
              , '$groups.quotas.defaultGroupsNumber'
            ]
          }
          , defaultGroupsRepetitions: {
            $cond: [
              {
                $ne: [repetitions, null]
              }
              , repetitions
              , '$groups.quotas.defaultGroupsRepetitions'
            ]
          }
        }
      }]
    )
  })
}

dbapi.updateDeviceCurrentGroupFromOrigin = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').findOne({serial: serial}).then(device => {
      return client.collection('groups').findOne({id: device.group.origin}).then(group => {
        return client.collection('devices').updateOne(
          {serial: serial}
          , {
            $set: {
              'group.id': device.group.origin
              , 'group.name': device.group.originName
              , 'group.owner': group.owner
              , 'group.lifeTime': group.dates[0]
              , 'group.class': group.class
              , 'group.repetitions': group.repetitions
            }
          }
        )
      })
    })
  })
}

dbapi.askUpdateDeviceOriginGroup = function(serial, group, signature) {
  return db.connect().then(client => {
    return client.collection('groups').updateOne(
      {
        id: group.id
      }
      , {
        $set: {
          'ticket.serial': serial
          , 'ticket.signature': signature
        }
      }
    )
  })
}

dbapi.updateDeviceOriginGroup = function(serial, group) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial}
      , [{
        $set: {
          'group.origin': group.id
          , 'group.originName': group.name
          , 'group.id': {
            $cond: [
              {
                $eq: ['$group.id', '$group.origin']
              }
              , group.id
              , '$group.id'
            ]
          }
          , 'group.name': {
            $cond: [
              {
                $eq: ['$group.id', '$group.origin']
              }
              , group.name
              , '$group.name'
            ]
          }
          , 'group.owner': {
            $cond: [
              {
                $eq: ['$group.id', '$group.origin']
              }
              , group.owner
              , '$group.owner'
            ]
          }
          , 'group.lifeTime': {
            $cond: [
              {
                $eq: ['$group.id', '$group.origin']
              }
              , group.lifeTime
              , '$group.lifeTime'
            ]
          }
          , 'group.class': {
            $cond: [
              {
                $eq: ['$group.id', '$group.origin']
              }
              , group.class
              , '$group.class'
            ]
          }
          , 'group.repetitions': {
            $cond: [
              {
                $eq: ['$group.id', '$group.origin']
              }
              , group.repetitions
              , '$group.repetitions'
            ]
          }
        }
      }]
    )
  })
    .then(function() {
      return db.connect().then(clients => {
        return clients.collection('devices').findOne({serial: serial})
      })
    })
}

dbapi.updateDeviceCurrentGroup = function(serial, group) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          'group.id': group.id
          , 'group.name': group.name
          , 'group.owner': group.owner
          , 'group.lifeTime': group.dates[0]
          , 'group.class': group.class
          , 'group.repetitions': group.repetitions
        }
      }
    )
  })
}

dbapi.updateDevicesCurrentGroup = function(serials, group) {
  return db.connect().then(client => {
    return client.collection('devices').updateMany(
      {serial: {$in: serials}},
      {
        $set: {
          'group.id': group.id
          , 'group.name': group.name
          , 'group.owner': group.owner
          , 'group.lifeTime': group.dates[0]
          , 'group.class': group.class
          , 'group.repetitions': group.repetitions
        }
      }
    )
  })
}

dbapi.returnDeviceToOriginGroup = function(serial) {
  return dbapi.loadDeviceBySerial(serial)
    .then((device) => {
      return dbapi.getRootGroup()
        .then((group) => {
          return db.connect().then(client => {
            return client.collection('devices').updateOne(
              {serial: device.serial},
              {
                $set: {
                  'group.id': group.id
                  , 'group.name': group.name
                  , 'group.owner': group.owner
                  , 'group.lifeTime': group.dates[0]
                  , 'group.class': group.class
                  , 'group.repetitions': group.repetitions
                }
              }
            )
          })
        })
    })
}

dbapi.returnDevicesToOriginGroup = function(serials) {
  return dbapi.getRootGroup()
    .then(group => {
      return db.connect().then(client => {
        return client.collection('devices').updateMany(
          {serial: {$in: serials}}
          , {
            $set: {
              'group.id': group.id
              , 'group.name': group.name
              , 'group.owner': group.owner
              , 'group.lifeTime': group.dates[0]
              , 'group.class': group.class
              , 'group.repetitions': group.repetitions
            }
          }
        )
      })
    })
}

dbapi.updateUserGroup = function(group, data) {
  return dbapi.updateUserGroupDuration(group.owner.email, group.duration, data.duration)
    .then(function(stats) {
      if (stats.modifiedCount > 0 || stats.matchedCount > 0 && group.duration === data.duration) {
        return dbapi.updateGroup(group.id, data)
      }
      return false
    })
}

dbapi.deleteGroup = function(id) {
  return db.connect().then(client => {
    return client.collection('groups').deleteOne({id: id})
  })
}

dbapi.deleteUserGroup = function(id) {
  function deleteUserGroup(group) {
    return dbapi.deleteGroup(group.id)
      .then(() => {
        return Promise.map(group.users, function(email) {
          return dbapi.removeGroupUser(group.id, email)
        })
      })
      .then(() => {
        return dbapi.releaseUserGroupInstance(group.owner.email)
      })
      .then(() => {
        return dbapi.updateUserGroupDuration(group.owner.email, group.duration, 0)
      })
      .then(() => {
        return dbapi.returnDevicesToOriginGroup(group.devices)
      })
      .then(function() {
        return 'deleted'
      })
  }

  return dbapi.getGroup(id).then(function(group) {
    if (group.privilege !== apiutil.ROOT) {
      return deleteUserGroup(group)
    }
    return 'forbidden'
  })
}

dbapi.createUser = function(email, name, ip) {
  return dbapi.getRootGroup().then(function(group) {
    return dbapi.loadUser(group.owner.email).then(function(adminUser) {
      let userObj = {
        email: email
        , name: name
        , ip: ip
        , group: wireutil.makePrivateChannel()
        , lastLoggedInAt: dbapi.getNow()
        , createdAt: dbapi.getNow()
        , forwards: []
        , settings: {}
        , acceptedPolicy: false
        , privilege: adminUser ? apiutil.USER : apiutil.ADMIN
        , groups: {
          subscribed: []
          , lock: false
          , quotas: {
            allocated: {
              number: group.envUserGroupsNumber
              , duration: group.envUserGroupsDuration
            }
            , consumed: {
              number: 0
              , duration: 0
            }
            , defaultGroupsNumber: group.envUserGroupsNumber
            , defaultGroupsDuration: group.envUserGroupsDuration
            , defaultGroupsRepetitions: group.envUserGroupsRepetitions
            , repetitions: group.envUserGroupsRepetitions
          }
        }
      }
      return db.connect().then(client => {
        return client.collection('users').insertOne(userObj)
      })
        .then(function(stats) {
          if (stats.insertedId) {
            return dbapi.addGroupUser(group.id, email).then(function() {
              return dbapi.loadUser(email).then(function(user) {
                stats.changes = [
                  {new_val: {...user}}
                ]
                return stats
              })
            })
          }
          return stats
        })
    })
  })
}

dbapi.saveUserAfterLogin = function(user) {
  return db.connect().then(client => {
    return client.collection('users').updateOne({email: user.email},
      {
        $set: {
          name: user.name
          , ip: user.ip
          , lastLoggedInAt: dbapi.getNow()
        }
      })
      .then(function(stats) {
        if (stats.modifiedCount === 0) {
          return dbapi.createUser(user.email, user.name, user.ip)
        }
        return stats
      })
  })
}

dbapi.loadUser = function(email) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email})
  })
}

dbapi.updateUsersAlertMessage = function(alertMessage) {
  return db.connect().then(client => {
    return client.collection('users').updateOne(
      {
        email: apiutil.STF_ADMIN_EMAIL
      }
      , {
        $set: Object.fromEntries(Object.entries(alertMessage).map(([key, value]) =>
          ['settings.alertMessage.' + key, value]
        )),
      }
    ).then(updateStats => {
      return client.collection('users').findOne({email: apiutil.STF_ADMIN_EMAIL}).then(updatedMainAdmin => {
        updateStats.changes = [
          {new_val: {...updatedMainAdmin}}
        ]
        return updateStats
      })
    })
  })
}

dbapi.updateUserSettings = function(email, changes) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(user => {
      return client.collection('users').updateOne(
        {
          email: email
        }
        , {
          $set: {
            settings: {...user.settings, ...changes}
          }
        }
      )
    })
  })
}

dbapi.resetUserSettings = function(email) {
  return db.connect().then(client => {
    return client.collection('users').updateOne({email: email},
      {
        $set: {
          settings: {}
        }
      })
  })
}

dbapi.insertUserAdbKey = function(email, key) {
  let data = {
    title: key.title
    , fingerprint: key.fingerprint
  }
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(user => {
      let adbKeys = user.adbKeys ? user.adbKeys : []
      adbKeys.push(data)
      return client.collection('users').updateOne(
        {email: email}
        , {$set: {adbKeys: user.adbKeys ? adbKeys : [data]}}
      )
    })
  })
}

dbapi.deleteUserAdbKey = function(email, fingerprint) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(user => {
      return client.collection('users').updateOne(
        {email: email}
        , {
          $set: {
            adbKeys: user.adbKeys ? user.adbKeys.filter(key => {
              return key.fingerprint !== fingerprint
            }) : []
          }
        }
      )
    })
  })
}

dbapi.lookupUsersByAdbKey = function(fingerprint) {
  return db.connect().then(client => {
    return client.collection('users').find({
      adbKeys: fingerprint
    }).toArray()
  })
}

dbapi.lookupUserByAdbFingerprint = function(fingerprint) {
  return db.connect().then(client => {
    return client.collection('users').find(
      {adbKeys: {$elemMatch: {fingerprint: fingerprint}}}
      , {email: 1, name: 1, group: 1, _id: 0}
    ).toArray()
      .then(function(users) {
        switch (users.length) {
          case 1:
            return users[0]
          case 0:
            return null
          default:
            throw new Error('Found multiple users for same ADB fingerprint')
        }
      })
  })
}

dbapi.lookupUserByVncAuthResponse = function(response, serial) {
  return db.connect().then(client => {
    return client.collection('vncauth').aggregate([
      {
        $match: {
          'responsePerDevice.response': response
          , 'responsePerDevice.serial': serial
        }
      }
      , {
        $lookup: {
          from: 'users'
          , localField: 'userId'
          , foreignField: '_id'
          , as: 'users'
        }
      }
      , {
        $project: {
          email: 1
          , name: 1
          , group: 1
        }
      }
    ]).toArray()
  })
    .then(function(groups) {
      switch (groups.length) {
        case 1:
          return groups[0]
        case 0:
          return null
        default:
          throw new Error('Found multiple users with the same VNC response')
      }
    })
}

dbapi.loadUserDevices = function(email) {
  return db.connect().then(client => {
    return client.collection('users').findOne({email: email}).then(user => {
      let userGroups = user.groups.subscribed
      return client.collection('devices').find(
        {
          'owner.email': email
          , present: true
          , 'group.id': {$in: userGroups}
        }
      ).toArray()
    })
  })
}

dbapi.saveDeviceLog = function(serial, entry) {
  return db.connect().then(client => {
    return client.collection('logs').insertOne({
        id: uuid.v4()
        , serial: serial
        , timestamp: new Date(entry.timestamp)
        , priority: entry.priority
        , tag: entry.tag
        , pid: entry.pid
        , message: entry.message
      }
    )
  })
}

dbapi.saveDeviceInitialState = function(serial, device) {
  let data = {
    present: true
    , presenceChangedAt: dbapi.getNow()
    , provider: device.provider
    , owner: null
    , status: device.status
    , statusChangedAt: dbapi.getNow()
    , bookedBefore: 0
    , ready: false
    , reverseForwards: []
    , remoteConnect: false
    , remoteConnectUrl: null
    , usage: null
    , logs_enabled: false
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne({serial: serial},
      {
        $set: data
      }
    )
      .then(stats => {
        if (stats.modifiedCount === 0 && stats.matchedCount === 0) {
          return dbapi.getRootGroup().then(function(group) {
            data.serial = serial
            data.createdAt = dbapi.getNow()
            data.group = {
              id: group.id
              , name: group.name
              , lifeTime: group.dates[0]
              , owner: group.owner
              , origin: group.id
              , class: group.class
              , repetitions: group.repetitions
              , originName: group.name
              , lock: false
            }
            return client.collection('devices').insertOne(data)
              .then(() => {
                return dbapi.addOriginGroupDevice(group, serial)
              })
          })
        }
        return true
      })
      .then(() => {
        return client.collection('devices').findOne({serial: serial})
      })
  })
}

dbapi.setDeviceConnectUrl = function(serial, url) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          remoteConnectUrl: url
          , remoteConnect: true
        }
      }
    )
  })
}

dbapi.unsetDeviceConnectUrl = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          remoteConnectUrl: null
          , remoteConnect: false
        }
      }
    )
  })
}

dbapi.saveDeviceStatus = function(serial, status) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          status: status
          , statusChangedAt: dbapi.getNow()
        }
      }
    )
  })
}

dbapi.enhanceStatusChangedAt = function(serial, timeout) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          statusChangedAt: dbapi.getNow()
          , bookedBefore: timeout
        }
      }
    )
  })
}

dbapi.setDeviceOwner = function(serial, owner) {
  log.info('Setting device owner in db - ' + owner.email)
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {owner: owner}
      }
    )
  })
}

dbapi.setDevicePlace = function(serial, place) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {place: place}
      }
    )
  })
}

dbapi.setDeviceStorageId = function(serial, storageId) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {storageId: storageId}
      }
    )
  })
}


dbapi.unsetDeviceOwner = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {owner: null}
      }
    )
  })
}

dbapi.setDevicePresent = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          present: true
          , presenceChangedAt: dbapi.getNow()
        }
      }
    )
  })
}

dbapi.setDeviceAbsent = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          owner: null
          , present: false
          , presenceChangedAt: dbapi.getNow()
        }
      }
    )
  })
}

dbapi.setDeviceUsage = function(serial, usage) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          usage: usage
          , usageChangedAt: dbapi.getNow()
        }
      }
    )
  })
}

dbapi.unsetDeviceUsage = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          usage: null
          , usageChangedAt: dbapi.getNow()
          , logs_enabled: false
        }
      }
    )
  })
}

dbapi.setDeviceAirplaneMode = function(serial, enabled) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          airplaneMode: enabled
        }
      }
    )
  })
}

dbapi.setDeviceBattery = function(serial, battery) {
  const batteryData = {
    status: battery.status
    , health: battery.health
    , source: battery.source
    , level: battery.level
    , scale: battery.scale
    , temp: battery.temp
    , voltage: battery.voltage
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {battery: batteryData}
      }
    )
  })
}

dbapi.setDeviceBrowser = function(serial, browser) {
  const browserData = {
    selected: browser.selected
    , apps: browser.apps
  }

  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {browser: browserData}
      }
    )
  })
}

dbapi.setDeviceServicesAvailability = function(serial, service) {
  const serviceData = {
    hasHMS: service.hasHMS
    , hasGMS: service.hasGMS
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {service: serviceData}
      }
    )
  })
}

dbapi.setDeviceConnectivity = function(serial, connectivity) {
  const networkData = {
    connected: connectivity.connected
    , type: connectivity.type
    , subtype: connectivity.subtype
    , failover: !!connectivity.failover
    , roaming: !!connectivity.roaming
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {network: networkData}
      }
    )
  })
}

dbapi.setDevicePhoneState = function(serial, state) {
  const networkData = {
    state: state.state
    , manual: state.manual
    , operator: state.operator
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {network: networkData}
      }
    )
  })
}

dbapi.setDeviceRotation = function(serial, rotation) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {
          'display.rotation': rotation
        }
      }
    )
  })
}

dbapi.setIosDeviceRotation = function(message) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: message.serial},
      {
        $set: {
          'display.rotation': message.rotation
          , 'display.height': message.height
          , 'display.width': message.width
        }
      }
    )
  })
}

dbapi.setDeviceNote = function(serial, note) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {notes: note}
      }
    )
  })
}

dbapi.setDeviceReverseForwards = function(serial, forwards) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: {reverseForwards: forwards}
      }
    )
  })
}

dbapi.setDeviceReady = function(serial, channel) {
  const data = {
    channel: channel
    , ready: true
    , owner: null
    , present: true
    , reverseForwards: []
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: data
      }
    )
  })
}

dbapi.saveDeviceIdentity = function(serial, identity) {
  const identityData = {
    platform: identity.platform
    , manufacturer: identity.manufacturer
    , operator: identity.operator
    , model: identity.model
    , version: identity.version
    , abi: identity.abi
    , sdk: identity.sdk
    , display: identity.display
    , phone: identity.phone
    , product: identity.product
    , cpuPlatform: identity.cpuPlatform
    , openGLESVersion: identity.openGLESVersion
    , marketName: identity.marketName
    , macAddress: identity.macAddress
    , ram: identity.ram
  }

  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: serial},
      {
        $set: identityData
      }
    )
  })
}

dbapi.loadDevices = function(groups) {
  return db.connect().then(client => {
    if (groups.length > 0) {
      return client.collection('devices').find(
        {
          'group.id': {$in: groups}
        }
      ).toArray()
    }
    else {
      return client.collection('devices').find().toArray()
    }
  })
}

dbapi.loadDevicesByOrigin = function(groups) {
  return db.connect().then(client => {
    return client.collection('devices').find(
      {'group.origin': {$in: groups}}
    ).toArray()
  })
}

dbapi.loadBookableDevices = function(groups) {
  return db.connect().then(client => {
    return client.collection('devices').find(
      {
        $and: [
          {'group.origin': {$in: groups}}
          , {present: {$eq: true}}
          , {ready: {$eq: true}}
          , {owner: {$eq: null}}
        ]
      }
    ).toArray()
  })
}

dbapi.loadBookableDevicesWithFiltersLock = function(groups, abi, model, type, sdk, version, devicesFunc, limit = null) {
  let filterOptions = []
  let serials = []
  if (abi) {
    filterOptions.push({abi: {$eq: abi}})
  }
  if (model) {
    filterOptions.push({model: {$eq: model}})
  }
  if (sdk) {
    filterOptions.push({sdk: {$eq: sdk}})
  }
  if (version) {
    filterOptions.push({version: {$eq: version}})
  }
  if (type) {
    filterOptions.push({type: {$eq: type}})
  }
  return db.connect().then(client => {
    let result = client.collection('devices').find(
      {
        $and: [
          {'group.origin': {$in: groups}}
          , {'group.class': {$eq: apiutil.BOOKABLE}}
          , {present: {$eq: true}}
          , {ready: {$eq: true}}
          , {owner: {$eq: null}}
          , {'group.lock': {$eq: false}}
          , ...filterOptions
        ]
      }
    )
    if (limit) {
      result = result.limit(limit)
    }
    return result.toArray()
      .then(devices => {
        serials = devices.map(device => device.serial)
        dbapi.lockDevices(serials).then(() => {
          return devicesFunc(devices)
        })
          .finally(() => {
            if (serials.length > 0) {
              dbapi.unlockDevices(serials)
            }
          })
      })
  })
}

dbapi.loadStandardDevices = function(groups) {
  return db.connect().then(client => {
    return client.collection('devices')
      .find({
        'group.class': apiutil.STANDARD
        , 'group.id': {$in: groups}
      })
      .toArray()
  })
}

dbapi.loadPresentDevices = function() {
  return db.connect().then(client => {
    return client.collection('devices').find({present: true})
  })
}

dbapi.loadDeviceBySerial = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').findOne({serial: serial})
  })
}

dbapi.loadDevicesBySerials = function(serials) {
  return db.connect().then(client => {
    return client.collection('devices').find({serial: {$in: serials}}).toArray()
  })
}

dbapi.loadDevice = function(groups, serial) {
  return db.connect().then(client => {
    return client.collection('devices').findOne(
      {
        serial: serial
        , 'group.id': {$in: groups}
      }
    )
  })
}

dbapi.loadBookableDevice = function(groups, serial) {
  return db.connect().then(client => {
    return client.collection('devices')
      .find(
        {
          serial: serial
          , 'group.origin': {$in: groups}
          , 'group.class': {$ne: apiutil.STANDARD}
        }
      )
      .toArray()
  })
}

dbapi.loadDeviceByCurrent = function(groups, serial) {
  return db.connect().then(client => {
    return client.collection('devices')
      .find(
        {
          serial: serial
          , 'group.id': {$in: groups}
        }
      )
      .toArray()
  })
}

dbapi.loadDeviceByOrigin = function(groups, serial) {
  return db.connect().then(client => {
    return client.collection('devices')
      .find(
        {
          serial: serial
          , 'group.origin': {$in: groups}
        }
      )
      .toArray()
  })
}

dbapi.saveUserAccessToken = function(email, token) {
  return db.connect().then(client => {
    return client.collection('accessTokens').insertOne(
      {
        email: email
        , id: token.id
        , title: token.title
        , jwt: token.jwt
      }
    )
  })
}

dbapi.removeUserAccessTokens = function(email) {
  return db.connect().then(client => {
    return client.collection('accessTokens').deleteMany(
      {
        email: email
      }
    )
  })
}

dbapi.removeUserAccessToken = function(email, title) {
  return db.connect().then(client => {
    return client.collection('accessTokens').deleteOne(
      {
        email: email
        , title: title
      }
    )
  })
}

dbapi.removeAccessToken = function(id) {
  return db.connect().then(client => {
    return client.collection('accessTokens').deleteOne({id: id})
  })
}

dbapi.loadAccessTokens = function(email) {
  return db.connect().then(client => {
    return client.collection('accessTokens').find({email: email}).toArray()
  })
}

dbapi.loadAccessToken = function(id) {
  return db.connect().then(client => {
    return client.collection('accessTokens').findOne({id: id})
  })
}

dbapi.grantAdmin = function(email) {
  return db.connect().then(client => {
    return client.collection('users').updateOne({email: email},
      {
        $set: {
          privilege: apiutil.ADMIN
        }
      })
  })
}

dbapi.revokeAdmin = function(email) {
  return db.connect().then(client => {
    return client.collection('users').updateOne({email: email},
      {
        $set: {
          privilege: apiutil.USER
        }
      })
  })
}

dbapi.makeOriginGroupBookable = function() {
  return db.connect().then(client => {
    return client.collection('groups').updateOne(
      {
        name: 'Common'
      }
      , {
        $set: {
          class: apiutil.BOOKABLE
        }
      }
    )
  })
}

dbapi.acceptPolicy = function(email) {
  return db.connect().then(client => {
    return client.collection('users').updateOne({email: email},
      {
        $set: {
          acceptedPolicy: true
        }
      })
  })
}

dbapi.writeStats = function(user, serial, action) {
  return db.connect().then(client => {
    return client.collection('stats').insertOne({
        id: (uuid.v4() + '_' + user.email + '_' + user.group)
        , user: user.email
        , action: action
        , device: serial
        , timestamp: dbapi.getNow()
      }
    )
  })
}

dbapi.getDevicesCount = function() {
  return db.connect().then(client => {
    return client.collection('devices').find().count()
  })
}

dbapi.getReadyDevices = function() {
  return db.connect().then(client => {
    return client.collection('devices').find(
      {
        present: true
        , usage: null
        , 'group.lock': {$eq: false}
      }
    ).toArray()
  })
}

dbapi.getOfflineDevicesCount = function() {
  return db.connect().then(client => {
    return client.collection('devices').find(
      {
        present: false
      }
    ).count()
  })
}

dbapi.getOfflineDevices = function() {
  return db.connect().then(client => {
    return client.collection('devices').find(
      {present: false},
      {_id: 0, 'provider.name': 1}
    ).toArray()
  })
}

dbapi.isPortExclusive = function(newPort) {
  return dbapi.getAllocatedAdbPorts().then((ports) => {
    let result = !!ports.find(port => port === newPort)
    return !result
  })
}

dbapi.getLastAdbPort = function() {
  return dbapi.getAllocatedAdbPorts().then((ports) => {
    if (ports.length === 0) {
      return 0
    }
    return Math.max(...ports)
  })
}

dbapi.getAllocatedAdbPorts = function() {
  return db.connect().then(client => {
    return client.collection('devices').find({}, {adbPort: 1, _id: 0}).toArray().then(ports => {
      let result = []
      ports.forEach((port) => {
        if (port.adbPort) {
          let portNum
          if (typeof port.adbPort === 'string') {
            portNum = parseInt(port.adbPort.replace('"', '').replace('\'', ''), 10)
          }
          else {
            portNum = port.adbPort
          }
          result.push(portNum)
        }
      })
      return result.sort((a, b) => a - b)
    })
  })
}

dbapi.initiallySetAdbPort = function(serial) {
  return dbapi.getFreeAdbPort().then((port) => {
    if (port) {
      return dbapi.setAdbPort(serial, port)
    }
    else {
      return null
    }
  })
}

dbapi.setAdbPort = function(serial, port) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne({serial: serial}, {$set: {adbPort: port}}).then(() => {
      return port
    })
  })
}

dbapi.getAdbRange = function() {
  return db.getRange()
}

dbapi.getFreeAdbPort = function() {
  const adbRange = dbapi.getAdbRange().split('-')
  const adbRangeStart = parseInt(adbRange[0], 10)
  const adbRangeEnd = parseInt(adbRange[1], 10)

  return dbapi.getLastAdbPort().then((lastPort) => {
    if (lastPort === 0) {
      return adbRangeStart
    }
    let freePort = lastPort + 1
    if (freePort > adbRangeEnd || freePort <= adbRangeStart) {
      log.error('Port: ' + freePort + ' out of range [' + adbRangeStart + ':' + adbRangeEnd + ']')
      return null
    }

    return dbapi.isPortExclusive(freePort).then((result) => {
      if (result) {
        return freePort
      }
      else {
        log.error('Port: ' + freePort + ' not exclusive.')
        return null
      }
    })
  })
}

dbapi.generateIndexes = function() {
  return db.connect().then(client => {
    client.collection('devices').createIndex({serial: -1}, function(err, result) {
      log.info('Created indexes with result - ' + result)
    })
  })
}

dbapi.setDeviceSocketDisplay = function(data) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: data.serial},
      {
        $set: {
          iosClientChannel: data.channel
          , 'display.density': 2
          , 'display.fps': 60
          , 'display.id': 0
          , 'display.rotation': 0
          , 'display.secure': true
          , 'display.size': 4.971253395080566
          , 'display.xdpi': 294.9670104980469
          , 'display.ydpi': 295.56298828125
          , 'display.width': data.width
          , 'display.height': data.height
        }
      }
    ).then(() => {
      dbapi.loadDeviceBySerial(data.serial)
    })
  })
}

dbapi.setDeviceSocketPorts = function(data, publicIp) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: data.serial},
      {
        $set: {
          'display.url': `ws://${publicIp}:${data.screenPort}/`
          , 'display.screenPort': data.screenPort
          , 'display.connectPort': data.connectPort
        }
      }
    ).then(() => {
      dbapi.loadDeviceBySerial(data.serial)
    })
  })
}

dbapi.updateIosDevice = function(message) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {
        serial: message.id
      },
      {
        $set: {
          id: message.id
          , model: message.name
          , platform: message.platform
          , sdk: message.architect
        }
      }
    )
  })
}

dbapi.setDeviceIosBattery = function(message) {
    const batteryData = {
    status: message.status
    , health: message.health
    , source: message.source
    , level: message.level
    , scale: message.scale
    , temp: message.temp
    }
    return db.connect().then(client => {
      return client.collection('devices').updateOne(
        {serial: message.id},
        {
          $set: {battery: batteryData}
        }
      )
    })
}

dbapi.setDeviceIosVersion = function(message) {
    const data = {
      version: message.sdkVersion
    }

    return db.connect().then(client => {
      return client.collection('devices').updateOne(
        {serial: message.id},
        {
          $set: data
        }
      )
    })
}

dbapi.sizeIosDevice = function(serial, height, width, scale) {
    return db.connect().then(client => {
      return client.collection('devices').updateOne(
        {serial: serial},
        {
          $set: {
            'display.scale': scale
            , 'display.height': height
            , 'display.width': width
          }
        }
      )
    })
}

dbapi.getDeviceDisplaySize = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').findOne({serial: serial})
      .then(result => {
        return result.display
      })
  })
}

dbapi.checkIosDeviceConnected = function(data) {
  return dbapi.loadDeviceBySerial(data.id)
}

dbapi.setAbsentDisconnectedDevices = function() {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {
        ios: true
      },
      {
        $set: {
          present: false
          , ready: false
        }
      }
    )
  })
}

/* // @TODO refactor setDeviceApp
/!**
 *
 * @param message obj with application options
 * @method check if exists app with equal option
 * if exists replace it or append to installedApps list
 *
 *!/
dbapi.setDeviceApp = function(message) {
  return dbapi.loadDeviceBySerial(message.serial)
    .then(result => {
      let removePathApp = ''
      let {installedApps} = result
      let index = installedApps.findIndex(item => {
        return (
          item.bundleName === message.bundleName &&
          item.bundleId === message.bundleId
        )
      })
      if(index >= 0) {
        removePathApp = installedApps[index].pathToApp

        installedApps[index] = {
          bundleId: message.bundleId
          , bundleName: message.bundleName
          , pathToApp: message.pathToApp
        }
        db.run(r.table('devices').get(message.serial).update({
          installedApps
        }))
        return Promise.resolve({removePathApp})
      }
      else {
        db.run(r.table('devices').get(message.serial).update({
          installedApps: r.row('installedApps').default([]).append({
            bundleId: message.bundleId
            , bundleName: message.bundleName
            , pathToApp: message.pathToApp
          })
        }))
        return Promise.resolve({removePathApp: ''})
      }
    })
    .catch(err => {
      db.run(r.table('devices').get(message.serial).update({
        installedApps: r.row('installedApps').default([]).append({
          bundleId: message.bundleId
          , bundleName: message.bundleName
          , pathToApp: message.pathToApp
        })
      }))
      return Promise.reject(err)
    })
}*/

dbapi.getInstalledApplications = function(message) {
  return dbapi.loadDeviceBySerial(message.serial)
}

dbapi.getDeviceGroupOwner = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').findOne({serial: serial})
      .then(result => {
        return result.group.owner
      })
  })
}

dbapi.setDeviceGroupOwner = function(message) {
  let data = {
    'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com'
    , 'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator'
  }
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {serial: message.serial},
      {
        $set: data
      }
    )
  })
}

dbapi.setDeviceType = function(serial, type) {
  return db.connect().then(client => {
    return client.collection('devices').updateOne(
      {
        serial: serial
      },
      {
        $set: {
          deviceType: type
        }
      }
    )
  })
}

dbapi.getDeviceType = function(serial) {
  return db.connect().then(client => {
    return client.collection('devices').findOne({serial: serial})
      .then(result => {
        return result.deviceType
      })
  })
}

dbapi.initializeIosDeviceState = function(publicIp, message) {
  const screenWsUrlPattern =
  message.provider.screenWsUrlPattern || `ws://${publicIp}:${message.ports.screenPort}/`

  const data = {
    present: true
    , presenceChangedAt: dbapi.getNow()
    , provider: message.provider
    , owner: null
    , status: message.status
    , statusChangedAt: dbapi.getNow()
    , ready: true
    , reverseForwards: []
    , remoteConnect: false
    , remoteConnectUrl: null
    , usage: null
    , ios: true
    , iosClientChannel: message.serial
    , display: {
      density: DEFAULT_IOS_DEVICE_ARGS.DENSITY
      , fps: DEFAULT_IOS_DEVICE_ARGS.FPS
      , id: DEFAULT_IOS_DEVICE_ARGS.ID
      , rotation: DEFAULT_IOS_DEVICE_ARGS.ROTATION
      , secure: DEFAULT_IOS_DEVICE_ARGS.SECURE
      , size: DEFAULT_IOS_DEVICE_ARGS.SIZE
      , xdpi: DEFAULT_IOS_DEVICE_ARGS.XDPI
      , ydpi: DEFAULT_IOS_DEVICE_ARGS.YDPI
      , url: screenWsUrlPattern
    }
    , 'group.owner.email': process.env.STF_ADMIN_EMAIL || 'administrator@fakedomain.com'
    , 'group.owner.name': process.env.STF_ADMIN_NAME || 'administrator'
    , screenPort: message.ports.screenPort
    , connectPort: message.ports.connectPort
    , model: message.options.name
    , platform: message.options.platform
    , sdk: message.options.architect
    , abi: 'arm64'
  }

  return db.connect().then(client => {
    return client.collection('devices').updateOne({serial: message.serial},
      {
        $set: data
      }
    )
      .then(stats => {
        if (stats.modifiedCount === 0 && stats.matchedCount === 0) {
          return dbapi.getRootGroup().then(function(group) {
            data.serial = message.serial
            data.createdAt = dbapi.getNow()
            data.group = {
              id: group.id
              , name: group.name
              , lifeTime: group.dates[0]
              , owner: group.owner
              , origin: group.id
              , class: group.class
              , repetitions: group.repetitions
              , originName: group.name
              , lock: false
            }
            return client.collection('devices').insertOne(data)
              .then(() => {
                return dbapi.addOriginGroupDevice(group, message.serial)
              })
          })
        }
        return true
      })
      .then(() => {
        return client.collection('devices').findOne({serial: message.serial})
      })
  })
}

export default dbapi
