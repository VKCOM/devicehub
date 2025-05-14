import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { View, Panel, Group, CustomScrollView, Header, Flex, Counter } from '@vkontakte/vkui'

import { DeviceTable } from '@/components/ui/device-table'
import { SearchDevice } from '@/components/ui/search-device'
import { DeviceStatistics } from '@/components/ui/device-statistics'
import { TableColumnVisibility } from '@/components/ui/table-column-visibility'

import { deviceTableState } from '@/store/device-table-state'

import styles from './devices-page.module.css'

export const DevicesPage = observer(() => {
  const { t } = useTranslation()

  return (
    <View activePanel='main'>
      <Panel className={styles.devicesPage} id='main'>
        <DeviceStatistics />
        <Group
          header={
            <Header id='devicesListCounter' indicator={<Counter  size='s'>{deviceTableState.filteredDeviceCount}</Counter>} size='s'>
              {t('Devices')}
            </Header>
          }
        >
          <Flex align='center'>
            <SearchDevice />
            <TableColumnVisibility />
          </Flex>
          <CustomScrollView enableHorizontalScroll={true}>
            <DeviceTable />
          </CustomScrollView>
        </Group>
      </Panel>
    </View>
  )
})
