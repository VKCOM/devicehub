module.exports = function LogsCtrl($scope, $rootScope, $routeParams, LogcatService) {
    var deviceSerial = $routeParams.serial
    var cleanDevice = (window.location.href).split('/').pop()
    cleanDeviceSettings()

    $scope.started = checkLogBtnStatus() === null ? false : checkLogBtnStatus()
    $scope.filters = {}

    var curentFilterValue = ''

    LogcatService.getFilterLevels()
        .then(response => {
            $scope.filters.levelNumbers = LogcatService.filters.levelNumbers
        })
        .catch(err => {
            $scope.filters.levelNumbers = LogcatService.filters.levelNumbers
        })

    LogcatService.filters.filterLines()

    restoreFilters()
    setFiltersPriority()

    function cleanDeviceSettings() {
        if (Object.keys($rootScope).includes('LogcatService')) {
            LogcatService.deviceEntries = $rootScope.LogcatService.deviceEntries
        }

        if (Object.keys(LogcatService.deviceEntries).includes(deviceSerial)) {
            if (LogcatService.deviceEntries[deviceSerial].allowClean) {
                delete LogcatService.deviceEntries[deviceSerial]
                if ($scope.control !== null) {
                    $scope.control.stopLogcat()
                }
            }
        }
    }

    function setFiltersPriority() {
        const {levelNumbers} = $scope.filters
        const {deviceEntries} = LogcatService

        if (!levelNumbers) {
            return
        }

        if (Object.keys(deviceEntries).includes(deviceSerial)) {
            $scope.filters.priority = levelNumbers[deviceEntries[deviceSerial].selectedLogLevel - 2]
        }
        else if ($scope.started) {
            $scope.filters.priority = levelNumbers[0]
        }
    }

    function restoreFilters() {
        const {deviceEntries} = LogcatService

        if (Object.keys(deviceEntries).includes(deviceSerial)) {
            Object.keys(deviceEntries[deviceSerial].filters)
                .forEach((entry) => {
                    if (`filter.${entry}` !== 'filter.priority') {
                        $scope.filters[entry] = deviceEntries[deviceSerial].filters[entry]
                    }
                    else {
                        setFiltersPriority()
                    }
                })
        }
    }

    function checkLogBtnStatus() {
        if (Object.keys(LogcatService.deviceEntries).includes(deviceSerial)) {
            if ($scope !== null && $scope.device !== null) {
                if($scope.device.logs_enabled && LogcatService.deviceEntries[deviceSerial].started) {
                    return LogcatService.deviceEntries[deviceSerial].started
                }
            }
        }
        return null
    }

    $scope.$watch('started', function(newValue, oldValue) {
        if (!Object.keys(LogcatService.deviceEntries).includes(deviceSerial)) {
            LogcatService.deviceEntries[deviceSerial] = {logs: [], selectedLogLevel: 2, started: false
                , filters: {
                    message: ''
                    , pid: ''
                    , tid: ''
                    , dateLabel: ''
                    , date: ''
                    , tag: ''
                    , priority: '',
                }
            }
        }

        if (newValue !== oldValue) {
            LogcatService.deviceEntries[deviceSerial].started = newValue

            if (LogcatService.deviceEntries[deviceSerial].started) {
                $scope.control.startLogcat([curentFilterValue]).then(function() {
                })

                LogcatService.deviceEntries[deviceSerial].started = true
                $scope.device.logs_enabled = true
                setFiltersPriority()
            }
            else {
                if (Object.keys(LogcatService.deviceEntries).includes(deviceSerial)) {
                    LogcatService.deviceEntries[deviceSerial].started = false
                }

                LogcatService.deviceEntries[deviceSerial].started = false
                $scope.device.logs_enabled = false
                $scope.control.stopLogcat()
            }
        }
    })
    window.onbeforeunload = function() {
        if ($scope.control) {
            for(var i = 0; i < LogcatService.deviceEntries.length; i++) {
                if(LogcatService.deviceEntries[i] === deviceSerial) {
                    LogcatService.deviceEntries.splice(i, 1)
                }
            }
            LogcatService.deviceEntries[deviceSerial].started = false
            $scope.control.stopLogcat()
        }
    }

    $scope.clear = function() {
        var deviceSerial = (window.location.href).split('/').pop()
        if (Object.keys(LogcatService.deviceEntries).includes(deviceSerial)) {
            // eslint-disable-next-line for-direction
            for (var i = LogcatService.deviceSerial.length - 1; i >= 0; i++) {
                if (LogcatService.deviceSerial[i] === deviceSerial) {
                    LogcatService.deviceSerial.splice(i, 1)
                }
            }
        }
    }

    function defineFilterWatchers(props) {
        angular.forEach(props, function(prop) {
            $scope.$watch('filters.' + prop, function(newValue, oldValue) {
                if (!angular.equals(newValue, oldValue)) {
                    var deviceSerial = (window.location.href).split('/').pop()
                    curentFilterValue = newValue.name
                    LogcatService.filters[prop] = newValue
                    if (!Object.keys(LogcatService.deviceEntries).includes(deviceSerial)) {
                        LogcatService.initDeviceLogCollector(deviceSerial)
                    }

                    var transformedInput = ''
                    switch('filters.' + prop) {
                    case 'filters.priority':
                    case 'filters.levelNumber':
                        if (newValue !== null && !isNaN(newValue.number)) {
                            LogcatService.deviceEntries[deviceSerial].selectedLogLevel = newValue.number
                            $scope.filters.priority = $scope.filters.levelNumbers[
                                LogcatService.deviceEntries[deviceSerial].selectedLogLevel - 2]
                            transformedInput = LogcatService.deviceEntries[deviceSerial].selectedLogLevel
                        }
                        break
                    case 'filters.pid':
                        transformedInput = newValue.replace(/[^0-9:]/g, '')
                        if (transformedInput !== newValue) {
                            $scope.filters.pid = transformedInput
                        }
                        break
                    case 'filters.tid':
                        transformedInput = newValue.replace(/[^0-9]/g, '')
                        if (transformedInput !== newValue) {
                            $scope.filters.tid = transformedInput
                        }
                        break
                    default:
                        transformedInput = newValue
                    }

                    // Exclude Debug Level info
                    if (prop !== 'levelNumber') {
                        LogcatService.deviceEntries[deviceSerial].filters[prop] = transformedInput
                    }

                    LogcatService.filters[prop] = transformedInput

                    // Check if scope is defined
                    if ($scope !== 'undefined') {
                        setFiltersPriority()
                    }

                    LogcatService.deviceEntries[deviceSerial].allowClean = false
                    LogcatService.allowClean = false
                }
            })
        })
    }

    defineFilterWatchers([
        'levelNumber'
        , 'message'
        , 'pid'
        , 'tid'
        , 'dateLabel'
        , 'date'
        , 'tag'
        , 'priority'
    ])
}
