const _ = require('lodash')

module.exports = function DeviceControlCtrl($scope, DeviceService, GroupService, GenericModalService,
    $location, $timeout, $window, $rootScope, LogcatService, $route) {
    $scope.showScreen = true

    $scope.groupTracker = DeviceService.trackGroup($scope)

    $scope.groupDevices = $scope.groupTracker.devices

    $scope.networkType = navigator.connection ? navigator.connection.effectiveType : '4g'

    $scope.canChangeQuality = !!navigator.connection

    $scope.$on('$locationChangeStart', function(event, next, current) {
        $scope.LogcatService = LogcatService
        $rootScope.LogcatService = LogcatService
    })

    $scope.goHome = function() {
        $scope.control.home()
    }

    $scope.changeQuality = function(quality) {
        $scope.canChangeQuality = false
        $scope.control.changeQuality(quality)
    }

    $scope.kickDevice = function(device) {
        GenericModalService.open({
             
            message: 'Вы уверены, что хотите освободить девайс? Девайс будет очищен перед возвращением в список устройств'
            , type: 'Warning'
            , size: 'lg'
            , cancel: true
        })
            .then(function() {
                if (Object.keys(LogcatService.deviceEntries).includes(device.serial)) {
                    LogcatService.deviceEntries[device.serial].allowClean = true
                }

                $scope.LogcatService = LogcatService
                $rootScope.LogcatService = LogcatService

                if (!device || !$scope.device) {
                    alert('No device found')
                    return
                }

                try {
                    // If we're trying to kick current device
                    if (device.serial === $scope.device.serial) {
                        // If there is more than one device left
                        if ($scope.groupDevices.length > 1) {
                            // Control first free device first
                            var firstFreeDevice = _.find($scope.groupDevices, function(dev) {
                                return dev.serial !== $scope.device.serial
                            })
                            $scope.controlDevice(firstFreeDevice)

                            // Then kick the old device
                            GroupService.kick(device).then(function() {
                                $scope.$digest()
                            })
                        }
                        else {
                            // Kick the device
                            GroupService.kick(device).then(function() {
                                $scope.$digest()
                            })
                            $location.path('/devices/')
                            setTimeout(function() {
                                $route.reload()
                            }, 50)
                        }
                    }
                    else {
                        GroupService.kick(device).then(function() {
                            $scope.$digest()
                        })
                    }
                }
                catch (e) {
                    alert(e.message)
                }
            })
    }

    $scope.controlDevice = function(device) {
        $location.path('/c/' + device.serial)
    // $location.path('/control/' + device.serial)
    }

    function isPortrait(val) {
        var value = val
        if (typeof value === 'undefined' && $scope.device) {
            value = $scope.device.display.rotation
        }
        return (value === 0 || value === 180)
    }

    function isLandscape(val) {
        var value = val
        if (typeof value === 'undefined' && $scope.device) {
            value = $scope.device.display.rotation
        }
        return (value === 90 || value === 270)
    }

    $scope.tryToRotate = function(rotation) {
        if (rotation === 'portrait') {
            $scope.control.rotate(0)
            $timeout(function() {
                if (isLandscape()) {
                    console.log('tryToRotate is Landscape')
                    $scope.currentRotation = 'landscape'
                }
            }, 400)
        }
        else if (rotation === 'landscape') {
            $scope.control.rotate(90)
            $timeout(function() {
                if (isPortrait()) {
                    console.log('tryToRotate but it still porttrait')
                    $scope.currentRotation = 'portrait'
                }
            }, 400)
        }
    }

    $scope.currentRotation = 'portrait'

    $scope.$watch('device.display.rotation', function(newValue) {
        if (isPortrait(newValue)) {
            $scope.currentRotation = 'portrait'
        }
        else if (isLandscape(newValue)) {
            $scope.currentRotation = 'landscape'
        }
    })

    // TODO: Refactor this inside control and server-side
    $scope.rotateLeft = function() {
        var angle = 0
        if ($scope.device && $scope.device.display) {
            angle = $scope.device.display.rotation
        }
        if (angle === 0) {
            angle = 270
        }
        else {
            angle -= 90
        }
        $scope.control.rotate(angle)

        if ($rootScope.standalone) {
            $window.resizeTo($window.outerHeight, $window.outerWidth)
        }
    }

    $scope.rotateRight = function() {
        var angle = 0
        if ($scope.device && $scope.device.display) {
            angle = $scope.device.display.rotation
        }
        if (angle === 270) {
            angle = 0
        }
        else {
            angle += 90
        }
        $scope.control.rotate(angle)

        if ($rootScope.standalone) {
            $window.resizeTo($window.outerHeight, $window.outerWidth)
        }
    }


    $scope.autoQuality = function() {
        let networkType = navigator.connection.effectiveType
        if ($scope.networkType === networkType) {
            return
        }
        if (!$scope.canChangeQuality) {
            return
        }

        $scope.networkType = networkType
        switch (networkType) {
        case 'slow-2g': {
            $scope.control.changeQuality(10)
            break
        }
        case '2g': {
            $scope.control.changeQuality(20)
            break
        }
        case '3g': {
            $scope.control.changeQuality(60)
            break
        }
        case '4g': {
            $scope.control.changeQuality(80)
            break
        }
        }
    }

    setInterval($scope.autoQuality, 5000)
}
