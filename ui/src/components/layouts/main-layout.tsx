import { Outlet, useMatch } from 'react-router'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useQuery } from '@tanstack/react-query'

import { Header } from '@/components/ui/header'
import { AlertMarquee } from '@/components/ui/alert-marquee'

import { silentDeviceQueryKey } from '@/services/device-session'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { SilentDevice } from '@/generated/types'

/*
 * A silent device may ask for its control page without the site header, e.g. to embed it in an iframe.
 * The header stays hidden until the device is described, so an embedded page never flashes it.
 */
const useHideHeader = (): boolean => {
  const match = useMatch('/silent-control/:provider/:serial/*')
  const { provider = '', serial = '' } = match?.params ?? {}
  // Observes the query of the page's DeviceSession without fetching it
  const { data, isError } = useQuery<SilentDevice>({ queryKey: silentDeviceQueryKey(provider, serial), enabled: false })

  if (!match || isError) return false

  return data?.hideHeader ?? true
}

export const MainLayout = observer(() => {
  const settingsService = useInjection(CONTAINER_IDS.settingsService)
  const hideHeader = useHideHeader()

  // Keep the tree shape stable: remounting the outlet would restart the device session
  return (
    <>
      {!hideHeader && <Header />}
      {!hideHeader && <AlertMarquee />}
      <main
        className={cn('pageWrapper', {
          headless: hideHeader,
          marqueeOffset: !hideHeader && settingsService.isAlertMessageActive,
        })}
      >
        <Outlet />
      </main>
    </>
  )
})
