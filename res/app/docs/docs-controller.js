module.exports =
  function DocsCtrl($rootScope, $scope, $window, $location, $http) {
      $http.get('/auth/docs').then(function(response) {
          window.open(response.data.docsUrl, '_blank').focus()
      })
  }
