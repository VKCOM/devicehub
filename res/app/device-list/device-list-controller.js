/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

let QueryParser = require('./util/query-parser')
const _ = require('lodash')

module.exports = function DeviceListCtrl(
    $scope
    , $http
    , DeviceService
    , DeviceColumnService
    , GroupService
    , ControlService
    , SettingsService
    , $location
    , GenericModalService
    , $route
) {
    $scope.tracker = DeviceService.trackAll($scope)
    $scope.control = ControlService.create($scope.tracker.devices, '*ALL')

    $scope.columnDefinitions = DeviceColumnService

    const defaultColumns = [
        {
            name: 'state'
            , selected: true
        }
        , {
            name: 'model'
            , selected: false
        }
        , {
            name: 'name'
            , selected: true
        }
        , {
            name: 'platform'
            , selected: false
        }
        , {
            name: 'serial'
            , selected: false
        }
        , {
            name: 'operator'
            , selected: false
        }
        , {
            name: 'releasedAt'
            , selected: false
        }
        , {
            name: 'version'
            , selected: true
        }
        , {
            name: 'network'
            , selected: false
        }
        , {
            name: 'display'
            , selected: false
        }
        , {
            name: 'manufacturer'
            , selected: false
        }
        , {
            name: 'marketName'
            , selected: true
        }
        , {
            name: 'sdk'
            , selected: true
        }
        , {
            name: 'abi'
            , selected: false
        }
        , {
            name: 'cpuPlatform'
            , selected: false
        }
        , {
            name: 'openGLESVersion'
            , selected: false
        }
        , {
            name: 'browser'
            , selected: true
        }
        , {
            name: 'mobileService'
            , selected: true
        }
        , {
            name: 'macAddress'
            , selected: false
        }
        , {
            name: 'place'
            , selected: false
        }
        , {
            name: 'storageId'
            , selected: false
        }
        , {
            name: 'phone'
            , selected: false
        }
        , {
            name: 'imei'
            , selected: false
        }
        , {
            name: 'imsi'
            , selected: false
        }
        , {
            name: 'iccid'
            , selected: false
        }
        , {
            name: 'batteryHealth'
            , selected: false
        }
        , {
            name: 'batterySource'
            , selected: false
        }
        , {
            name: 'batteryStatus'
            , selected: false
        }
        , {
            name: 'batteryLevel'
            , selected: false
        }
        , {
            name: 'batteryTemp'
            , selected: false
        }
        , {
            name: 'provider'
            , selected: false
        }
        , {
            name: 'notes'
            , selected: true
        }
        , {
            name: 'owner'
            , selected: true
        }
        , {
            name: 'group'
            , selected: false
        }
        , {
            name: 'groupSchedule'
            , selected: false
        }
        , {
            name: 'groupStartTime'
            , selected: false
        }
        , {
            name: 'groupEndTime'
            , selected: false
        }
        , {
            name: 'groupRepetitions'
            , selected: false
        }
        , {
            name: 'groupOwner'
            , selected: false
        }
        , {
            name: 'groupOrigin'
            , selected: false
        }
        , {
            name: 'bookedBefore'
            , selected: true
        }
    ]

    $scope.columns = defaultColumns

    SettingsService.bind($scope, {
        target: 'columns'
        , source: 'deviceListColumns'
    })

    let defaultSort = {
        fixed: [
            {
                name: 'state'
                , order: 'asc'
            }
        ]
        , user: [
            {
                name: 'name'
                , order: 'asc'
            }
        ]
    }

    $scope.sort = defaultSort

    SettingsService.bind($scope, {
        target: 'sort'
        , source: 'deviceListSort'
    })

    $scope.filter = []

    $scope.activeTabs = {
        icons: true
        , details: false
    }

    SettingsService.bind($scope, {
        target: 'activeTabs'
        , source: 'deviceListActiveTabs'
    })

    $scope.toggle = function(device) {
        if (device.using) {
            $scope.kick(device)
        }
        else {
            $location.path('/control/' + device.serial)
        }
    }

    $scope.invite = function(device) {
        return GroupService.invite(device).then(function() {
            $scope.$digest()
        })
    }

    $scope.applyFilter = function(query) {
        if (!query) {
            localStorage.removeItem('deviceFilters')
            localStorage.setItem('deviceFilters', JSON.stringify([]))
            $scope.filter = []
            $route.reload()
        }
        $scope.filter = QueryParser.parse(query)
    }

    $scope.search = {
        deviceFilter: ''
        , focusElement: false
    }

    $scope.focusSearch = function() {
        if (!$scope.basicMode) {
            $scope.search.focusElement = true
        }
    }

    $scope.reset = function() {
        $scope.search.deviceFilter = ''
        $scope.filter = []
        $scope.sort = defaultSort
        $scope.columns = defaultColumns
        localStorage.removeItem('deviceFilters')
        localStorage.setItem('deviceFilters', JSON.stringify([]))
    }

    let params = (new URL(document.location)).searchParams
    let name = params.get('need_accept')
    if (name) {
        GenericModalService.open({
             
            message: 'Перед использованием необходимо обязательно ознакомиться с правилами использования!'
            , type: 'Warning'
            , size: 'lg'
            , cancel: false
        })
            .then(() => {
                $scope.control.setPolicyAccepted()
                $http.get('/auth/docs').then(function(response) {
                    window.open(response.data.docsUrl, '_blank').focus()
                })
                window.location.replace((document.location.href).replace(document.location.search, ''))
            })
            .catch((e) => {
                location.reload()
            })
    }

    let deviceFilters = JSON.parse(localStorage.getItem('deviceFilters')) || []

    let filter = deviceFilters[0]

    if (filter) {
        $scope.search.deviceFilter = `${filter.field ? filter.field : ''}: ${filter.query ? filter.query : ''}`
    }
}

document.title = window.location.host.split('.')[0]
