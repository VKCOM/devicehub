import { useMemo, useState } from 'react'
import { Flex, Search } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'

import { BaseSelect } from '@/components/lib/base-select'

import styles from './group-table.module.css'

import type { ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'
import type { SelectOption } from '@/components/lib/base-select'

enum IsUserInGroup {
  ALL = -1,
  IN_GROUP = 1,
  NOT_IN_GROUP = 0,
}

type GroupTopFiltersProps<T> = {
  table: Table<T>
  children?: ReactNode
}

export const GroupTopFilters = <T,>({ table, children }: GroupTopFiltersProps<T>) => {
  const { t } = useTranslation()
  const [globalFilter, setGlobalFilter] = useState('')
  const [isInGroupFilter, setIsInGroupFilter] = useState<IsUserInGroup>(IsUserInGroup.ALL)

  const isIngGroupOptions: SelectOption<IsUserInGroup | undefined>[] = useMemo(
    () => [
      { value: IsUserInGroup.ALL, name: t('All') },
      { value: IsUserInGroup.IN_GROUP, name: t('In group') },
      { value: IsUserInGroup.NOT_IN_GROUP, name: t('Not in group') },
    ],
    [t]
  )

  return (
    <Flex align='center' justify='space-between'>
      <Flex align='center'>
        <Search
          className={styles.search}
          value={globalFilter}
          noPadding
          onChange={(event) => {
            setGlobalFilter(event.target.value)

            table.setGlobalFilter(event.target.value)
          }}
        />
        <BaseSelect
          options={isIngGroupOptions}
          selectType='plain'
          stretched={false}
          value={isInGroupFilter}
          onChange={(value) => {
            setIsInGroupFilter(Number(value))

            if (Number(value) === IsUserInGroup.ALL) {
              table.getColumn('isInGroup')?.setFilterValue(undefined)
            }

            if (Number(value) === IsUserInGroup.IN_GROUP) {
              table.getColumn('isInGroup')?.setFilterValue(true)
            }

            if (Number(value) === IsUserInGroup.NOT_IN_GROUP) {
              table.getColumn('isInGroup')?.setFilterValue(false)
            }
          }}
        />
      </Flex>
      {children}
    </Flex>
  )
}
