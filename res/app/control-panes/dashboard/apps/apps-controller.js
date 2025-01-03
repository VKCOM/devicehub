// See https://github.com/android/platform_packages_apps_settings/blob/master/AndroidManifest.xml
var io = require('socket.io')

module.exports = function ShellCtrl($scope, AppState) {
    var websocketUrl = AppState.config.websocketUrl || ''
    var socket = io(websocketUrl, {
        reconnection: false, transports: ['websocket']
    })

    $scope.result = null

    var run = function(cmd) {
        var command = cmd
        // Force run activity
        command += ' --activity-clear-top'
        return $scope.control.shell(command)
            .then(function(result) {
                // console.log(result)
            })
    }

    // TODO: Move this to server side
    // TODO: Android 2.x doesn't support openSetting(), account for that on the UI

    function openSetting(activity) {
        socket.emit('openSettings', {data: 'somedate'})
        run('am start -a android.intent.action.MAIN -n com.android.settings/.Settings\\$' +
    activity)
    }

    $scope.openSettings = function() {
        socket.emit('openSettings', {data: 'somedate'})
        run('am start -a android.intent.action.MAIN -n com.android.settings/.Settings')
        $scope.control.openSettings()
    }

    $scope.openWiFiSettings = function() {
    // openSetting('WifiSettingsActivity')
        run('am start -a android.settings.WIFI_SETTINGS')
    }

    $scope.openLocaleSettings = function() {
        openSetting('LocalePickerActivity')
    }

    $scope.openIMESettings = function() {
        openSetting('KeyboardLayoutPickerActivity')
    }

    $scope.openDisplaySettings = function() {
        openSetting('DisplaySettingsActivity')
    }

    $scope.openDeviceInfo = function() {
        openSetting('DeviceInfoSettingsActivity')
    }

    $scope.openManageApps = function() {
        console.log('openManageApps')
        socket.emit('manageOptions', {data: 'manageOptions'})
        // openSetting('ManageApplicationsActivity')
        run('am start -a android.settings.APPLICATION_SETTINGS')
    }

    $scope.openRunningApps = function() {
        openSetting('RunningServicesActivity')
    }

    $scope.openDeveloperSettings = function() {
        openSetting('DevelopmentSettingsActivity')
    }

    $scope.$on('$destroy', function() {
        socket.close()
        socket = null
    })

    $scope.clear = function() {
        $scope.command = ''
        $scope.data = ''
        $scope.result = null
    }
}
