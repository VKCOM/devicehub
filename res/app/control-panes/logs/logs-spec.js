describe('LogsCtrl', function() {
    beforeEach(angular.mock.module(require('./').name))
    beforeEach(angular.mock.module('stf.util.common'))
    beforeEach(angular.mock.module('ngRoute'))

    var scope, ctrl

    beforeEach(inject(function($rootScope, $controller) {
        scope = $rootScope.$new()
        if ($rootScope.LogcatService && Object.keys($rootScope.LogcatService).length > 0) {
            scope.deviceEntries = $rootScope.LogcatService
        }
        ctrl = $controller('LogsCtrl', {$scope: scope})
    }))

    it('should ...', inject(function() {
        expect(1).toEqual(1)
    }))
})
