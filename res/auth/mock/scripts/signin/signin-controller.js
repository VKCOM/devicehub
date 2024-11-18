/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports = function SignInCtrl($scope, $http, CommonService) {
    $scope.error = null

    $scope.submit = function() {
        let data = {
            name: $scope.signin.username.$modelValue
            , email: $scope.signin.email.$modelValue
        }
        $scope.invalid = false
        $http.post('/auth/api/v1/mock', data)
            .then(function(response) {
                $scope.error = null
                location.replace(response.data.redirect)
            })
            .catch(function(response) {
                switch (response.data.error) {
                case 'ValidationError':
                    $scope.error = {
                        $invalid: true
                    }
                    break
                case 'InvalidCredentialsError':
                    $scope.error = {
                        $incorrect: true
                    }
                    break
                default:
                    $scope.error = {
                        $server: true
                    }
                    break
                }
            })
    }

    $scope.openSupportLink = function() {
        $http.get('/auth/contact').then(function(response) {
            window.open(response.data.contactUrl, '_blank').focus()
        })
    }

    $http.get('/auth/contact').then(function(response) {
        $scope.contact = response.data.contactUrl
    })
}
