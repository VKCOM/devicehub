module.exports = function ScreenLoaderServiceFactory(
    $rootScope,
) {
    let isVisible = true

    return {
        get isVisible() {
            return isVisible
        }
        , hide
        , show,
    }

    // in most cases this will be called outside angular
    function show() {
        if(!$rootScope.$$phase) {
            $rootScope.$apply(showLoader)
        }
        else {
            $rootScope.$applyAsync(showLoader)
        }
    }

    function showLoader() {
        isVisible = true
    }

    // in most cases this will be called outside angular
    function hide() {
        if(!$rootScope.$$phase) {
            $rootScope.$apply(hideLoader)
        }
        else {
            $rootScope.$applyAsync(hideLoader)
        }
    }

    function hideLoader() {
        isVisible = false
    }
}
