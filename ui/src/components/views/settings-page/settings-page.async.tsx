import { lazy } from 'react'

export const SettingsPageAsync = lazy(async () => ({
  default: (await import('./settings-page')).SettingsPage,
}))
