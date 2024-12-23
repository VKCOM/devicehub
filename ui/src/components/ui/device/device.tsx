import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { Flex } from '@vkontakte/vkui'
import { ErrorBoundary } from 'react-error-boundary'

import { ErrorFallback } from '@/components/lib/error-fallback'

import { deviceConnection } from '@/store/device-connection'
import { useDeviceSerial } from '@/lib/hooks/use-device-serial.hook'

import { DeviceTopBar } from './device-top-bar'
import { DeviceScreen } from './device-screen'
import { DeviceNavigationButtons } from './device-navigation-buttons'

export const Device = observer(() => {
  const serial = useDeviceSerial()

  useEffect(() => {
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
