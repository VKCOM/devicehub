describe('MenuCtrl', function() {
    beforeEach(angular.mock.module(require('./').name))
    beforeEach(angular.mock.module('stf.logcat'))

    var scope, ctrl

    beforeEach(inject(function($rootScope, $controller) {
        scope = $rootScope.$new()
        ctrl = $controller('MenuCtrl', {$scope: scope})
    }))

    it('should ...', inject(function() {
        expect(1).toEqual(1)
    }))
})
