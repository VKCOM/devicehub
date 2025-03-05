import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Button, ButtonGroup } from '@vkontakte/vkui'
import { Icon20GearOutline, Icon24CancelCircleOutline, Icon24CrownOutline } from '@vkontakte/icons'

import { ListItem } from '@/components/lib/list-item'
import { WarningModal, UpdateGroupQuotaModal } from '@/components/ui/modals'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useRemoveUser } from '@/lib/hooks/use-remove-user.hook'
import { useGrantAdmin } from '@/lib/hooks/use-grant-admin.hook'
import { useRevokeAdmin } from '@/lib/hooks/use-revoke-admin.hook'
import { useUpdateUserGroupQuota } from '@/lib/hooks/use-update-user-group-quota.hook'

import type { DeleteUsersParams } from '@/generated/types'
import type { SettingsUser } from '@/types/settings-user.type'

type UserItemProps = {
  user: SettingsUser
  removeFilters: DeleteUsersParams
}

export const UserItem = observer(({ user, removeFilters }: UserItemProps) => {
  const { t } = useTranslation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRevokeConfirmationOpen, setIsRevokeConfirmationOpen] = useState(false)
  const [isGrantConfirmationOpen, setIsGrantConfirmationOpen] = useState(false)
  const { mutate: removeUser } = useRemoveUser()
  const { mutate: grantAdmin } = useGrantAdmin()
  const { mutate: revokeAdmin } = useRevokeAdmin()
  const { mutate: updateGroupQuota } = useUpdateUserGroupQuota()

  const userSettingsService = useInjection(CONTAINER_IDS.userSettingsService)

  const onRemove = () => {
    removeUser({ email: user.email || '', ...removeFilters })

    userSettingsService.setSelectedItem(user, false)
  }

  const quotas = user.groups?.quotas

  return (
    <>
      <ListItem
        extraSubtitle={`${t('Email')}: ${user.email} - ${t('Privilege')}: ${user.privilege}`}
        href={`mailto:${user.email}`}
        isNeedConfirmRemove={userSettingsService.needConfirm}
        isOpenable={false}
        isRemoveDisabled={user.privilege === 'admin'}
        isSelected={userSettingsService.isItemSelected(user.email)}
        modalDescription={t('Really delete this user')}
        title={`${user.name}`}
        after={
          <Button before={<Icon20GearOutline />} mode='tertiary' size='s' onClick={() => setIsModalOpen(true)}>
            {t('Group Quota')}
          </Button>
        }
        indicator={
          <ButtonGroup gap='s'>
            <Button
              before={<Icon24CrownOutline height={20} width={20} />}
              disabled={user.privilege === 'admin'}
              mode='tertiary'
              size='s'
              onClick={() => setIsGrantConfirmationOpen(true)}
            >
              {t('Grant admin')}
            </Button>
            <Button
              before={<Icon24CancelCircleOutline height={20} width={20} />}
              disabled={user.privilege !== 'admin'}
              mode='tertiary'
              size='s'
              onClick={() => setIsRevokeConfirmationOpen(true)}
            >
              {t('Revoke admin')}
            </Button>
          </ButtonGroup>
        }
        onIsSelectedChange={(event) => userSettingsService.setSelectedItem(user, event.target.checked)}
        onRemove={onRemove}
      />
      <WarningModal
        description={t('Really grant access to user')}
        isOpen={isGrantConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsGrantConfirmationOpen(false)}
        onOk={async () => {
          if (user.email) {
            grantAdmin(user.email)
          }
        }}
      />
      <WarningModal
        description={t('Really revoke access of this user')}
        isOpen={isRevokeConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsRevokeConfirmationOpen(false)}
        onOk={async () => {
          if (user.email) {
            revokeAdmin(user.email)
          }
        }}
      />
      <UpdateGroupQuotaModal
        isOpen={isModalOpen}
        title={t('User group quota')}
        defaultQuota={{
          number: quotas?.allocated?.number || 0,
          duration: quotas?.allocated?.duration || 0,
          repetitions: quotas?.repetitions || 0,
        }}
        onClose={() => setIsModalOpen(false)}
        onUpdateQuota={(data) => updateGroupQuota({ email: user.email || '', ...data })}
      />
    </>
  )
})
