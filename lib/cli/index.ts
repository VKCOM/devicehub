/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'
import * as api from './api/index.js'
import * as app from './app/index.js'
import * as authLdap from './auth-ldap/index.js'
import * as authMock from './auth-mock/index.js'
import * as authOauth2 from './auth-oauth2/index.js'
import * as authOpenid from './auth-openid/index.js'
import * as authSaml2 from './auth-saml2/index.js'
import * as groupsEngine from './groups-engine/index.js'
import * as device from './device/index.js'
import * as iosDevice from './ios-device/index.js'
import * as vncDevice from './vnc-device/index.js'
import * as doctor from './doctor/index.js'
import * as generateFakeDevice from './generate-fake-device/index.js'
import * as generateFakeUser from './generate-fake-user/index.js'
import * as generateFakeGroup from './generate-fake-group/index.js'
import * as generateServiceUser from './generate-service-user/index.js'
import * as local from './local/index.js'
import * as logMongodb from './log-mongodb/index.js'
import * as migrate from './migrate/index.js'
import * as migrateToMongo from './migrate-to-mongo/index.js'
import * as poorxy from './poorxy/index.js'
import * as processor from './processor/index.js'
import * as provider from './provider/index.js'
import * as iosProvider from './ios-provider/index.js'
import * as reaper from './reaper/index.js'
import * as storagePluginApk from './storage-plugin-apk/index.js'
import * as storagePluginImage from './storage-plugin-image/index.js'
import * as storageS3 from './storage-s3/index.js'
import * as storageTemp from './storage-temp/index.js'
import * as triproxy from './triproxy/index.js'
import * as websocket from './websocket/index.js'
import * as tizenDevice from './tizen-device/index.js'

yargs(hideBin(process.argv)).usage('Usage: $0 <command> [options]')
    .strict()
    .command(api)
    .command(app)
    .command(authLdap)
    .command(authMock)
    .command(authOauth2)
    .command(authOpenid)
    .command(authSaml2)
    .command(groupsEngine)
    .command(device)
    .command(iosDevice)
    .command(tizenDevice)
    .command(vncDevice)
    .command(doctor)
    .command(generateFakeDevice)
    .command(generateFakeUser)
    .command(generateFakeGroup)
    .command(generateServiceUser)
    .command(local)
    .command(logMongodb)
    .command(migrate)
    .command(migrateToMongo)
    .command(poorxy)
    .command(processor)
    .command(provider)
    .command(iosProvider)
    .command(reaper)
    .command(storagePluginApk)
    .command(storagePluginImage)
    .command(storageS3)
    .command(storageTemp)
    .command(triproxy)
    .command(websocket)
    .demandCommand(1, 'Must provide a valid command.')
    .help('h', 'Show help.')
    .alias('h', 'help')
    .version()
    .alias('V', 'version')
    .parse()
