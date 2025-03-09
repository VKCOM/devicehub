import { rankItem } from '@tanstack/match-sorter-utils'

import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { startsWithFilter } from '@/lib/utils/starts-with-filter.util'

import { TextCell } from './cells/text-cell/text-cell'

import type { DeviceTableColumnIds } from './types'
import type { ColumnGroup } from '@/types/column-group.type'
import type { DeviceState } from '@/types/enums/device-state.enum'
import type { ListDevice } from '@/types/list-device.type'
import type { DeviceBrowserAppsItem, DeviceNetwork } from '@/generated/types'
import type { FilterFn, Row, DisplayColumnDef, FilterFnOption, SortingFnOption } from '@tanstack/react-table'

export const fuzzyFilter: FilterFn<ListDevice> = (row, columnId, value, addMeta): boolean => {
  const itemRank = rankItem(row.getValue(columnId), value, { threshold: 3 })

  addMeta({
    itemRank,
  })

  return itemRank.passed
}

export const browserAppsFilter = (row: Row<ListDevice>, columnId: string, filterValue: string): boolean =>
  row.getValue<DeviceBrowserAppsItem[]>(columnId).findIndex((item) => item.type?.includes(filterValue)) !== -1

export const browserAppsSorting = (rowA: Row<ListDevice>, rowB: Row<ListDevice>, columnId: string): number => {
  const appTypeA = rowA.getValue<DeviceBrowserAppsItem[]>(columnId)?.[0]?.type || ''
  const appTypeB = rowB.getValue<DeviceBrowserAppsItem[]>(columnId)?.[0]?.type || ''

  return appTypeA.localeCompare(appTypeB)
}

const DEVICE_STATE_ORDER: Record<DeviceState, number> = {
  using: 10,
  automation: 15,
  available: 20,
  busy: 30,
  preparing: 50,
  unauthorized: 60,
  offline: 70,
  present: 80,
  absent: 90,
  unhealthy: 100,
}

export const deviceStatusSorting = (rowA: Row<ListDevice>, rowB: Row<ListDevice>, columnId: string): number => {
  const stateA = rowA.getValue<DeviceState>(columnId)
  const stateB = rowB.getValue<DeviceState>(columnId)

  return DEVICE_STATE_ORDER[stateA] - DEVICE_STATE_ORDER[stateB]
}

export const textColumnDef = ({
  columnId,
  columnName,
  columnGroup,
  size,
  filterFn = startsWithFilter,
  sortingFn = 'basic',
}: {
  columnId: DeviceTableColumnIds
  columnName: string
  columnGroup: ColumnGroup
  size?: number
  filterFn?: FilterFnOption<ListDevice>
  sortingFn?: SortingFnOption<ListDevice>
}): DisplayColumnDef<ListDevice, string> => ({
  header: () => <TextWithTranslation name={columnName} />,
  id: columnId,
  meta: {
    columnName,
    columnGroup,
  },
  size,
  filterFn,
  sortingFn,
  cell: ({ getValue }) => <TextCell textValue={getValue()} />,
})

export const getNetworkString = (
  networkType: DeviceNetwork['type'],
  networkSubtype: DeviceNetwork['subtype']
): string => (networkSubtype ? (networkType + ' (' + networkSubtype + ')').toUpperCase() : networkType || '')
