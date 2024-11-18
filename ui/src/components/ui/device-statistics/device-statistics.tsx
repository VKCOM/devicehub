import { Flex } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'

import { StatisticCard } from '@/components/lib/statistic-card'
import { StatisticCardIcon } from '@/components/lib/statistic-card/types'

import { deviceListStore } from '@/store/device-list-store'
import { currentUserProfileStore } from '@/store/current-user-profile-store'

import styles from './device-statistics.module.css'

export const DeviceStatistics = observer(() => {
  const { t } = useTranslation()
  const { profileQueryResult } = currentUserProfileStore

  return (
    <Flex align='center' justify='space-between'>
      <StatisticCard
        className={styles.deviceStatistics}
        icon={StatisticCardIcon.DEVICES_OUTLINE}
        text={t('Total Devices').toUpperCase()}
        value={deviceListStore.totalNumberDevices}
      />
      <StatisticCard
        className={styles.deviceStatistics}
        icon={StatisticCardIcon.CHECK_CIRCLE_DEVICE_OUTLINE}
        text={t('Usable Devices').toUpperCase()}
        value={deviceListStore.usableDevicesCount}
      />
      <StatisticCard
        className={styles.deviceStatistics}
        icon={StatisticCardIcon.USERS_OUTLINE}
        text={t('Busy Devices').toUpperCase()}
        value={deviceListStore.busyDevicesCount}
      />
      <StatisticCard
        className={styles.deviceStatistics}
        icon={StatisticCardIcon.USER_CIRCLE_OUTLINE}
        text={profileQueryResult.data?.name?.toUpperCase()}
        value={deviceListStore.usingDevicesCount}
      />
    </Flex>
  )
})
