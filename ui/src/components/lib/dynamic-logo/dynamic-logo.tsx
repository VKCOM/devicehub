import { memo } from 'react'
import cn from 'classnames'
import { useColorScheme } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import DeviceHubIcon from '@/assets/device-hub.svg?react'
import EmulatorHubIcon from '@/assets/emulator-hub.svg?react'

import styles from './dynamic-logo.module.css'

type DynamicLogoProps = {
  width?: number
  height?: number
  className?: string
  logoType: 'deviceHub' | 'emulatorHub'
}

export const DynamicLogo = memo(({ width, height, className, logoType = 'deviceHub' }: DynamicLogoProps) => {
  const colorScheme = useColorScheme()

  return (
    <>
      <ConditionalRender conditions={[logoType === 'deviceHub']}>
        <DeviceHubIcon
          className={cn(className, { [styles.darkLogo]: colorScheme === 'dark' })}
          height={height}
          title='DeviceHub'
          width={width}
        />
      </ConditionalRender>
      <ConditionalRender conditions={[logoType === 'emulatorHub']}>
        <EmulatorHubIcon
          className={cn(className, { [styles.darkLogo]: colorScheme === 'dark' })}
          height={height}
          title='EmulatorHub'
          width={width}
        />
      </ConditionalRender>
    </>
  )
})
