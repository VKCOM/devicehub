import { DeviceState } from '@/types/enums/device-state.enum'

import type { Device } from '@/generated/types'

export const getDeviceState = (data: Device): DeviceState => {
  if (!data.present) {
    return DeviceState.ABSENT
  }

  if (data.status === 1) {
    return DeviceState.OFFLINE
  }

  if (data.status === 2) {
    return DeviceState.UNAUTHORIZED
  }

  if (data.status === 3 && !data.ready) {
    return DeviceState.PREPARING
  }

  if (data.status === 3 && data.ready && !data.using && data.owner) {
    return DeviceState.BUSY
  }

  if ((data.status === 3 && data.ready && !data.using && !data.owner) || (data.status === 6 && data.ios)) {
    return DeviceState.AVAILABLE
  }

  if (data.status === 3 && data.ready && data.using && data.usage === 'automation') {
    return DeviceState.AUTOMATION
  }

  if (data.status === 3 && data.ready && data.using && data.usage !== 'automation') {
    return DeviceState.USING
  }

  if (data.status === 7) {
    return DeviceState.UNHEALTHY
  }

  return DeviceState.PRESENT
}
