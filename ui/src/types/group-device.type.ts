import type { DeviceDisplay, DeviceGroup, DeviceNetwork, DevicePhone, DeviceProvider } from '@/generated/types'

export type GroupDevice = {
  abi?: string
  cpuPlatform?: string
  display?: Pick<DeviceDisplay, 'width' | 'height'>
  group?: Pick<DeviceGroup, 'originName' | 'class' | 'lifeTime'>
  manufacturer?: string
  marketName?: string
  model?: string
  network?: Pick<DeviceNetwork, 'type' | 'subtype'>
  openGLESVersion?: string
  operator?: string | null
  phone?: Pick<DevicePhone, 'imei'>
  provider?: Pick<DeviceProvider, 'name'>
  sdk?: string
  serial: string
  version?: string
}
