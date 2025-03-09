import { Flex } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'

import { StatisticCard } from '@/components/lib/statistic-card'
import { StatisticCardIcon } from '@/components/lib/statistic-card/types'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import styles from './device-statistics.module.css'

export const DeviceStatistics = observer(() => {
  const { t } = useTranslation()

  const deviceListStore = useInjection(CONTAINER_IDS.deviceListStore)
  const { profileQueryResult } = useInjection(CONTAINER_IDS.currentUserProfileStore)

  return (
    <Flex align='center' justify='space-between'>
      <StatisticCard
        className={styles.deviceStatistics}
        color='var(--vkui--color_accent_azure)'
        icon={StatisticCardIcon.DEVICES_OUTLINE}
        text={t('Total Devices').toUpperCase()}
        value={deviceListStore.totalNumberDevices}
      />
      <StatisticCard
        appearance='accent-green'
        className={styles.deviceStatistics}
        icon={StatisticCardIcon.CHECK_CIRCLE_DEVICE_OUTLINE}
        text={t('Usable Devices').toUpperCase()}
        value={deviceListStore.usableDevicesCount}
      />
      <StatisticCard
        className={styles.deviceStatistics}
        color='var(--vkui--color_accent_orange)'
        icon={StatisticCardIcon.USERS_OUTLINE}
        text={t('Busy Devices').toUpperCase()}
        value={deviceListStore.busyDevicesCount}
      />
      <StatisticCard
        appearance='neutral'
        className={styles.deviceStatistics}
        icon={StatisticCardIcon.USER_CIRCLE_OUTLINE}
        text={profileQueryResult.data?.name?.toUpperCase()}
        value={deviceListStore.usingDevicesCount}
      />
    </Flex>
  )
})
