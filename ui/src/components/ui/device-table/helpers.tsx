import { rankItem } from '@tanstack/match-sorter-utils'

import { TextCell } from './cells/text-cell/text-cell'
import { HeaderWithTranslation } from './header-with-translation'

import type { DeviceTableColumnIds } from './types'
import type { ColumnGroup } from '@/types/column-group.type'
import type { DeviceState } from '@/types/enums/device-state.enum'
import type { FilterFn, Row, DisplayColumnDef, FilterFnOption, SortingFnOption } from '@tanstack/react-table'
import type { Device, DeviceBattery, DeviceBrowserAppsItem, DeviceNetwork } from '@/generated/types'

export const fuzzyFilter: FilterFn<Device> = (row, columnId, value, addMeta): boolean => {
  const itemRank = rankItem(row.getValue(columnId), value, { threshold: 3 })

  addMeta({
    itemRank,
  })

  return itemRank.passed
}

export const startsWithFilter = <T,>(row: Row<Device>, columnId: string, filterValue: string): boolean => {
  const value = row.getValue<T>(columnId)

  if (typeof value !== 'string') return false

  return value.toLowerCase().startsWith(filterValue.toLowerCase())
}

export const browserAppsFilter = (row: Row<Device>, columnId: string, filterValue: string): boolean =>
  row.getValue<DeviceBrowserAppsItem[]>(columnId).findIndex((item) => item.type?.includes(filterValue)) !== -1

export const browserAppsSorting = (rowA: Row<Device>, rowB: Row<Device>, columnId: string): number => {
  const appTypeA = rowA.getValue<DeviceBrowserAppsItem[]>(columnId)[0]?.type || ''
  const appTypeB = rowB.getValue<DeviceBrowserAppsItem[]>(columnId)[0]?.type || ''

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

export const deviceStatusSorting = (rowA: Row<Device>, rowB: Row<Device>, columnId: string): number => {
  const stateA = rowA.getValue<DeviceState>(columnId)
  const stateB = rowB.getValue<DeviceState>(columnId)

  return DEVICE_STATE_ORDER[stateA] - DEVICE_STATE_ORDER[stateB]
}

export const textColumnDef = ({
  columnId,
  columnName,
  columnGroup,
  filterFn = startsWithFilter,
  sortingFn = 'basic',
}: {
  columnId: DeviceTableColumnIds
  columnName: string
  columnGroup: ColumnGroup
  filterFn?: FilterFnOption<Device>
  sortingFn?: SortingFnOption<Device>
}): DisplayColumnDef<Device, string> => ({
  header: () => <HeaderWithTranslation name={columnName} />,
  id: columnId,
  meta: {
    columnName,
    columnGroup,
  },
  filterFn,
  sortingFn,
  cell: ({ getValue }) => <TextCell textValue={getValue()} />,
})

export const getNetworkString = (
  networkType: DeviceNetwork['type'],
  networkSubtype: DeviceNetwork['subtype']
): string => (networkSubtype ? (networkType + ' (' + networkSubtype + ')').toUpperCase() : networkType || '')

export const getBatteryLevelString = (
  batteryLevel: DeviceBattery['level'],
  batteryScale: DeviceBattery['scale']
): string | null => {
  if (!batteryLevel || !batteryScale) return null

  return `${Math.floor((batteryLevel / batteryScale) * 100)}%`
}
