module.exports =
  function ControlPanesNoDeviceController($location, SettingsService) {
      let lastUsedDevice = SettingsService.get('lastUsedDevice')

      if (lastUsedDevice) {
          $location.path('/control/' + lastUsedDevice)
      }
      else {
          $location.path('/')
      }
  }
