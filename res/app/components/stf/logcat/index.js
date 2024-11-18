module.exports = angular.module('stf.logcat', [
    require('stf/filter-string').name
    , require('stf/socket').name
    , require('stf/device').name
])
    .factory('LogcatService', require('./logcat-service'))
