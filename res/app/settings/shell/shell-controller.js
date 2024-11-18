module.exports = function MassShellCtrl(
    $scope
    , DevicesService
    , SettingsService
    , CommonService
    , ItemsPerPageOptionsService
) {
    let devicesBySerial = {}
    const deviceFields =
    'model,' +
    'serial,' +
    'version,' +
    'display.height,' +
    'display.width,' +
    'manufacturer,' +
    'sdk,' +
    'abi,' +
    'cpuPlatform,' +
    'openGLESVersion,' +
    'marketName,' +
    'phone.imei,' +
    'provider.name,' +
    'group.originName,' +
    'storageId,' +
    'place,' +
    'channel'


    function publishDevice(device) {
        if (!device.model) {
            device.display = {}
        }
        else {
            device.displayStr = device.display.width + 'x' + device.display.height
        }
        for (var i in device) {
            if (device[i] === null) {
                device[i] = ''
            }
        }
        return device
    }

    function addDevice(device, timeStamp) {
        return CommonService.add(
            $scope.devices
            , devicesBySerial
            , device
            , 'serial'
            , timeStamp)
    }

    function clearAllDevices() {
        devicesBySerial = {}
        $scope.devices = []
    }

    $scope.devices = []
    $scope.scopeMassShellCtrl = $scope
    $scope.itemsPerPageOptions = ItemsPerPageOptionsService
    SettingsService.bind($scope, {
        target: 'deviceItemsPerPage'
        , source: 'deviceItemsPerPage'
        , defaultValue: $scope.itemsPerPageOptions[2]
    })
    $scope.run = function(command) {
        if (command === 'clear') {
            $scope.clear()
            return
        }
        let shellCommand = $scope.command
        $scope.command = ''
        $scope.commandExecuting = true

        let devices = []
        DevicesService.getOboeDevices('user', deviceFields, function(device) {
            devices.push(device)
        })
            .done(function() {
                SettingsService.shellAll(shellCommand, devices).then(function(outputs) {
                    clearAllDevices()
                    devices.forEach(function(device) {
                        if (outputs[device.serial]) {
                            device.shellOutput = outputs[device.serial]
                            if (device.shellOutput !== 'err') {
                                addDevice(publishDevice(device), -1)
                            }
                        }
                    })
                })
                    .finally(function() {
                        $scope.commandExecuting = false
                        $scope.$digest()
                    })
            })
    }

    $scope.clear = function() {
        $scope.command = ''
        clearAllDevices()
    }
}
