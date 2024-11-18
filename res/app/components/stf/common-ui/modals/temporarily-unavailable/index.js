module.exports = angular.module('stf.temporarily-unavailable', [
    require('stf/common-ui/modals/common').name
])
    .factory('TemporarilyUnavailableService', require('./temporarily-unavailable-service'))
