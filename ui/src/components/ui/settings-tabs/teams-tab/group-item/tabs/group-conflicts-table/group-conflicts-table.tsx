import { useMemo } from 'react'
import { Button, Flex } from '@vkontakte/vkui'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { createColumnHelper } from '@tanstack/react-table'

import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { GroupTable } from '../group-table'

import { GroupConflictsColumnIds } from './types'

import type { ColumnDef } from '@tanstack/react-table'
import type { ConflictTableRow } from '@/types/conflict-table-row.type'

const columnHelper = createColumnHelper<ConflictTableRow>()

export const GroupConflictsTable = observer(() => {
  const { t } = useTranslation()

  const groupItemService = useInjection(CONTAINER_IDS.groupItemService)

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.serial, {
        header: () => <TextWithTranslation name={t('Serial')} />,
        id: GroupConflictsColumnIds.SERIAL,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.startDate, {
        header: () => <TextWithTranslation name={t('Start Date')} />,
        id: GroupConflictsColumnIds.START_DATE,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.stopDate, {
        header: () => <TextWithTranslation name={t('Stop Date')} />,
        id: GroupConflictsColumnIds.STOP_DATE,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.group, {
        header: () => <TextWithTranslation name={t('Group')} />,
        id: GroupConflictsColumnIds.GROUP,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.ownerName, {
        header: () => <TextWithTranslation name={t('Owner')} />,
        id: GroupConflictsColumnIds.OWNER_NAME,
        cell: ({ getValue }) => getValue(),
      }),
    ],
    [t]
  ) as ColumnDef<ConflictTableRow>[]

  return (
    <GroupTable columns={columns} data={groupItemService.conflicts}>
      {() => (
        <Flex justify='end'>
          <Button
            disabled={groupItemService.conflicts.length === 0}
            mode='secondary'
            size='s'
            onClick={() => groupItemService.clearConflicts()}
          >
            {t('Clear')}
          </Button>
        </Flex>
      )}
    </GroupTable>
  )
})
