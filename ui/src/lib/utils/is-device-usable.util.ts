import type { Device } from '@/generated/types'

type IsDeviceUsableArgs = {
  status: Device['status']
  present: Device['present']
  ready: Device['ready']
  using: Device['using']
  hasOwner: boolean
}

export const isDeviceUsable = ({ present, status, ready, hasOwner, using }: IsDeviceUsableArgs): boolean =>
  /*
     NOTE: Usable IF device is physically present AND device is online AND
     preparations are ready AND the device has no owner or we are the owner
  */
  Boolean(present && status === 3 && ready && (!hasOwner || using))
