import { Button, Flex } from '@vkontakte/vkui'
import { Icon24SquareOutline, Icon28ArrowUturnLeftOutline, Icon28HomeOutline, Icon28Menu } from '@vkontakte/icons'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { deviceControlStore } from '@/store/device-control-store'
import { deviceBySerialStore } from '@/store/device-by-serial-store'

import styles from './device-navigation-bar.module.css'

export const DeviceNavigationBar = () => {
  const { t } = useTranslation()
  const { serial } = useParams()

  const { data: device } = deviceBySerialStore.deviceQueryResult(serial || '')

  return (
    <Flex align='center' className={styles.deviceNavigationBar} justify='space-around'>
      <ConditionalRender conditions={[!!device?.ios]}>
        <Button
          appearance='neutral'
          before={<Icon24SquareOutline />}
          borderRadiusMode='inherit'
          className={styles.navigationButton}
          mode='tertiary'
          title={`${t('Home')}`}
          onClick={() => {
            if (!serial) return

            deviceControlStore.goHome(serial)
          }}
        />
      </ConditionalRender>
      <ConditionalRender conditions={[!device?.ios]}>
        <Button
          appearance='neutral'
          before={<Icon28Menu />}
          borderRadiusMode='inherit'
          className={styles.navigationButton}
          mode='tertiary'
          title={`${t('Menu')}`}
          onClick={() => {
            if (!serial) return

            deviceControlStore.openMenu(serial)
          }}
        />
        <Button
          appearance='neutral'
          before={<Icon28HomeOutline />}
          borderRadiusMode='inherit'
          className={styles.navigationButton}
          mode='tertiary'
          title={`${t('Home')}`}
          onClick={() => {
            if (!serial) return

            deviceControlStore.goHome(serial)
          }}
        />
        <Button
          appearance='neutral'
          before={<Icon24SquareOutline height={28} width={28} />}
          borderRadiusMode='inherit'
          className={styles.navigationButton}
          mode='tertiary'
          title={`${t('App switch')}`}
          onClick={() => {
            if (!serial) return

            deviceControlStore.openAppSwitch(serial)
          }}
        />
        <Button
          appearance='neutral'
          before={<Icon28ArrowUturnLeftOutline />}
          borderRadiusMode='inherit'
          className={styles.navigationButton}
          mode='tertiary'
          title={`${t('Back')}`}
          onClick={() => {
            if (!serial) return

            deviceControlStore.goBack(serial)
          }}
        />
      </ConditionalRender>
    </Flex>
  )
}
