import { useEffect, useMemo } from 'react'
import { Placeholder, Skeleton } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { Icon56ErrorTriangleOutline, Icon56InboxOutline } from '@vkontakte/icons'
import cn from 'classnames'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { ConditionalRender } from '@/components/lib/conditional-render'
import { TableWithStickyHeader } from '@/components/lib/table-with-sticky-header'

import { resolveTableFilterValue } from '@/lib/utils/resolve-table-filter-value.util'
import { deviceTableState } from '@/store/device-table-state'
import { useDebounce } from '@/lib/hooks/use-debounce.hook'

import { DEFAULT_COLUMN_ORDER, ROW_HEIGHT } from './constants'

import { DEVICE_COLUMNS } from './columns'
import { TableBody } from './table-body'
import { fuzzyFilter } from './helpers'

import styles from './device-table.module.css'

import type { ListDevice } from '@/types/list-device.type'

type DeviceTableProps = {
  data: ListDevice[]
  isSuccess: boolean
  isLoading: boolean
  isError: boolean
}

export const DeviceTable = observer(({ data, isSuccess, isLoading, isError }: DeviceTableProps) => {
  const { t } = useTranslation()
  const debouncedGlobalFilter = useDebounce(deviceTableState.globalFilter, 250)
  const tableColumns = useMemo(
    () =>
      isLoading
        ? DEVICE_COLUMNS.map((column) => ({
            ...column,
            cell: () => <Skeleton width='100%' />,
          }))
        : DEVICE_COLUMNS,
    [isLoading]
  )
  const table = useReactTable({
    data,
    columns: tableColumns,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility: deviceTableState.columnVisibility,
    },
    onColumnVisibilityChange: deviceTableState.setColumnVisibility,
    globalFilterFn: 'fuzzy',
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    initialState: {
      columnOrder: DEFAULT_COLUMN_ORDER,
      sorting: [
        {
          id: 'state',
          desc: false,
        },
        {
          id: 'product',
          desc: false,
        },
      ],
    },
  })

  const { rows } = table.getRowModel()

  useEffect(() => {
    const { globalFilter, columnFilters } = resolveTableFilterValue(debouncedGlobalFilter)

    const existingColumnFilters = columnFilters.filter((column) => {
      if (table.getColumn(column.id)) {
        return true
      }

      // NOTE: Здесь можно добавить логику, которая будет показывать ошибку о том, что такой колонки не существует
      return false
    })

    table.setGlobalFilter(globalFilter)
    table.setColumnFilters(existingColumnFilters)
  }, [debouncedGlobalFilter])

  useEffect(() => {
    deviceTableState.setFilteredDeviceCount(rows.length)
  }, [rows.length])

  return (
    <div className={styles.tableWrapper}>
      <TableWithStickyHeader
        className={styles.table}
        offsetTop={45}
        tableHeight={`${rows.length * ROW_HEIGHT + ROW_HEIGHT}px`}
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  role='button'
                  className={cn({
                    [styles.asc]: header.column.getIsSorted() === 'asc',
                    [styles.desc]: header.column.getIsSorted() === 'desc',
                    [styles.activeSort]: header.column.getIsSorted(),
                  })}
                  style={{
                    width: `${header.column.getSize()}px`,
                  }}
                  title={
                    header.column.getCanSort()
                      ? header.column.getNextSortingOrder() === 'asc'
                        ? 'Sort ascending'
                        : header.column.getNextSortingOrder() === 'desc'
                          ? 'Sort descending'
                          : 'Clear sort'
                      : undefined
                  }
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <ConditionalRender conditions={[(isSuccess || isLoading) && rows.length > 0]}>
          <TableBody rows={rows} />
        </ConditionalRender>
      </TableWithStickyHeader>
      <ConditionalRender conditions={[isSuccess && rows.length === 0]}>
        <Placeholder icon={<Icon56InboxOutline />}>{t('No devices connected')}</Placeholder>
      </ConditionalRender>
      <ConditionalRender conditions={[isError]}>
        <Placeholder icon={<Icon56ErrorTriangleOutline />}>{t('Something went wrong')}</Placeholder>
      </ConditionalRender>
    </div>
  )
})
