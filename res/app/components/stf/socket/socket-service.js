const io = require('socket.io-client')

module.exports = function SocketFactory(
    $rootScope
    , VersionUpdateService
    , TemporarilyUnavailableService
    , AppState
) {
    let websocketUrl = AppState.config.websocketUrl || ''

    let socket = io(websocketUrl, {
        autoConnect: true
        , reconnectionAttempts: 3
        , reconnection: true
        , transports: ['websocket']
    })

    socket.scoped = function($scope) {
        let listeners = []

        $scope.$on('$destroy', function() {
            listeners.forEach(function(listener) {
                socket.removeListener(listener.event, listener.handler)
            })
        })

        return {
            on: function(event, handler) {
                listeners.push({
                    event: event, handler: handler
                })
                socket.on(event, handler)
                return this
            }
        }
    }

    socket.on('outdated', function() {
        VersionUpdateService.open()
    })

    socket.on('socket.ip', function(ip) {
        $rootScope.$apply(function() {
            socket.ip = ip
        })
    })

    socket.once('temporarily-unavailable', function() {
        TemporarilyUnavailableService.open('Service is currently unavailable! Try your attempt later')
    })

    return socket
}
