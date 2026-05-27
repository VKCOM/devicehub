import { useInjection } from 'inversify-react'
import { observer } from 'mobx-react-lite'
import { useRef } from 'react'
import { Spinner } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { StreamingScreen, WebInspectorScreen } from './screens'

import styles from './device-screen.module.css'

enum DeviceType {
  FETCHING,
  ANDROID,
  APPLE,
  TIZEN,
}

const resolveDeviceType = (
  manufacturer: string | undefined,
  platform: string | undefined
): DeviceType => {
  if (!manufacturer && !platform) return DeviceType.FETCHING

  if (manufacturer === 'Apple') return DeviceType.APPLE

  if (platform === 'Tizen') return DeviceType.TIZEN

  return DeviceType.ANDROID
}

export const DeviceScreen = observer(() => {
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()
  const deviceType = resolveDeviceType(device?.manufacturer, device?.platform)

  return (
    <div ref={canvasWrapperRef} className={styles.deviceScreen} role='none'>
      <ConditionalRender conditions={[deviceType === DeviceType.FETCHING]}>
        <Spinner className={styles.spinner} size='xl' />
      </ConditionalRender>

      <ConditionalRender conditions={[[DeviceType.ANDROID, DeviceType.APPLE].includes(deviceType)]}>
        <StreamingScreen canvasWrapperRef={canvasWrapperRef} />
      </ConditionalRender>

      <ConditionalRender conditions={[deviceType === DeviceType.TIZEN]}>
        <WebInspectorScreen />
      </ConditionalRender>
    </div>
  )
})
