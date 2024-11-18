/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports = function MenuCtrl(
    $scope
    , $rootScope
    , UsersService
    , AppState
    , SettingsService
    , $location
    , $http
    , CommonService
    , LogcatService
    , GenericModalService
    , socket
    , $cookies
    , $window) {
    SettingsService.bind($scope, {
        target: 'lastUsedDevice'
    })

    SettingsService.bind($rootScope, {
        target: 'platform'
        , defaultValue: 'native'
        , deviceEntries: LogcatService.deviceEntries
    })

    $scope.$on('$routeChangeSuccess', function() {
        $scope.isControlRoute = $location.path().search('/control') !== -1
    })

    $scope.openSupportLink = function() {
        $http.get('/auth/contact').then(function(response) {
            window.open(response.data.contactUrl, '_blank').focus()
        })
    }

    $scope.openConfluence = function() {
        $http.get('/auth/docs').then(function(response) {
            window.open(response.data.docsUrl, '_blank').focus()
        })
    }

    $scope.logout = function() {
        $http.get('/app/api/v1/auth_url').then(function(response) {
            let authUrl = response.data.authUrl
            if (!authUrl.includes('mock') && !authUrl.includes('ldap')) {
                GenericModalService.open({
                    message: 'Вы авторизованы через способ, когда вход происходит автоматически'
                    , type: 'Warning'
                    , size: 'lg'
                })
                    .then(() => {
                        $cookies.remove('XSRF-TOKEN', {path: '/'})
                        $cookies.remove('ssid', {path: '/'})
                        $cookies.remove('ssid.sig', {path: '/'})
                        $window.location = '/'
                        setTimeout(function() {
                            socket.disconnect()
                        }, 100)
                    })
            }
            else {
                $cookies.remove('XSRF-TOKEN', {path: '/'})
                $cookies.remove('ssid', {path: '/'})
                $cookies.remove('ssid.sig', {path: '/'})
                $window.location = '/'
                setTimeout(function() {
                    socket.disconnect()
                }, 100)
            }
        })
    }

    let logo = document.getElementById('MenuLogo')
    if (window.location.host.split('.')[0].includes('device')) {
        logo.classList.add('devicehub-logo')
    }
    else {
        logo.classList.add('emulatorhub-logo')
    }

    $scope.alertMessage = {
        activation: 'False'
        , data: ''
        , level: ''
    }

    if (AppState.user.privilege === 'admin' && AppState.user.name === 'administrator') {
        $scope.alertMessage = SettingsService.get('alertMessage')
    }
    else {
        UsersService.getUsersAlertMessage().then(function(response) {
            $scope.alertMessage = response.data.alertMessage
            SettingsService.set('alertMessage', response.data.alertMessage)
        })
    }

    $scope.isAlertMessageActive = function() {
        return $scope.alertMessage?.activation === 'True'
    }

    $scope.isInformationAlert = function() {
        return $scope.alertMessage?.level === 'Information'
    }

    $scope.isWarningAlert = function() {
        return $scope.alertMessage?.level === 'Warning'
    }

    $scope.isCriticalAlert = function() {
        return $scope.alertMessage?.level === 'Critical'
    }

    $scope.$on('user.menu.users.updated', function(event, message) {
        if (message.user.privilege === 'admin') {
            $scope.alertMessage = message.user.settings.alertMessage
        }
    })
}
