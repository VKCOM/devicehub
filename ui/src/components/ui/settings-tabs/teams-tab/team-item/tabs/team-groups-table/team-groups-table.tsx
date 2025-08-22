import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'

import { TeamGroupsColumnIds } from '@/components/ui/settings-tabs/teams-tab/team-item/tabs/team-groups-table/types'
import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { toSentenceCase } from '@/lib/utils/to-sentence-case.util'
import { useAddGroupInTeam } from '@/lib/hooks/use-add-group-in-team.hook'
import { useRemoveGroupFromTeam } from '@/lib/hooks/use-remove-group-from-team.hook'

import { TeamTable, IsInTeamCell, isInTeamSorting } from '../team-table'

import type { ColumnDef } from '@tanstack/react-table'
import type { DataWithTeamStatus } from '@/types/data-with-team-status.type'
import type { GroupListResponseGroupsItem } from '@/generated/types'

const columnHelper = createColumnHelper<DataWithTeamStatus<GroupListResponseGroupsItem>>()

export const TeamGroupsTable = observer(() => {
  const { mutate: addGroupInTeam } = useAddGroupInTeam()
  const { mutate: removeGroupFromTeam } = useRemoveGroupFromTeam()

  const teamItemService = useInjection(CONTAINER_IDS.teamItemService)
  const { isLoading } = teamItemService.groupsQueryResult

  // Transform groups data to include isInTeam status based on groupId
  const userGroupsData = useMemo(() => {
    const groups = teamItemService.groupsQueryResult.data || []
    const currentTeamGroups = teamItemService.currentTeam.groups || []

    return groups.map((group) => ({
      ...group,
      isInTeam: currentTeamGroups.includes(group.id || ''),
    }))
  }, [teamItemService.groupsQueryResult.data, teamItemService.currentTeam.groups])

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.isInTeam, {
        id: TeamGroupsColumnIds.IS_IN_TEAM,
        sortingFn: isInTeamSorting,
        header: () => '',
        cell: ({ getValue, row }) => {
          const { id: groupId } = row.original
          const teamId = teamItemService.currentTeam.id

          return (
            <IsInTeamCell
              isInTeam={getValue()}
              onAddToTeam={() => (teamId && groupId ? addGroupInTeam({ teamId, groupId }) : undefined)}
              onRemoveFromTeam={() => (teamId && groupId ? removeGroupFromTeam({ teamId, groupId }) : undefined)}
            />
          )
        },
      }),
      columnHelper.accessor((row) => row.name, {
        header: () => <TextWithTranslation name='Name' />,
        id: TeamGroupsColumnIds.NAME,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.id, {
        header: () => <TextWithTranslation name='ID' />,
        id: TeamGroupsColumnIds.ID,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => toSentenceCase(row.class || ''), {
        header: () => <TextWithTranslation name='Class' />,
        id: TeamGroupsColumnIds.CLASS,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.owner?.name || '', {
        header: () => <TextWithTranslation name='Owner' />,
        id: TeamGroupsColumnIds.OWNER,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => toSentenceCase(row.privilege || ''), {
        header: () => <TextWithTranslation name='Privilege' />,
        id: TeamGroupsColumnIds.PRIVILEGE,
        cell: ({ getValue }) => getValue(),
      }),
    ],
    [userGroupsData, addGroupInTeam, removeGroupFromTeam]
  ) as ColumnDef<DataWithTeamStatus<GroupListResponseGroupsItem>>[]

  return (
    <TeamTable
      columns={columns}
      data={userGroupsData}
      getRowId={(row) => row.id as string}
      isDataLoading={isLoading}
      initialState={{
        sorting: [
          {
            id: TeamGroupsColumnIds.IS_IN_TEAM,
            desc: false,
          },
        ],
      }}
    />
  )
})
