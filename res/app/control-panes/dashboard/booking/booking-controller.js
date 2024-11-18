module.exports = function BookingCtrl(
    $scope
    , $timeout
    , GroupService
    , DeviceService
) {
    $scope.reBook = function() {
        GroupService.invite($scope.device).then(() => {
            DeviceService.get($scope.device.serial, $scope).then((device) => {
                const startTime = device.statusChangedAt
                const expireTime = new Date(new Date(startTime).getTime() + device.bookedBefore)
                $scope.bookedBefore = `${beatifyValue(expireTime.getHours())}:${beatifyValue(expireTime.getMinutes())}`
                $scope.device = device
            })
        })
    }

    $scope.getTime = function() {
        if ($scope.device) {
            const startTime = $scope.device.statusChangedAt
            const expireTime = new Date(new Date(startTime).getTime() + $scope.device.bookedBefore)
            $scope.bookedBefore = `${beatifyValue(expireTime.getHours())}:${beatifyValue(expireTime.getMinutes())}`
        }
        else {
            setTimeout(() => {
                if ($scope.device) {
                    DeviceService.get($scope.device.serial, $scope).then((device) => {
                        $scope.device = device
                        $scope.getTime()
                    })
                }
            }, 100)
        }
    }

    $scope.getTime($scope.device)

    function beatifyValue(value) {
        if (value < 10) {
            return `0${value}`
        }
        else {
            return value
        }
    }
}
