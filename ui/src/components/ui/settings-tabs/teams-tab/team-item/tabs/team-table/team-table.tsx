import { useEffect, useMemo } from 'react'
import cn from 'classnames'
import { useTranslation } from 'react-i18next'
import { Icon28InboxOutline } from '@vkontakte/icons'
import {
  flexRender,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table'
import { Flex, Pagination, Placeholder, Skeleton, Spacing } from '@vkontakte/vkui'

import { BaseSelect } from '@/components/lib/base-select'
import { fuzzyFilter } from '@/components/ui/device-table/helpers'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { PAGE_SIZE_OPTIONS } from '@/constants/page-size-options'

import styles from './team-table.module.css'

import type { ReactNode } from 'react'
import type { ColumnDef, Table, InitialTableState } from '@tanstack/react-table'

type TeamTableProps<T> = {
  data: T[]
  isDataLoading?: boolean
  columns: ColumnDef<T>[]
  getRowId?: (row: T) => string
  initialState?: InitialTableState
  children?: (table: Table<T>) => ReactNode
}

export const TeamTable = <T,>({
  data,
  columns,
  getRowId,
  children,
  initialState,
  isDataLoading,
}: TeamTableProps<T>) => {
  const { t } = useTranslation()

  const displayData = useMemo<T[]>(() => (isDataLoading ? Array(5).fill({}) : data), [isDataLoading, data])
  const tableColumns = useMemo(
    () =>
      isDataLoading
        ? columns.map((column) => ({ ...column, cell: () => <Skeleton height='100%' width='100%' /> }))
        : columns,
    [isDataLoading, columns]
  )

  const table = useReactTable({
    data: displayData,
    columns: tableColumns,
    getRowId,
    initialState: { pagination: { pageSize: PAGE_SIZE_OPTIONS[0].value, pageIndex: 0 }, ...initialState },
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    autoResetPageIndex: false,
    globalFilterFn: 'fuzzy',
    filterFns: { fuzzy: fuzzyFilter },
  })

  useEffect(() => {
    if (table.getRowModel().rows.length === 0) table.setPageIndex(0)
  }, [table.getRowModel().rows.length])

  return (
    <div className={styles.teamTable}>
      {children?.(table)}
      <Spacing size='xl' />
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerTeam) => (
              <tr key={headerTeam.id}>
                {headerTeam.headers.map((header) => (
                  <th
                    key={header.id}
                    role='button'
                    className={cn({
                      [styles.asc]: header.column.getIsSorted() === 'asc',
                      [styles.desc]: header.column.getIsSorted() === 'desc',
                    })}
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
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ConditionalRender conditions={[table.getRowModel().rows.length === 0]}>
          <Placeholder icon={<Icon28InboxOutline />}>{t('Empty')}</Placeholder>
        </ConditionalRender>
      </div>
      <ConditionalRender conditions={[table.getRowModel().rows.length !== 0]}>
        <Spacing size='4xl' />
        <Flex align='center' justify='center'>
          <Pagination
            boundaryCount={1}
            currentPage={table.getState().pagination.pageIndex + 1}
            navigationButtonsStyle='icon'
            siblingCount={1}
            totalPages={table.getPageCount()}
            onChange={(pageNumber) => table.setPageIndex(pageNumber - 1)}
          />
          <BaseSelect
            options={PAGE_SIZE_OPTIONS}
            selectType='plain'
            stretched={false}
            value={table.getState().pagination.pageSize}
            onChange={(value) => table.setPageSize(Number(value))}
          />
        </Flex>
      </ConditionalRender>
    </div>
  )
}
