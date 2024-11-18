module.exports = function($http, $templateCache, $compile) {
    var cache = {}

    return function(src, scope, cloneAttachFn) {
        var compileFn = cache[src]
        if (compileFn) {
            compileFn(scope, cloneAttachFn)
        }
        else {
            $http.get(src, {cache: $templateCache}).then(function(response) {
                var responseContents = angular.element('<div></div>').html(response.data).contents()
                compileFn = cache[src] = $compile(responseContents)
                compileFn(scope, cloneAttachFn)
            })
        }
    }
}
