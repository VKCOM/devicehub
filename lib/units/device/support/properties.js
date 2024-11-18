import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import * as streamutil from '../../../util/streamutil.js'
import adb from './adb.js'
export default syrup.serial()
    .dependency(adb)
    .define(function(options, adb) {
        const log = logger.createLogger('device:support:properties')
        function load() {
            log.info('Loading properties')
            return adb.getDevice(options.serial).getProperties()
                .then((props) => {
                    let sdk = props['ro.build.version.sdk']
                    let command
                    if (sdk >= 24) {
                        command = "ip addr show wlan0  | grep 'link/ether '| cut -d' ' -f6 | xargs echo mac_address:"
                    }
                    else {
                        command = 'cat /sys/class/net/wlan0/address | xargs echo mac_address:'
                    }
                    return adb.getDevice(options.serial).shell(command)
                        .then((out) => {
                            return streamutil.findLine(out, (/^mac_address:/))
                                .timeout(15000)
                                .then(function(line) {
                                    let splitedLine = line.split('mac_address: ')
                                    if (splitedLine.length > 1) {
                                        props.mac_address = splitedLine[1]
                                    }
                                    else {
                                        props.mac_address = 'secured'
                                    }
                                    return props
                                })
                        })
                        .catch((e) => {
                            log.error(e)
                            log.info('setting secured mac address because of error')
                            props.mac_address = 'secured'
                            return props
                        })
                })
                .then((props) => {
                    return adb.getDevice(options.serial).shell('cat /proc/meminfo | grep MemTotal')
                        .then(function(out) {
                            return streamutil.findLine(out, (/^MemTotal:/))
                                .timeout(15000)
                                .then(function(line) {
                                    let total = line.match(/\d+/)
                                    if (total) {
                                        props.ram = total[0]
                                    }
                                    else {
                                        props.ram = -1
                                    }
                                    return props
                                })
                        })
                        .catch((e) => {
                            log.error(e)
                            props.ram = -1
                            return props
                        })
                })
        }
        return load()
    })
