module.exports =
  function AdbKeysCtrl($scope, $http, UserService, GenericModalService) {
      $scope.adbKeys = []

      function updateKeys() {
          $scope.adbKeys = UserService.getAdbKeys()
      }

      $scope.removeKey = function(key) {
          GenericModalService.open({
              message: 'Вы уверены, что хотите удалить ADB ключ?'
              , type: 'Warning'
              , size: 'lg'
              , cancel: true
          })
              .then(function() {
                  UserService.removeAdbKey(key)
              })
      }

      $scope.$on('user.keys.adb.updated', updateKeys)
      updateKeys()
  }
