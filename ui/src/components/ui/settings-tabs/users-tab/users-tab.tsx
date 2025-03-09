import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, FormItem, FormLayoutGroup, Separator, Spacing, Tooltip, useColorScheme } from '@vkontakte/vkui'
import { Icon16MailOutline, Icon20FilterOutline, Icon20GearOutline, Icon20UserOutline } from '@vkontakte/icons'

import { ListHeader } from '@/components/lib/list-header'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { YesNoAnyRadioGroup } from '@/components/lib/yes-no-any-radio-group'
import { CreateUserModal, UpdateGroupQuotaModal } from '@/components/ui/modals'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useRemoveUsers } from '@/lib/hooks/use-remove-users.hook'
import { useUpdateDefaultUserGroupsQuota } from '@/lib/hooks/use-update-default-user-groups-quota.hook'

import { UserList } from './user-list'

import styles from './users-tab.module.css'

import type { DeleteUsersParams } from '@/generated/types'

export const UsersTab = observer(() => {
  const { t } = useTranslation()
  const colorScheme = useColorScheme()
  const { mutate: removeUsers } = useRemoveUsers()
  const { mutate: updateDefaultQuota } = useUpdateDefaultUserGroupsQuota()
  const [isUpdateQuotaModalOpen, setIsUpdateQuotaModalOpen] = useState(false)
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [removeFilters, setRemoveFilters] = useState<DeleteUsersParams>({ groupOwner: false })

  const userSettingsService = useInjection(CONTAINER_IDS.userSettingsService)
  const { isLoading: isUsersLoading } = userSettingsService.usersQueryResult

  const onRemove = () => {
    removeUsers({ emails: userSettingsService.joinedUsersEmails, ...removeFilters })

    userSettingsService.clearSelectedItems()
  }

  const onWriteEmail = async () => {
    const emails = await userSettingsService.getUserEmails()

    navigator.clipboard.writeText(emails)

    userSettingsService.clearSelectedItems()
  }

  const firstGroup = userSettingsService.paginatedItems[0]?.groups?.quotas

  useEffect(() => {
    userSettingsService.addUserSettingsListeners()

    return () => {
      userSettingsService.removeUserSettingsListeners()
    }
  }, [])

  return (
    <>
      <ListHeader
        beforeIcon={<Icon20UserOutline />}
        containerId={CONTAINER_IDS.userSettingsService}
        isItemsLoading={isUsersLoading}
        isRemoveButtonDisabled={userSettingsService.isRemoveUsersButtonDisabled}
        skeletonHeight={66}
        title={t('User list')}
        actions={
          <>
            <Tooltip appearance='accent' description={t('Write an email to the user selection')}>
              <Button
                before={<Icon16MailOutline />}
                disabled={userSettingsService.isSelectedItemsEmpty}
                href='mailto:?body=*** Paste the email addresses from the clipboard! ***'
                mode='link'
                size='s'
                onClick={onWriteEmail}
              >
                {t('Contact Users')}
              </Button>
            </Tooltip>
            <Tooltip appearance='accent' description={t('Set filters for user removing')}>
              <Button
                activated={isFiltersOpen}
                before={<Icon20FilterOutline height={16} width={16} />}
                mode='tertiary'
                size='s'
                onClick={() => setIsFiltersOpen((prev) => !prev)}
              >
                {t('Remove Filters')}
              </Button>
            </Tooltip>
          </>
        }
        beforeAddButton={
          <Tooltip appearance='accent' description={t('Set groups quota for new users')}>
            <Button
              activated={isUpdateQuotaModalOpen}
              before={<Icon20GearOutline color={colorScheme === 'light' ? '#000' : '#fff'} />}
              mode='tertiary'
              size='s'
              onClick={() => setIsUpdateQuotaModalOpen(true)}
            />
          </Tooltip>
        }
        beforePagination={
          <ConditionalRender conditions={[isFiltersOpen]}>
            <Spacing size='xl' />
            <FormLayoutGroup mode='horizontal'>
              <FormItem title={t('User group ownership state')} top={t('Group Owner')}>
                <YesNoAnyRadioGroup
                  className={styles.radioGroup}
                  defaultValue={removeFilters.groupOwner}
                  name='groupOwner'
                  noDescription={t('The user is not a group owner')}
                  yesDescription={t('The user is a group owner')}
                  onChange={(data) => setRemoveFilters((prev) => ({ ...prev, groupOwner: data }))}
                />
              </FormItem>
            </FormLayoutGroup>
            <Spacing size='xl' />
            <Separator appearance='primary-alpha' />
          </ConditionalRender>
        }
        onAddItem={() => setIsCreateUserModalOpen(true)}
        onRemove={onRemove}
      >
        <UserList removeFilters={removeFilters} />
      </ListHeader>
      <UpdateGroupQuotaModal
        isOpen={isUpdateQuotaModalOpen}
        title={t('Default groups quota')}
        defaultQuota={{
          number: firstGroup?.defaultGroupsNumber || 0,
          duration: firstGroup?.defaultGroupsDuration || 0,
          repetitions: firstGroup?.defaultGroupsRepetitions || 0,
        }}
        onClose={() => setIsUpdateQuotaModalOpen(false)}
        onUpdateQuota={(data) => updateDefaultQuota(data)}
      />
      <CreateUserModal isOpen={isCreateUserModalOpen} onClose={() => setIsCreateUserModalOpen(false)} />
    </>
  )
})
