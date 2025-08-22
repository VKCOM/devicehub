import { useMemo, useState } from 'react'
import { Flex, Search } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'

import { BaseSelect } from '@/components/lib/base-select'

import styles from './team-table.module.css'

import type { ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'
import type { SelectOption } from '@/components/lib/base-select'

enum IsUserInTeam {
  ALL = -1,
  IN_TEAM = 1,
  NOT_IN_TEAM = 0,
}

type TeamTopFiltersProps<T> = {
  table: Table<T>
  children?: ReactNode
}

export const TeamTopFilters = <T,>({ table, children }: TeamTopFiltersProps<T>) => {
  const { t } = useTranslation()
  const [globalFilter, setGlobalFilter] = useState('')
  const [isInTeamFilter, setIsInTeamFilter] = useState<IsUserInTeam>(IsUserInTeam.ALL)

  const isIngTeamOptions: SelectOption<IsUserInTeam | undefined>[] = useMemo(
    () => [
      { value: IsUserInTeam.ALL, name: t('All') },
      { value: IsUserInTeam.IN_TEAM, name: t('In team') },
      { value: IsUserInTeam.NOT_IN_TEAM, name: t('Not in team') },
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
          options={isIngTeamOptions}
          selectType='plain'
          stretched={false}
          value={isInTeamFilter}
          onChange={(value) => {
            setIsInTeamFilter(Number(value))

            if (Number(value) === IsUserInTeam.ALL) {
              table.getColumn('isInTeam')?.setFilterValue(undefined)
            }

            if (Number(value) === IsUserInTeam.IN_TEAM) {
              table.getColumn('isInTeam')?.setFilterValue(true)
            }

            if (Number(value) === IsUserInTeam.NOT_IN_TEAM) {
              table.getColumn('isInTeam')?.setFilterValue(false)
            }
          }}
        />
      </Flex>
      {children}
    </Flex>
  )
}
