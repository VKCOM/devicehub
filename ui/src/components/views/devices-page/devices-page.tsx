import { View, Panel, Group, CustomScrollView, Header, Flex } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'

import { DeviceTable } from '@/components/ui/device-table'
import { SearchDevice } from '@/components/ui/search-device'
import { DeviceStatistics } from '@/components/ui/device-statistics'
import { TableColumnVisibility } from '@/components/ui/table-column-visibility'

import { deviceListStore } from '@/store/device-list-store'

import type { Device } from '@/generated/types'

export const DevicesPage = observer(() => {
  const { t } = useTranslation()
  const { devicesQueryResult } = deviceListStore

  const displayData = useMemo<Device[]>(
    () => (devicesQueryResult.isLoading ? Array(10).fill({}) : (devicesQueryResult.data ?? [])),
    [devicesQueryResult.isLoading, devicesQueryResult.data]
  )

  return (
    <View activePanel='main'>
      <Panel id='main'>
        <DeviceStatistics />
        <Group header={<Header mode='secondary'>{t('Devices')}</Header>}>
          <Flex align='center'>
            <SearchDevice />
            <TableColumnVisibility />
          </Flex>
          <CustomScrollView enableHorizontalScroll={true} windowResize={true}>
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
