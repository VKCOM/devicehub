import util from 'util'
import uuid from 'uuid'
import * as dbapi from '../db/api.js'
import * as apiutil from './apiutil.js'
export const generate = function() {
    return dbapi.getRootGroup().then(function(rootGroup) {
        const now = Date.now()
        return dbapi.createUserGroup({
            name: 'fakegroup-' + util.format('%s', uuid.v4()).replace(/-/g, '')
            , owner: {
                email: rootGroup.owner.email
                , name: rootGroup.owner.name
            }
            , privilege: apiutil.ADMIN
            , class: apiutil.BOOKABLE
            , repetitions: 0
            , isActive: true
            , dates: apiutil.computeGroupDates({
                start: new Date(now)
                , stop: new Date(now + apiutil.ONE_YEAR)
            }, apiutil.BOOKABLE, 0)
            , duration: 0
            , state: apiutil.READY
        })
            .then(function(group) {
                if (group) {
                    return group.id
                }
                throw new Error('Forbidden (groups number quota is reached)')
            })
    })
}
