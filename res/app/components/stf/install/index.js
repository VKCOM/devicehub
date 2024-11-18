module.exports = angular.module('stf.install-service', [
    require('gettext').name
    // require('stf/device').name
    ,])
    .filter('installError', require('./install-error-filter'))
    .factory('InstallService', require('./install-service'))
