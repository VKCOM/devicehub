import type { Device } from '@/generated/types'

export const deviceServiceToString = (deviceService: Device['service']): string => {
  const services = []

  if (deviceService?.hasGMS) {
    services.push('GMS')
  }

  if (deviceService?.hasHMS) {
    services.push('HMS')
  }

  return services.join(', ')
}
