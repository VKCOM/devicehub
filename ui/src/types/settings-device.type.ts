import type { DeviceGroup, DeviceProvider } from '@/generated/types'

export type SettingsDevice = {
  group?: Pick<DeviceGroup, 'originName' | 'class' | 'lifeTime'>
  manufacturer?: string
  marketName?: string
  model?: string
  provider?: Pick<DeviceProvider, 'name'>
  sdk?: string
  serial: string
  version?: string
  storageId?: string
  place?: string
  adbPort?: number
}
