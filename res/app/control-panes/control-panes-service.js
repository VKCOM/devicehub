module.exports =
  function ControlPanesServiceFactory($location, DeviceService, ControlService) {
      let ControlPanesService = Object.create(null)

      ControlPanesService.getDevice = function() {
          let serial = window.location.hash.split('/')[2]
          return DeviceService.load(serial)
              .then(function(device) {
                  return device
              })
              .catch(function() {
                  $location.path('/')
              })
      }

      ControlPanesService.getDeviceControl = function() {
          let serial = window.location.hash.split('/')[2]
          return DeviceService.load(serial)
              .then(function(device) {
                  return ControlService.create(device, device.channel)
              })
              .catch(function() {
                  $location.path('/')
              })
      }

      return ControlPanesService
  }
