import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'

import { UserGroupsColumnIds } from '@/components/ui/settings-tabs/users-tab/user-tabs/groups-tab/types'
import {
  GroupTable,
  IsInGroupCell,
  isInGroupSorting,
} from '@/components/ui/settings-tabs/groups-tab/group-item/tabs/group-table'
import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useRemoveUserFromGroup } from '@/lib/hooks/use-remove-user-from-group.hook'
import { useAddUserInGroup } from '@/lib/hooks/use-add-user-in-group.hook'
import { toSentenceCase } from '@/lib/utils/to-sentence-case.util'

import type { ColumnDef } from '@tanstack/react-table'
import type { DataWithGroupStatus } from '@/types/data-with-group-status.type'
import type { GroupListResponseGroupsItem } from '@/generated/types'

type GroupsTabProps = {
  email: string
}

const columnHelper = createColumnHelper<DataWithGroupStatus<GroupListResponseGroupsItem>>()

export const GroupsTab = observer(({ email }: GroupsTabProps) => {
  const { mutate: addUsersInGroup } = useAddUserInGroup()
  const { mutate: removeUsersFromGroup } = useRemoveUserFromGroup()

  const groupSettingsService = useInjection(CONTAINER_IDS.groupSettingsService)
  const { isLoading } = groupSettingsService.groupsQueryResult

  // Transform groups data to include isInGroup status based on user's email
  const userGroupsData = useMemo(() => {
    const groups = groupSettingsService.groupsQueryResult.data || []

    return groups.map((group) => ({
      ...group,
      isInGroup: !!group.users?.includes(email),
    }))
  }, [groupSettingsService.groupsQueryResult.data, email])

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.isInGroup, {
        id: UserGroupsColumnIds.IS_IN_GROUP,
        sortingFn: isInGroupSorting,
        header: () => '',
        cell: ({ getValue, row }) => {
          const { id: groupId } = row.original

          return (
            <IsInGroupCell
              isInGroup={getValue()}
              isRemoveFromGroupDisabled={email === row.original.owner?.email}
              onAddToGroup={() => (groupId ? addUsersInGroup({ groupId, userEmail: email || '' }) : undefined)}
              onRemoveFromGroup={() =>
                groupId ? removeUsersFromGroup({ groupId, userEmail: email || '' }) : undefined
              }
            />
          )
        },
      }),
      columnHelper.accessor((row) => row.name, {
        header: () => <TextWithTranslation name='Name' />,
        id: UserGroupsColumnIds.NAME,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.id, {
        header: () => <TextWithTranslation name='ID' />,
        id: UserGroupsColumnIds.ID,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => toSentenceCase(row.class || ''), {
        header: () => <TextWithTranslation name='Class' />,
        id: UserGroupsColumnIds.CLASS,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.owner?.name || '', {
        header: () => <TextWithTranslation name='Owner' />,
        id: UserGroupsColumnIds.OWNER,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => toSentenceCase(row.privilege || ''), {
        header: () => <TextWithTranslation name='Privilege' />,
        id: UserGroupsColumnIds.PRIVILEGE,
        cell: ({ getValue }) => getValue(),
      }),
    ],
    [email, userGroupsData, addUsersInGroup, removeUsersFromGroup]
  ) as ColumnDef<DataWithGroupStatus<GroupListResponseGroupsItem>>[]

  return (
    <GroupTable
      columns={columns}
      data={userGroupsData}
      getRowId={(row) => row.id as string}
      isDataLoading={isLoading}
      initialState={{
        sorting: [
          {
            id: UserGroupsColumnIds.IS_IN_GROUP,
            desc: false,
          },
        ],
      }}
    />
  )
})
