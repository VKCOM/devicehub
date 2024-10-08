import util from 'util'
import uuid from 'uuid'
import _ from 'lodash'
import dbapi from '../db/api.mjs'
export const generate = function(wantedModel) {
    // no base64 because some characters as '=' or '/' are not compatible through API (delete devices)
    const serial = 'fake-' + util.format('%s', uuid.v4()).replace(/-/g, '')
    return dbapi.saveDeviceInitialState(serial, {
        provider: {
            name: 'FAKE/1'
            , channel: '*fake'
        }
        , status: 'OFFLINE'
    })
        .then(function() {
        var model = wantedModel || 'FakeDeviceModel'
        return dbapi.saveDeviceIdentity(serial, {
            platform: 'Android'
            , manufacturer: 'Foo Electronics'
            , operator: 'Loss Networks'
            , model: model
            , version: '4.1.2'
            , abi: 'armeabi-v7a'
            , sdk: (8 + Math.floor(Math.random() * 12)).toString() // string required!
            , display: {
                density: 3
                , fps: 60
                , height: 1920
                , id: 0
                , rotation: 0
                , secure: true
                , url: '/404.jpg'
                , width: 1080
                , xdpi: 442
                , ydpi: 439
            }
            , phone: {
                iccid: '1234567890123456789'
                , imei: '123456789012345'
                , imsi: '123456789012345'
                , network: 'LTE'
                , phoneNumber: '0000000000'
            }
            , product: model
            , cpuPlatform: 'msm8996'
            , openGLESVersion: '3.1'
            , marketName: 'Bar F9+'
            , macAddress: '123abc'
            , ram: 0
        })
    })
        .then(function() {
        return dbapi.setDeviceAbsent(serial)
    })
        .return(serial)
}
