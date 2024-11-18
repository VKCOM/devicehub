module.exports = function blurElementDirective(
    $parse,
    $rootScope,
    $timeout,
) {
    return {
        restrict: 'A'
        , link: function(scope, element, attrs) {
            var model = $parse(attrs.blurElement)

            scope.$watch(model, function(value) {
                if (value === true) {
                    $timeout(function() {
                        element[0].blur()
                    })
                }
            })

            element.bind('blur', function() {
                if(!$rootScope.$$phase) {
                    scope.$apply(() => {
                        model.assign(scope, false)
                    })
                }
                else {
                    scope.$applyAsync(() => {
                        model.assign(scope, false)
                    })
                }
            })
        }
    }
}
