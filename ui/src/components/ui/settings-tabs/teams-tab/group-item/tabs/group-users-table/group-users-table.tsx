import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, Tooltip } from '@vkontakte/vkui'
import { Icon16MailOutline, Icon36UserOutline, Icon20UserStarOutline } from '@vkontakte/icons'
import { createColumnHelper } from '@tanstack/react-table'

import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { toSentenceCase } from '@/lib/utils/to-sentence-case.util'
import { useAddUserInGroup } from '@/lib/hooks/use-add-user-in-group.hook'
import { useRemoveUserFromGroup } from '@/lib/hooks/use-remove-user-from-group.hook'
import { useAddUserAsModerator } from '@/lib/hooks/use-add-user-as-moderator.hook'
import { useRemoveUserAsModerator } from '@/lib/hooks/use-remove-user-as-moderator.hook'

import { GroupTable, GroupTopFilters, IsInGroupCell, isInGroupSorting } from '../group-table'

import { GroupUsersColumnIds } from './types'

import type { ColumnDef, Row } from '@tanstack/react-table'
import type { GroupUser } from '@/types/group-user.type'
import type { DataWithGroupStatus } from '@/types/data-with-group-status.type'

const columnHelper = createColumnHelper<DataWithGroupStatus<GroupUser>>()

export const GroupUsersTable = observer(() => {
  const { t } = useTranslation()
  const { mutate: addUsersInGroup } = useAddUserInGroup()
  const { mutate: removeUsersFromGroup } = useRemoveUserFromGroup()
  const { mutate: addUserAsModerator } = useAddUserAsModerator()
  const { mutate: removeUserAsModerator } = useRemoveUserAsModerator()

  const groupItemService = useInjection(CONTAINER_IDS.groupItemService)
  const currentUserProfileStore = useInjection(CONTAINER_IDS.currentUserProfileStore)
  const { isLoading } = groupItemService.usersQueryResult

  const hasEditPermissions = useMemo(() => {
    const currentGroup = groupItemService.currentGroup
    const isAdmin = currentUserProfileStore.isAdmin
    const isOwner = currentGroup?.owner?.email === currentUserProfileStore.profileQueryResult?.data?.email
    const isModerator = currentGroup?.moderators?.includes(
      currentUserProfileStore.profileQueryResult?.data?.email || ''
    )

    return isAdmin || isOwner || isModerator
  }, [
    groupItemService.currentGroup,
    currentUserProfileStore.profileQueryResult?.data?.email,
    currentUserProfileStore.isAdmin,
  ])

  const filteredData = useMemo(() => {
    if (hasEditPermissions) {
      return groupItemService.groupUsersData
    }

    // If no edit permissions, only show users that are in the group
    return groupItemService.groupUsersData.filter((user) => user.isInGroup)
  }, [hasEditPermissions, groupItemService.groupUsersData])

  const displayData = useMemo(() => {
    if (currentUserProfileStore.isAdmin) {
      return filteredData
    }

    return filteredData.filter((user) => user.privilege !== 'admin')
  }, [filteredData, currentUserProfileStore.isAdmin])

  const columns = useMemo(
    () => [
      ...(hasEditPermissions
        ? [
            columnHelper.accessor((row) => row.isInGroup, {
              id: GroupUsersColumnIds.IS_IN_GROUP,
              sortingFn: isInGroupSorting,
              header: () => (
                <IsInGroupCell
                  isAddToGroupDisabled={!groupItemService.currentGroup?.users?.length}
                  isInGroup={!groupItemService.isSomeUsersNotInGroup}
                  isRemoveFromGroupDisabled={!groupItemService.isCanRemoveAllUsers}
                  onAddToGroup={() => addUsersInGroup({ groupId: groupItemService.currentGroupId })}
                  onRemoveFromGroup={() => removeUsersFromGroup({ groupId: groupItemService.currentGroupId })}
                />
              ),
              cell: ({ getValue, row }) => {
                const { email: userEmail } = row.original

                return (
                  <IsInGroupCell
                    isInGroup={getValue()}
                    isRemoveFromGroupDisabled={userEmail === groupItemService.currentGroup?.owner?.email}
                    onAddToGroup={() => addUsersInGroup({ groupId: groupItemService.currentGroupId, userEmail })}
                    onRemoveFromGroup={() =>
                      removeUsersFromGroup({ groupId: groupItemService.currentGroupId, userEmail })
                    }
                  />
                )
              },
            }),
          ]
        : []),
      columnHelper.accessor((row) => toSentenceCase(row.name || ''), {
        header: () => <TextWithTranslation name='Name' />,
        id: GroupUsersColumnIds.NAME,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.email || '', {
        header: () => <TextWithTranslation name='Email' />,
        id: GroupUsersColumnIds.EMAIL,
        cell: ({ getValue }) => getValue(),
      }),
      // Only show privilege column for admins
      ...(currentUserProfileStore.isAdmin
        ? [
            columnHelper.accessor((row) => toSentenceCase(row.privilege || ''), {
              header: () => <TextWithTranslation name='Privilege' />,
              id: GroupUsersColumnIds.PRIVILEGE,
              cell: ({ getValue }) => getValue(),
            }),
          ]
        : []),
      // Add moderator column if user can manage moderators
      ...(hasEditPermissions
        ? [
            columnHelper.accessor(
              (row) => {
                const currentGroup = groupItemService.currentGroup
                const userEmail = row.email || ''
                const isOwner = userEmail === currentGroup?.owner?.email
                const isModerator = currentGroup?.moderators?.includes(userEmail)

                return {
                  isModerator,
                  isOwner,
                  email: userEmail,
                }
              },
              {
                header: () => <TextWithTranslation name='Group privilege' />,
                id: GroupUsersColumnIds.MODERATOR,
                cell: ({ getValue }) => {
                  const { isModerator, isOwner, email } = getValue()

                  // Owner can't be assigned as moderator (they already have all permissions)
                  if (isOwner) {
                    return (
                      <Button
                        before={<Icon20UserStarOutline height={24} width={24} />}
                        mode={'primary'}
                        size='s'
                        onClick={() => {}}
                      >
                        {t('Owner')}
                      </Button>
                    )
                  }

                  return (
                    <Button
                      before={<Icon36UserOutline height={24} width={24} />}
                      mode={isModerator ? 'outline' : 'primary'}
                      size='s'
                      onClick={() =>
                        isModerator
                          ? removeUserAsModerator({
                              groupId: groupItemService.currentGroupId,
                              userEmail: email,
                            })
                          : addUserAsModerator({
                              groupId: groupItemService.currentGroupId,
                              userEmail: email,
                            })
                      }
                    >
                      {isModerator ? t('Remove Moderator') : t('Make Moderator')}
                    </Button>
                  )
                },
              }
            ),
          ]
        : []),
    ],
    [hasEditPermissions, currentUserProfileStore.isAdmin]
  ) as ColumnDef<DataWithGroupStatus<GroupUser>>[]

  const onWriteEmail = async (users: Row<DataWithGroupStatus<GroupUser>>[]) => {
    const emails = await groupItemService.getGroupUsersEmails(users)

    navigator.clipboard.writeText(emails)
  }

  return (
    <GroupTable
      columns={columns}
      data={displayData}
      getRowId={(row) => row.email as string}
      isDataLoading={isLoading}
      initialState={{
        sorting: [
          {
            id: hasEditPermissions ? GroupUsersColumnIds.IS_IN_GROUP : GroupUsersColumnIds.NAME,
            desc: false,
          },
        ],
      }}
    >
      {(table) => (
        <GroupTopFilters table={table}>
          <Tooltip appearance='accent' description={t('Write an email to the group user selection')}>
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
        </GroupTopFilters>
      )}
    </GroupTable>
  )
})
