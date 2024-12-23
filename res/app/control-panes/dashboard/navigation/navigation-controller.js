const _ = require('lodash')

module.exports = function NavigationCtrl($scope, $rootScope) {
    let faviconIsSet = false

    function setUrlFavicon(url) {
        let FAVICON_BASE_URL = '//www.google.com/s2/favicons?domain_url='
        $scope.urlFavicon = FAVICON_BASE_URL + url
        faviconIsSet = true
    }

    function resetFavicon() {
        $scope.urlFavicon = require('./default-favicon.png')
        faviconIsSet = false
    }

    resetFavicon()

    $scope.textUrlChanged = function() {
        if (faviconIsSet) {
            resetFavicon()
        }
    }

    function addHttp(textUrl) {
    // Check for '://' because a protocol-less URL might include
    // a username:password combination.
    // Ignores also any query parameter because it may contain a http:// inside.
        return (textUrl.replace(/\?.*/, '').indexOf('://') === -1 ? 'http://' : ''
        ) + textUrl
    }

    $scope.blurUrl = false

    $scope.openURL = function() {
        $scope.blurUrl = true
        $rootScope.screenFocus = true

        let url = addHttp($scope.textURL)
        setUrlFavicon(url)
        return $scope.control.openBrowser(url, $scope.browser)
    }

    function setCurrentBrowser(browser) {
        if (browser && browser.apps) {
            let currentBrowser = {}
            if (browser.selected) {
                let selectedBrowser = _.head(browser.apps, 'selected')
                if (!_.isEmpty(selectedBrowser)) {
                    currentBrowser = selectedBrowser
                }
            }
            else {
                let defaultBrowser = _.find(browser.apps, {name: 'Browser'})
                if (defaultBrowser) {
                    currentBrowser = defaultBrowser
                }
                else {
                    currentBrowser = _.head(browser.apps)
                }
            }
            $rootScope.browser = currentBrowser
        }
    }

    setCurrentBrowser($scope.device ? $scope.device.browser : null)

    $scope.$watch('device.browser', function(newValue, oldValue) {
        if (newValue !== oldValue) {
            setCurrentBrowser(newValue)
        }
    }, true)

    $scope.clearSettings = function() {
        let browser = $scope.browser
        $scope.control.clearBrowser(browser)
    }
}
