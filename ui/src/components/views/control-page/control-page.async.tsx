import { lazy } from 'react'

export const ControlPageAsync = lazy(async () => ({
  default: (await import('./control-page')).ControlPage,
}))
