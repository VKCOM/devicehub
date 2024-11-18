import { lazy } from 'react'

export const GroupsPageAsync = lazy(async () => ({
  default: (await import('./groups-page')).GroupsPage,
}))
