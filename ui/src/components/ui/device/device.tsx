import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useParams } from 'react-router'
import { Flex } from '@vkontakte/vkui'
import { ErrorBoundary } from 'react-error-boundary'

import { ErrorFallback } from '@/components/lib/error-fallback'

import { deviceConnection } from '@/store/device-connection'

import { DeviceTopBar } from './device-top-bar'
import { DeviceScreen } from './device-screen'
import { DeviceNavigationButtons } from './device-navigation-buttons'

export const Device = observer(() => {
  const { serial } = useParams()

  useEffect(() => {
    if (!serial) return

    deviceConnection.useDevice(serial)
  }, [])

  return (
    <Flex direction='column' noWrap>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <DeviceTopBar />
        <DeviceScreen />
        <DeviceNavigationButtons />
      </ErrorBoundary>
    </Flex>
  )
})
