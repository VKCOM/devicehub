import util from 'util'
import split from 'split'
import Promise from 'bluebird'
import androidDeviceList from 'android-device-list'
var devutil = Object.create(null)
function closedError(err) {
    return err.message.indexOf('closed') !== -1
}
devutil.executeShellCommand = function(adb, serial, command) {
    adb.getDevice(serial).shell(command)
}
devutil.ensureUnusedLocalSocket = function(adb, serial, sock) {
    return adb.getDevice(serial).openLocal(sock)
        .then(function(conn) {
            conn.end()
            throw new Error(util.format('Local socket "%s" should be unused', sock))
        })
        .catch(closedError, function() {
            return Promise.resolve(sock)
        })
}
devutil.waitForLocalSocket = function(adb, serial, sock) {
    return adb.getDevice(serial).openLocal(sock)
        .then(function(conn) {
            conn.sock = sock
            return conn
        })
        .catch(closedError, function() {
            return Promise.delay(100)
                .then(function() {
                    return devutil.waitForLocalSocket(adb, serial, sock)
                })
        })
}
devutil.listPidsByComm = function(adb, serial, comm, bin) {
    var users = {
        shell: true
    }
    var findProcess = function(out) {
        return new Promise(function(resolve) {
            var header = true
            var pids = []
            var showTotalPid = false
            out.pipe(split())
                .on('data', function(chunk) {
                    if (header) {
                        header = false
                    }
                    else {
                        var cols = chunk.toString().split(/\s+/)
                        if (!showTotalPid && cols[0] === 'root') {
                            showTotalPid = true
                        }
                        // last column of output would be command name containing absolute path like '/data/local/tmp/minicap'
                        // or just binary name like 'minicap', it depends on device/ROM
                        var lastCol = cols.pop()
                        if ((lastCol === comm || lastCol === bin) && users[cols[0]]) {
                            pids.push(Number(cols[1]))
                        }
                    }
                })
                .on('end', function() {
                    resolve({showTotalPid: showTotalPid, pids: pids})
                })
        })
    }
    return adb.getDevice(serial).shell('ps 2>/dev/null')
        .then(findProcess)
        .then(function(res) {
        // return pids if process can be found in the output of 'ps' command
        // or 'ps' command has already displayed all the processes including processes launched by root user
            if (res.showTotalPid || res.pids.length > 0) {
                return Promise.resolve(res.pids)
            }
            // otherwise try to run 'ps -elf'
            else {
                return adb.getDevice(serial).shell('ps -lef 2>/dev/null')
                    .then(findProcess)
                    .then(function(res) {
                        return Promise.resolve(res.pids)
                    })
            }
        })
}
devutil.waitForProcsToDie = function(adb, serial, comm, bin) {
    return devutil.listPidsByComm(adb, serial, comm, bin)
        .then(function(pids) {
            if (pids.length) {
                return Promise.delay(100)
                    .then(function() {
                        return devutil.waitForProcsToDie(adb, serial, comm, bin)
                    })
            }
        })
}
devutil.killProcsByComm = function(adb, serial, comm, bin, mode) {
    return devutil.listPidsByComm(adb, serial, comm, bin, mode)
        .then(function(pids) {
            if (!pids.length) {
                return Promise.resolve()
            }
            return adb.getDevice(serial).shell(['kill', mode || -15].concat(pids))
                .then(function(out) {
                    return new Promise(function(resolve) {
                        out.on('end', resolve)
                    })
                })
                .then(function() {
                    return devutil.waitForProcsToDie(adb, serial, comm, bin)
                })
                .timeout(2000)
                .catch(function() {
                    return devutil.killProcsByComm(adb, serial, comm, bin, -9)
                })
        })
}
devutil.makeIdentity = function(serial, properties) {
    let model = properties['ro.product.model']
    let brand = properties['ro.product.brand']
    let manufacturer = properties['ro.product.manufacturer']
    let operator = properties['gsm.sim.operator.alpha'] ||
        properties['gsm.operator.alpha']
    let version = properties['ro.build.version.release']
    let sdk = properties['ro.build.version.sdk']
    let abi = properties['ro.product.cpu.abi']
    let product = properties['ro.product.name']
    let cpuPlatform = properties['ro.board.platform']
    let openGLESVersion = properties['ro.opengles.version']
    let marketName = properties['ro.product.device']
    let customMarketName = properties['debug.stf.product.device']
    let macAddress = properties.mac_address
    let ram = properties.ram
    openGLESVersion = parseInt(openGLESVersion, 10)
    if (isNaN(openGLESVersion)) {
        openGLESVersion = '0.0'
    }
    else {
        var openGLESVersionMajor = (openGLESVersion & 0xffff0000) >> 16
        var openGLESVersionMinor = (openGLESVersion & 0xffff)
        openGLESVersion = openGLESVersionMajor + '.' + openGLESVersionMinor
    }
    // Remove brand prefix for consistency. Note that some devices (e.g. TPS650)
    // do not expose the brand property.
    if (brand && model.substr(0, brand.length) === brand) {
        model = model.substr(brand.length)
    }
    // Remove manufacturer prefix for consistency
    if (model.substr(0, manufacturer.length) === manufacturer) {
        model = model.substr(manufacturer.length)
    }
    // update device name for human readable values based on env variables
    var deviceUdid = process.env.DEVICE_UDID
    var deviceName = process.env.STF_PROVIDER_DEVICE_NAME
    console.log('Attacted device udid: ' + deviceUdid + '; name: ' + deviceName)
    if (serial === deviceUdid) {
        model = deviceName
    }
    if (customMarketName) {
        marketName = customMarketName
    }
    else if (marketName) {
        var devices = androidDeviceList.getDevicesByDeviceId(marketName)
        if (devices.length > 0) {
            const deviceFilter = devices.filter(device => device.model === model)
            if (deviceFilter.length > 0) {
                marketName = deviceFilter[0].name
            }
            else {
                marketName = devices[0].name
            }
        }
    }
    // Clean up remaining model name
    // model = model.replace(/[_ ]/g, '')
    return {
        serial: serial
        , platform: 'Android'
        , manufacturer: manufacturer.toUpperCase()
        , operator: operator || null
        , model: model
        , version: version
        , abi: abi
        , sdk: sdk
        , product: product
        , cpuPlatform: cpuPlatform
        , openGLESVersion: openGLESVersion
        , marketName: marketName
        , macAddress: macAddress
        , ram: ram
    }
}
export default devutil
