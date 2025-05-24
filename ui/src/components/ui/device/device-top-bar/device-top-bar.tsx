import { useEffect, useState } from 'react'
import cn from 'classnames'
import { useNavigate } from 'react-router'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { ButtonGroup, EllipsisText, Flex, Button } from '@vkontakte/vkui'
import { Icon24CancelOutline, Icon24VerticalRectangle9x16Outline, Icon28DevicesOutline } from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { ScreenQualitySelector } from '@/components/ui/screen-quality-selector'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { getMainRoute } from '@/constants/route-paths'

import styles from './device-top-bar.module.css'

export const DeviceTopBar = observer(() => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)

  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)
  const deviceDisconnection = useInjection(CONTAINER_IDS.deviceDisconnection)

  const { data: device } = deviceBySerialStore.deviceQueryResult()

  const deviceTitle = !device?.ios ? `${device?.manufacturer || ''} ${device?.marketName || ''}` : device?.model || ''
  const currentRotation = `${t('Current rotation:')} ${deviceScreenStore.getScreenRotation}°`

  useEffect(() => {
    const onPopState = () => {
      window.history.pushState({ modalOpened: true }, '')

      setIsConfirmationOpen(true)
    }

    window.addEventListener('popstate', onPopState)
    window.history.pushState({ modalOpened: false }, '')

    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  return (
    <Flex align='center' className={styles.deviceHeader} id='deviceTopBar' justify='space-between'>
      <Flex align='center' className={styles.deviceName} id='deviceName' noWrap>
        <Icon28DevicesOutline className={styles.icon} height={25} width={25} />
        <EllipsisText>{deviceTitle}</EllipsisText>
      </Flex>
      <ButtonGroup align='center' gap='none' mode='horizontal'>
        <Button
          appearance='neutral'
          before={<Icon24VerticalRectangle9x16Outline />}
          borderRadiusMode='inherit'
          className={styles.topButton}
          disabled={!deviceScreenStore.isScreenRotated}
          mode='tertiary'
          title={`${t('Portrait')} (${currentRotation})`}
          onClick={() => deviceControlStore.tryToRotate('portrait')}
        />
        <Button
          appearance='neutral'
          before={<Icon24VerticalRectangle9x16Outline />}
          borderRadiusMode='inherit'
          className={cn(styles.topButton, styles.landscape)}
          disabled={deviceScreenStore.isScreenRotated}
          mode='tertiary'
          title={`${t('Landscape')} (${currentRotation})`}
          onClick={() => deviceControlStore.tryToRotate('landscape')}
        />
        <ConditionalRender conditions={[!device?.ios]}>
          <ScreenQualitySelector />
        </ConditionalRender>
        <Button
          appearance='neutral'
          before={<Icon24CancelOutline />}
          borderRadiusMode='inherit'
          className={styles.topButton}
          mode='tertiary'
          title={t('Stop Using')}
          onClick={() => setIsConfirmationOpen(true)}
        />
      </ButtonGroup>
      <WarningModal
        description={t('Are you sure? Device will be cleaned')}
        isOpen={isConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsConfirmationOpen(false)}
        onOk={async () => {
          if (!device?.channel) return

          await deviceDisconnection.stopUsingDevice(device.serial, device.channel)

          navigate(getMainRoute(), { replace: true })
        }}
      />
    </Flex>
  )
})
