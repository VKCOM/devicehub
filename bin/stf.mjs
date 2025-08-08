#!/usr/bin/env -S tsx --import ./lib/util/instrument.mjs
import packageData from '../package.json' with { type: 'json' }
console.log(`Starting DeviceHub ${packageData.version}`)
import '../lib/cli/index.js'
