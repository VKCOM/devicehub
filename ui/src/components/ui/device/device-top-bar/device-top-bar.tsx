import { useParams } from 'react-router'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { ButtonGroup, EllipsisText, Flex, Button } from '@vkontakte/vkui'
import { Icon24VerticalRectangle9x16Outline, Icon28DevicesOutline } from '@vkontakte/icons'

import { ConditionalRender } from '@/components/lib/conditional-render'
import { ScreenQualitySelector } from '@/components/ui/screen-quality-selector'

import { useServiceLocator } from '@/lib/hooks/use-service-locator.hook'
import { DeviceScreenStore } from '@/store/device-screen-store/device-screen-store'
import { deviceBySerialStore } from '@/store/device-by-serial-store'
import { DeviceControlStore } from '@/store/device-control-store'

import styles from './device-top-bar.module.css'

export const DeviceTopBar = observer(() => {
  const { t } = useTranslation()
  const { serial } = useParams()
  const deviceScreenStore = useServiceLocator<DeviceScreenStore>(DeviceScreenStore.name)
  const deviceControlStore = useServiceLocator<DeviceControlStore>(DeviceControlStore.name)

  const { data: device } = deviceBySerialStore.deviceQueryResult(serial || '')

  const deviceTitle = !device?.ios ? `${device?.manufacturer || ''} ${device?.marketName || ''}` : device?.model || ''
  const currentRotation = `${t('Current rotation:')} ${deviceScreenStore?.getScreenRotation}°`

  return (
    <Flex align='center' className={styles.deviceHeader} justify='space-between'>
      <Flex align='center' className={styles.deviceName} noWrap>
        <Icon28DevicesOutline className={styles.icon} height={25} width={25} />
        <EllipsisText>{deviceTitle}</EllipsisText>
      </Flex>
      <ButtonGroup align='center' gap='none' mode='horizontal'>
        <Button
          appearance='neutral'
          before={<Icon24VerticalRectangle9x16Outline />}
          borderRadiusMode='inherit'
          className={styles.screenRotationButton}
          disabled={!deviceScreenStore?.isScreenRotated}
          mode='tertiary'
          title={`${t('Portrait')} (${currentRotation})`}
          onClick={() => {
            if (!serial) return

            deviceControlStore?.tryToRotate(serial, 'portrait')
          }}
        />
        <Button
          appearance='neutral'
          before={<Icon24VerticalRectangle9x16Outline />}
          borderRadiusMode='inherit'
          className={cn(styles.screenRotationButton, styles.landscape)}
          disabled={deviceScreenStore?.isScreenRotated}
          mode='tertiary'
          title={`${t('Landscape')} (${currentRotation})`}
          onClick={() => {
            if (!serial) return

            deviceControlStore?.tryToRotate(serial, 'landscape')
          }}
        />
        <ConditionalRender conditions={[!device?.ios]}>
          <ScreenQualitySelector />
        </ConditionalRender>
      </ButtonGroup>
    </Flex>
  )
})
