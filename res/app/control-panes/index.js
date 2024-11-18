module.exports = angular.module('control-panes', [
    require('stf/common-ui/nice-tabs').name
    , require('stf/device').name
    , require('stf/control').name
    , require('stf/scoped-hotkeys').name
    , require('./device-control').name
    , require('./advanced').name
    , require('./performance').name
    , require('./dashboard').name
    // require('./inspect').name,
    // require('./activity').name,
    , require('./logs').name
    // require('./resources').name,
    , require('./explorer').name
    , require('./info').name
    ,])
    .factory('ControlPanesService', require('./control-panes-service'))
    .config(['$routeProvider', function($routeProvider) {
        $routeProvider
            .when('/control', {
                template: '<div ng-controller="ControlPanesNoDeviceController"></div>'
                , controller: 'ControlPanesNoDeviceController'
            })
            .when('/control/:serial', {
                template: require('./control-panes.pug')
                , controller: 'ControlPanesCtrl'
                , resolve: {
                    resolvedDevice: function(ControlPanesService) {
                        return ControlPanesService.getDevice()
                    }
                    , resolvedControl: function(ControlPanesService) {
                        return ControlPanesService.getDeviceControl()
                    }
                }
            })
            .when('/c/:serial', {
                template: require('./control-panes.pug')
                , controller: 'ControlPanesCtrl'
                , resolve: {
                    resolvedDevice: function(ControlPanesService) {
                        return ControlPanesService.getDevice()
                    }
                    , resolvedControl: function(ControlPanesService) {
                        return ControlPanesService.getDeviceControl()
                    }
                }
            })
    }])
    .controller('ControlPanesCtrl', require('./control-panes-controller'))
    .controller('ControlPanesNoDeviceController',
        require('./control-panes-no-device-controller'))
    .controller('ControlPanesHotKeysCtrl',
        require('./control-panes-hotkeys-controller'))
