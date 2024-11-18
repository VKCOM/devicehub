require('./shell.css')

module.exports = angular.module('stf.mass_shell', [
    require('stf/common-ui').name
    , require('gettext').name
])
    .run(['$templateCache', function($templateCache) {
        $templateCache.put('settings/shell/shell.pug',
            require('./shell.pug')
        )
    }])
    .controller('MassShellCtrl', require('./shell-controller'))
