/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports = function EnhanceDeviceServiceFactory($filter, AppState) {
  var service = {}

  function setState(data) {
    // For convenience, formulate an aggregate state property that covers
    // every possible state.
    data.state = 'absent'
    if (data.present) {
      data.state = 'present'
      switch (data.status) {
        case 1:
          data.state = 'offline'
          break
        case 2:
          data.state = 'unauthorized'
          break
        case 3:
          data.state = 'preparing'
          if (data.ready) {
            data.state = 'ready'
            if (data.using) {
              if (data.usage === 'automation') {
                data.state = 'automation'
              }
              else {
                data.state = 'using'
              }
            }
            else {
              if (data.owner) {
                data.state = 'busy'
              }
              else {
                data.state = 'available'
              }
            }
          }
          break
      }
    }
  }

  function enhanceDevice(device) {
    device.enhancedName = device.marketName || device.name || device.model || device.serial
      || 'Unknown'
    device.enhancedModel = device.model || 'Unknown'
    device.enhancedImage120 = '/static/app/devices/icon/x120/' + (device.platform || device.image || '_default') + '.jpg'
    device.enhancedImage24 = '/static/app/devices/icon/x24/' + (device.platform || device.image || '_default') + '.jpg'
    if (device.ios && device.state === 'available' && !device.using) {
      device.enhancedStateAction = $filter('statusNameAction')('available')
      device.enhancedStatePassive = $filter('statusNamePassive')('available')
      return
    }
    if (device.ios && device.state === 'available' && device.using) {
      device.enhancedStateAction = $filter('statusNameAction')('using')
      device.enhancedStatePassive = $filter('statusNamePassive')('using')
      return
    }
    if (device.ios && device.status === 6 && device.state !== 'present') {
      device.enhancedStateAction = $filter('statusNameAction')('preparing')
      device.enhancedStatePassive = $filter('statusNamePassive')('preparing')
      return
    }
    if (device.ios && device.status === 6 && device.state === 'present') {
      device.status = 3
      device.state = 'available'
      device.enhancedStateAction = $filter('statusNameAction')('available')
      device.enhancedStatePassive = $filter('statusNamePassive')('available')
      return
    }
    if (device.status === 1) {
      device.enhancedStateAction = $filter('statusNameAction')('offline')
      device.enhancedStatePassive = $filter('statusNamePassive')('offline')
      return
    }
    if (device.status === 7) {
      device.enhancedStateAction = $filter('statusNameAction')('unhealthy')
      device.enhancedStatePassive = $filter('statusNamePassive')('unhealthy')
      return
    }
    device.enhancedStateAction = $filter('statusNameAction')(device.state)
    device.enhancedStatePassive = $filter('statusNamePassive')(device.state)
  }

  function enhanceDeviceDetails(device) {
    if (device.battery) {
      device.enhancedBatteryPercentage = (device.battery.level / device.battery.scale * 100) + '%'
      device.enhancedBatteryHealth = $filter('batteryHealth')(device.battery.health)
      device.enhancedBatterySource = $filter('batterySource')(device.battery.source)
      device.enhancedBatteryStatus = $filter('batteryStatus')(device.battery.status)
      device.enhancedBatteryTemp = device.battery.temp + '°C'
    }

    if (device.owner) {
      device.enhancedUserProfileUrl = enhanceUserProfileUrl(device.owner.email)
      device.enhancedUserName = device.owner.name || 'No name'
    }

    device.enhancedGroupOwnerProfileUrl = enhanceUserProfileUrl(device.group.owner.email)
  }

  function enhanceUserProfileUrl(email) {
    let url
    const userProfileUrl = (function() {
      if (AppState && AppState.config && AppState.config.userProfileUrl) {
        return AppState.config.userProfileUrl
      }
      return null
    })()

    if (userProfileUrl) {
      url = userProfileUrl + email.split('@')[0]
    } else if (email.indexOf('@') !== -1) {
      url = 'mailto:' + email
    } else {
      url = '/!#/user/' + email
    }
    return url
  }

  function enhanceDeviceAppState(device) {
    AppState.device.platform = device.platform
  }

  service.enhance = function(device) {
    setState(device)
    enhanceDevice(device)
    enhanceDeviceDetails(device)
    enhanceDeviceAppState(device)
  }

  return service
}
