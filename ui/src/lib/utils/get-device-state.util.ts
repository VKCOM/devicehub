import { DeviceState } from '@/types/enums/device-state.enum'

import { isDeviceUsable } from './is-device-usable.util'

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

  const deviceUsable = isDeviceUsable({
    present: data.present,
    status: data.status,
    ready: data.ready,
    using: data.using,
    hasOwner: !!data.owner,
  })

  // NOTE: Make sure we don't mistakenly think we still have the device
  const isDeviceUsedByMistake = !deviceUsable || !data.owner

  if (data.status === 3 && data.ready && (!data.using || isDeviceUsedByMistake) && data.owner) {
    return DeviceState.BUSY
  }

  if (
    (data.status === 3 && data.ready && (!data.using || isDeviceUsedByMistake) && !data.owner) ||
    (data.status === 6 && data.manufacturer === 'Apple')
  ) {
    return DeviceState.AVAILABLE
  }

  if (data.status === 3 && data.ready && data.using && !isDeviceUsedByMistake && data.usage === 'automation') {
    return DeviceState.AUTOMATION
  }

  if (data.status === 3 && data.ready && data.using && !isDeviceUsedByMistake && data.usage !== 'automation') {
    return DeviceState.USING
  }

  if (data.status === 7) {
    return DeviceState.UNHEALTHY
  }

  return DeviceState.PRESENT
}
