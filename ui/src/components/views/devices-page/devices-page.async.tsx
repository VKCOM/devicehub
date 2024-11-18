import { lazy } from 'react'

export const DevicesPageAsync = lazy(async () => ({
  default: (await import('./devices-page')).DevicesPage,
}))
