require('./screen-loader.css')

module.exports = angular.module('stf/sreen-loader', [])
    .directive('screenLoader', require('./screen-loader-directive'))
    .factory('ScreenLoaderService', require('./screen-loader-service'))
