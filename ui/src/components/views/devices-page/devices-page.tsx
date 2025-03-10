import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { View, Panel, Group, CustomScrollView, Header, Flex } from '@vkontakte/vkui'

import { DeviceTable } from '@/components/ui/device-table'
import { SearchDevice } from '@/components/ui/search-device'
import { DeviceStatistics } from '@/components/ui/device-statistics'
import { TableColumnVisibility } from '@/components/ui/table-column-visibility'
import { TitledValue } from '@/components/lib/titled-value'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { deviceTableState } from '@/store/device-table-state'

import styles from './devices-page.module.css'

import type { ListDevice } from '@/types/list-device.type'

export const DevicesPage = observer(() => {
  const { t } = useTranslation()

  const { devicesQueryResult } = useInjection(CONTAINER_IDS.deviceListStore)

  const displayData = useMemo<ListDevice[]>(
    () => (devicesQueryResult.isLoading ? Array(10).fill({}) : (devicesQueryResult.data ?? [])),
    [devicesQueryResult.isLoading, devicesQueryResult.data]
  )

  return (
    <View activePanel='main'>
      <Panel className={styles.devicesPage} id='main'>
        <DeviceStatistics />
        <Group header={<Header size='s'>{t('Devices')}</Header>}>
          <Flex align='center'>
            <SearchDevice />
            <TableColumnVisibility />
            <TitledValue
              className={styles.displayedDevices}
              isValueLoading={devicesQueryResult.isLoading}
              title={t('Displayed')}
              value={deviceTableState.filteredDeviceCount}
            />
          </Flex>
          <CustomScrollView enableHorizontalScroll={true}>
            <DeviceTable
              data={displayData}
              isError={devicesQueryResult.isError}
              isLoading={devicesQueryResult.isPending}
              isSuccess={devicesQueryResult.isSuccess}
            />
          </CustomScrollView>
        </Group>
      </Panel>
    </View>
  )
})
