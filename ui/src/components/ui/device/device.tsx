import { observer } from 'mobx-react-lite'
import { Flex } from '@vkontakte/vkui'
import { ErrorBoundary } from 'react-error-boundary'

import { ErrorFallback } from '@/components/lib/error-fallback'

import { DeviceTopBar } from './device-top-bar'
import { DeviceScreen } from './device-screen'
import { DeviceNavigationButtons } from './device-navigation-buttons'

export const Device = observer(() => (
  <Flex direction='column' noWrap>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <DeviceTopBar />
      <DeviceScreen />
      <DeviceNavigationButtons />
    </ErrorBoundary>
  </Flex>
))
