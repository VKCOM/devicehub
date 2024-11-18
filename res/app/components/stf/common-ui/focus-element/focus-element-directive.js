module.exports = function focusElementDirective(
    $parse,
    $rootScope,
    $timeout,
) {
    return {
        restrict: 'A'
        , link: function(scope, element, attrs) {
            var model = $parse(attrs.focusElement)

            scope.$watch(model, function(value) {
                if (value === true) {
                    $timeout(function() {
                        element[0].focus()
                    })
                }
            })

            element.bind('blur', function() {
                if (model && model.assign) {
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
                }
            })
        }
    }
}
