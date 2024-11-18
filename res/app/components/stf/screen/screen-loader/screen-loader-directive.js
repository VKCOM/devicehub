module.exports = function screenLoaderDirective() {
    return {
        restrict: 'E'
        , template: require('./screen-loader.pug')
        , controller: ($scope, ScreenLoaderService) => {
            return {
                get isVisible() {
                    return ScreenLoaderService.isVisible
                },
            }
        }
        , controllerAs: '$ctrl',
    }
}
