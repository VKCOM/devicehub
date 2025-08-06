import { useInjection } from 'inversify-react'
import { useEffect, useRef, useState } from 'react'
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

export const DeviceScreen = () => {
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const [deviceType, setDeviceType] = useState<DeviceType>(DeviceType.FETCHING)

  useEffect(() => {
    deviceScreenStore.init().then(() => {
      const device = deviceScreenStore.getDevice

      return (
        device &&
        setDeviceType(
          device.manufacturer === 'Apple'
            ? DeviceType.APPLE
            : device.platform === 'Tizen'
              ? DeviceType.TIZEN
              : DeviceType.ANDROID
        )
      )
    })
  }, [])

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
}
