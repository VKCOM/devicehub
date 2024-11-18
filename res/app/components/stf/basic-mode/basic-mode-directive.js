module.exports = function basicModeDirective($rootScope, BrowserInfo) {
    return {
        restrict: 'AE'
        , link: function(scope, element) {
            $rootScope.basicMode = !!BrowserInfo.mobile
            element.addClass('basic-mode')
        }
    }
}
