require('./booking.css')

module.exports = angular.module('stf.booking', [
    require('stf/settings').name
    , require('stf/storage').name
    , require('stf/install').name
    , require('stf/upload').name
])
    .run(['$templateCache', function($templateCache) {
        $templateCache.put('control-panes/dashboard/booking/booking.pug',
            require('./booking.pug')
        )
    }])
    .controller('BookingCtrl', require('./booking-controller'))
