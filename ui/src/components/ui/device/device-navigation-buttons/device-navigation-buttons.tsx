import { Flex } from '@vkontakte/vkui'
import { Icon24SquareOutline, Icon28ArrowUturnLeftOutline, Icon28HomeOutline, Icon28Menu } from '@vkontakte/icons'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { deviceControlStore } from '@/store/device-control-store'
import { deviceBySerialStore } from '@/store/device-by-serial-store'

import { NavigationButton } from './navigation-button'

import styles from './device-navigation-buttons.module.css'

export const DeviceNavigationButtons = () => {
  const { t } = useTranslation()
  const { serial } = useParams()

  const { data: device } = deviceBySerialStore.deviceQueryResult(serial || '')

  return (
    <Flex align='center' className={styles.deviceNavigationButtons} justify='space-around'>
      <ConditionalRender conditions={[!!device?.ios]}>
        <NavigationButton
          beforeIcon={<Icon24SquareOutline />}
          title={`${t('Home')}`}
          onClick={() => {
            if (!device?.channel) return

            deviceControlStore.goHome(device.channel)
          }}
        />
      </ConditionalRender>
      <ConditionalRender conditions={[!device?.ios]}>
        <NavigationButton
          beforeIcon={<Icon28Menu />}
          title={`${t('Menu')}`}
          onClick={() => {
            if (!device?.channel) return

            deviceControlStore.openMenu(device.channel)
          }}
        />
        <NavigationButton
          beforeIcon={<Icon28HomeOutline />}
          title={`${t('Home')}`}
          onClick={() => {
            if (!device?.channel) return

            deviceControlStore.goHome(device.channel)
          }}
        />
        <NavigationButton
          beforeIcon={<Icon24SquareOutline height={28} width={28} />}
          title={`${t('App switch')}`}
          onClick={() => {
            if (!device?.channel) return

            deviceControlStore.openAppSwitch(device.channel)
          }}
        />
        <NavigationButton
          beforeIcon={<Icon28ArrowUturnLeftOutline />}
          title={`${t('Back')}`}
          onClick={() => {
            if (!device?.channel) return

            deviceControlStore.goBack(device.channel)
          }}
        />
      </ConditionalRender>
    </Flex>
  )
}
