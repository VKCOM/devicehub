/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

require('./settings.css')

module.exports = angular.module('ui-settings', [
    require('./general').name
    , require('./keys').name
    , require('./groups').name
    , require('./devices').name
    , require('./users').name
    , require('./shell').name
    , require('stf/app-state').name
    , require('stf/common-ui/nice-tabs').name
    // require('./notifications').name
])
    .config(['$routeProvider', function($routeProvider) {
        $routeProvider.when('/settings', {
            template: require('./settings.pug')
        })
        $routeProvider.when('/settings/keys', {
            template: require('./keys/keys.pug')
        })
        $routeProvider.when('/settings/groups', {
            template: require('./groups/groups.pug')
        })
        $routeProvider.when('/settings/devices', {
            template: require('./devices/devices.pug')
        })
        $routeProvider.when('/settings/users', {
            template: require('./users/users.pug')
        })
        $routeProvider.when('/settings/shell', {
            template: require('./shell/shell.pug')
        })
    }])
    .controller('SettingsCtrl', require('./settings-controller'))
