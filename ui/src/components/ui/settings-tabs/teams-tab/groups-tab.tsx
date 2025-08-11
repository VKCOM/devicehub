import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Button, Tooltip } from '@vkontakte/vkui'
import { Icon16MailOutline, Icon20UsersOutline } from '@vkontakte/icons'

import { ListHeader } from '@/components/lib/list-header'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useCreateGroup } from '@/lib/hooks/use-create-group.hook'
import { useRemoveGroups } from '@/lib/hooks/use-remove-groups.hook'

import { GroupList } from './group-list'

export const GroupsTab = observer(() => {
  const { t } = useTranslation()
  const { mutate: removeGroups } = useRemoveGroups()
  const { mutate: createGroup, isPending: isCreateGroupPending } = useCreateGroup()

  const groupSettingsService = useInjection(CONTAINER_IDS.groupSettingsService)
  const { isAdmin } = useInjection(CONTAINER_IDS.currentUserProfileStore)
  const { isLoading: isGroupsLoading } = groupSettingsService.groupsQueryResult

  const onWriteEmail = async () => {
    const emails = await groupSettingsService.getGroupOwnerEmails()

    navigator.clipboard.writeText(emails)

    groupSettingsService.clearSelectedItems()
  }

  const onRemove = () => {
    removeGroups(groupSettingsService.joinedGroupIds)

    groupSettingsService.clearSelectedItems()
  }

  useEffect(() => {
    groupSettingsService.addGroupSettingsListeners()

    return () => {
      groupSettingsService.removeGroupSettingsListeners()
    }
  }, [])

  return (
    <ListHeader
      beforeIcon={<Icon20UsersOutline />}
      containerId={CONTAINER_IDS.groupSettingsService}
      isAddButtonDisabled={!groupSettingsService.isCanCreateGroup}
      isAddButtonLoading={isCreateGroupPending}
      isItemsLoading={isGroupsLoading}
      isRemoveButtonDisabled={groupSettingsService.isRemoveGroupsDisabled}
      skeletonHeight={74}
      title={t('Group list')}
      actions={
        <ConditionalRender conditions={[isAdmin]}>
          <Tooltip appearance='accent' description={t('Write an email to the group user selection')}>
            <Button
              before={<Icon16MailOutline />}
              disabled={groupSettingsService.isSelectedItemsEmpty}
              href='mailto:?body=*** Paste the email addresses from the clipboard! ***'
              mode='link'
              size='s'
              onClick={onWriteEmail}
            >
              {t('Contact Owners')}
            </Button>
          </Tooltip>
        </ConditionalRender>
      }
      onAddItem={() => createGroup()}
      onRemove={onRemove}
    >
      <GroupList />
    </ListHeader>
  )
})
