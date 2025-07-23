import { Flex } from '@vkontakte/vkui'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Icon24SquareOutline, Icon28ArrowUturnLeftOutline, Icon28HomeOutline, Icon28Menu } from '@vkontakte/icons'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { NavigationButton } from './navigation-button'

import styles from './device-navigation-buttons.module.css'

export const DeviceNavigationButtons = observer(() => {
  const { t } = useTranslation()

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()

  return (
    <Flex align='center' className={styles.deviceNavigationButtons} justify='space-around'>
      <ConditionalRender conditions={[device?.manufacturer === 'Apple']}>
        <NavigationButton
          beforeIcon={<Icon24SquareOutline />}
          title={`${t('Home')}`}
          onClick={() => {
            deviceControlStore.home()
          }}
        />
      </ConditionalRender>
      <ConditionalRender conditions={[device?.manufacturer !== 'Apple']}>
        <NavigationButton
          beforeIcon={<Icon28Menu />}
          title={`${t('Menu')}`}
          onClick={() => {
            deviceControlStore.menu()
          }}
        />
        <NavigationButton
          beforeIcon={<Icon28HomeOutline />}
          title={`${t('Home')}`}
          onClick={() => {
            deviceControlStore.home()
          }}
        />
        <NavigationButton
          beforeIcon={<Icon24SquareOutline height={28} width={28} />}
          title={`${t('App switch')}`}
          onClick={() => {
            deviceControlStore.appSwitch()
          }}
        />
        <NavigationButton
          beforeIcon={<Icon28ArrowUturnLeftOutline />}
          title={`${t('Back')}`}
          onClick={() => {
            deviceControlStore.back()
          }}
        />
      </ConditionalRender>
    </Flex>
  )
})
