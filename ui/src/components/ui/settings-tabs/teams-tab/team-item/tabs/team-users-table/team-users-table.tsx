import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, Tooltip } from '@vkontakte/vkui'
import { Icon16MailOutline } from '@vkontakte/icons'
import { createColumnHelper } from '@tanstack/react-table'

import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { toSentenceCase } from '@/lib/utils/to-sentence-case.util'
import { useAddUserInTeam } from '@/lib/hooks/use-add-user-in-team.hook'
import { useRemoveUserFromTeam } from '@/lib/hooks/use-remove-user-from-team.hook'

import { TeamTable, TeamTopFilters, IsInTeamCell, isInTeamSorting } from '../team-table'

import { TeamUsersColumnIds } from './types'

import type { ColumnDef, Row } from '@tanstack/react-table'
import type { TeamUser } from '@/types/team-user.type'
import type { DataWithTeamStatus } from '@/types/data-with-team-status.type'

const columnHelper = createColumnHelper<DataWithTeamStatus<TeamUser>>()

export const TeamUsersTable = observer(() => {
  const { t } = useTranslation()
  const { mutate: addUsersInTeam } = useAddUserInTeam()
  const { mutate: removeUsersFromTeam } = useRemoveUserFromTeam()

  const teamItemService = useInjection(CONTAINER_IDS.teamItemService)
  const currentUserProfileStore = useInjection(CONTAINER_IDS.currentUserProfileStore)
  const { isLoading } = teamItemService.usersQueryResult

  const filteredData = useMemo(() => teamItemService.teamUsersData, [teamItemService.teamUsersData])

  const displayData = useMemo(() => filteredData, [filteredData])

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.isInTeam, {
        id: TeamUsersColumnIds.IS_IN_TEAM,
        sortingFn: isInTeamSorting,
        header: () => '',
        cell: ({ getValue, row }) => {
          const { email: userEmail } = row.original

          return (
            <IsInTeamCell
              isInTeam={getValue()}
              onAddToTeam={() => addUsersInTeam({ teamId: teamItemService.currentTeamId, userEmail })}
              onRemoveFromTeam={() => removeUsersFromTeam({ teamId: teamItemService.currentTeamId, userEmail })}
            />
          )
        },
      }),
      columnHelper.accessor((row) => toSentenceCase(row.name || ''), {
        header: () => <TextWithTranslation name='Name' />,
        id: TeamUsersColumnIds.NAME,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.email || '', {
        header: () => <TextWithTranslation name='Email' />,
        id: TeamUsersColumnIds.EMAIL,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => toSentenceCase(row.privilege || ''), {
        header: () => <TextWithTranslation name='Privilege' />,
        id: TeamUsersColumnIds.PRIVILEGE,
        cell: ({ getValue }) => getValue(),
      }),
    ],
    []
  ) as ColumnDef<DataWithTeamStatus<TeamUser>>[]

  const onWriteEmail = async (users: Row<DataWithTeamStatus<TeamUser>>[]) => {
    const emails = await teamItemService.getTeamUsersEmails(users)

    navigator.clipboard.writeText(emails)
  }

  return (
    <TeamTable
      columns={columns}
      data={displayData}
      getRowId={(row) => row.email as string}
      isDataLoading={isLoading}
      initialState={{
        sorting: [
          {
            id: currentUserProfileStore.isAdmin ? TeamUsersColumnIds.IS_IN_TEAM : TeamUsersColumnIds.NAME,
            desc: false,
          },
        ],
      }}
    >
      {(table) => (
        <TeamTopFilters table={table}>
          <Tooltip appearance='accent' description={t('Write an email to the team user selection')}>
            <Button
              before={<Icon16MailOutline />}
              disabled={table.getRowModel().rows.length === 0}
              href='mailto:?body=*** Paste the email addresses from the clipboard! ***'
              mode='link'
              size='s'
              onClick={() => onWriteEmail(table.getRowModel().rows)}
            >
              {t('Contact Users')}
            </Button>
          </Tooltip>
        </TeamTopFilters>
      )}
    </TeamTable>
  )
})
