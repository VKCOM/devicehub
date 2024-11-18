import { DeviceState } from '@/types/enums/device-state.enum'

export const isDeviceInactive = (state: DeviceState): boolean => {
  if (
    state === DeviceState.ABSENT ||
    state === DeviceState.OFFLINE ||
    state === DeviceState.UNAUTHORIZED ||
    state === DeviceState.PREPARING ||
    state === DeviceState.BUSY ||
    state === DeviceState.UNHEALTHY
  ) {
    return true
  }

  return false
}
