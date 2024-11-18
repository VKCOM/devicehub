module.exports = function InputCtrl($scope) {
    let muteButton = document.getElementById('muteButton')

    muteButton.onclick = function() {
        if (muteButton.getAttribute('disabled')) {
            return
        }

        $scope.control.keyPress('mute')
        muteButton.setAttribute('disabled', 'disabled')
        muteButton.setAttribute('style', 'cursor: wait;')

        setTimeout(function() {
            muteButton.removeAttribute('disabled')
            muteButton.setAttribute('style', 'cursor: pointer;')
        }, 16000)
    }

    $scope.press = function(key) {
        $scope.control.keyPress(key)
    }

    let run = function(cmd) {
        return $scope.control.shell(cmd)
            .then(function(result) {
            })
    }

    $scope.unlockDevice = function() {
        run('input text 1452').then(() => {
            run('input keyevent 66')
        })
    }

    $scope.setLightTheme = function() {
        run('cmd uimode night no')
    }

    $scope.setDarkTheme = function() {
        run('cmd uimode night yes')
    }

    $scope.enableDKA = function() {
        run('settings put global always_finish_activities 1')
    }

    $scope.disableDKA = function() {
        run('settings put global always_finish_activities 0')
    }

    $scope.enableGapps = function() {
        run('pm enable com.google.android.gms')
        run('pm enable-user com.google.android.gms')
    }

    $scope.disableGapps = function() {
        run('pm disable-user com.google.android.gms')
    }

    $scope.fontChange = function(value) {
        run('settings put system font_scale ' + value)
    }

    $scope.openLanguageChange = function() {
        run('am start -a android.settings.LOCALE_SETTINGS')
    }
}
