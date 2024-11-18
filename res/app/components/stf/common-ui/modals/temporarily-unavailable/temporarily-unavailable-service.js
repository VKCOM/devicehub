module.exports =
  function TemporarilyUnavailableServiceFactory($uibModal, $location, $window, $route) {
      var service = {}

      var ModalInstanceCtrl = function($scope, $uibModalInstance, message) {
          $scope.ok = function() {
              $uibModalInstance.close(true)
              $route.reload() // TODO: check if works and git history
          }

          $scope.message = message

          $scope.cancel = function() {
              $uibModalInstance.dismiss('cancel')
          }

          $scope.second = function() {
              $uibModalInstance.dismiss()
              $location.path('/devices/')
          }
      }

      service.open = function(message) {
          const tempModal = document.getElementById('temporarily-unavailable')

          if(!tempModal) {
              var modalInstance = $uibModal.open({
                  template: require('./temporarily-unavailable.pug')
                  , controller: ModalInstanceCtrl
                  , resolve: {
                      message: function() {
                          return message
                      }
                  }
                  , openedClass: '_temporarily-unavailable-modal'
                  , windowClass: 'temporarily-unavailable-modal'
                  , windowTopClass: '_top',
              })

              modalInstance.result.then(function() {
              }, function() {
              })

              return modalInstance
          }
      }

      return service
  }
