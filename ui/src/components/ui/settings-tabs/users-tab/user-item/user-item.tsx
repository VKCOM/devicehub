import { useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Button, ButtonGroup } from '@vkontakte/vkui'
import { Icon24CancelCircleOutline, Icon24CrownOutline } from '@vkontakte/icons'

import { ListItem } from '@/components/lib/list-item'
import { WarningModal } from '@/components/ui/modals'
import { TabsPanel } from '@/components/lib/tabs-panel'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useRemoveUser } from '@/lib/hooks/use-remove-user.hook'
import { useGrantAdmin } from '@/lib/hooks/use-grant-admin.hook'
import { useRevokeAdmin } from '@/lib/hooks/use-revoke-admin.hook'
import { useUpdateUserGroupQuota } from '@/lib/hooks/use-update-user-group-quota.hook'

import { TokensTab, GroupsTab, QuotaTab } from '../user-tabs'

import type { DeleteUsersParams } from '@/generated/types'
import type { SettingsUser } from '@/types/settings-user.type'
import type { TabsContent } from '@/components/lib/tabs-panel'

type UserItemProps = {
  user: SettingsUser
  removeFilters: DeleteUsersParams
}

export const UserItem = observer(({ user, removeFilters }: UserItemProps) => {
  if (!user.email) {
    return <div />
  }

  const { t } = useTranslation()
  const [isRevokeConfirmationOpen, setIsRevokeConfirmationOpen] = useState(false)
  const [isGrantConfirmationOpen, setIsGrantConfirmationOpen] = useState(false)
  const { mutate: removeUser } = useRemoveUser()
  const { mutate: grantAdmin } = useGrantAdmin()
  const { mutate: revokeAdmin } = useRevokeAdmin()
  const { mutate: updateGroupQuota } = useUpdateUserGroupQuota()

  const userSettingsService = useInjection(CONTAINER_IDS.userSettingsService)
  const accessTokenService = useInjection(CONTAINER_IDS.accessTokenService)

  const onRemove = () => {
    removeUser({ email: user.email || '', ...removeFilters })

    userSettingsService.setSelectedItem(user, false)
  }

  const tokensQueryResult = accessTokenService.getUserAccessTokens(user.email)

  const onTokenRemove = (title: string) => {
    accessTokenService.setTokenToRemove(title)
    accessTokenService.removeAccessToken(user.email || '')
  }

  const tabsContent = useMemo<TabsContent[]>(
    () => [
      {
        id: 'AccessTokens',
        title: t('Access Tokens'),
        ariaControls: 'tab-content-tokens',
        content: (
          <TokensTab
            isLoading={tokensQueryResult?.isLoading}
            tokens={tokensQueryResult?.data || []}
            onRemove={onTokenRemove}
          />
        ),
      },
      {
        id: 'Groups',
        title: t('Groups'),
        ariaControls: 'tab-content-groups',
        content: <GroupsTab email={user.email || ''} />,
      },
      {
        id: 'GroupQuota',
        title: t('Group Quota'),
        ariaControls: 'tab-content-group-quota',
        content: (
          <QuotaTab
            quotas={user.groups?.quotas}
            onUpdate={(data) => updateGroupQuota({ email: user.email || '', ...data })}
          />
        ),
      },
    ],
    [t, user, tokensQueryResult]
  )
  const [tabId, setTabId] = useState(tabsContent[0].id)

  const listItemIndicator = (
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
  )

  return (
    <>
      <ListItem
        extraSubtitle={`${t('Email')}: ${user.email} - ${t('Privilege')}: ${user.privilege}`}
        href={`mailto:${user.email}`}
        indicator={listItemIndicator}
        isNeedConfirmRemove={userSettingsService.needConfirm}
        isOpenable={true}
        isRemoveDisabled={user.privilege === 'admin'}
        isSelected={userSettingsService.isItemSelected(user.email)}
        modalDescription={t('Really delete this user')}
        title={`${user.name}`}
        onIsSelectedChange={(event) => userSettingsService.setSelectedItem(user, event.target.checked)}
        onRemove={onRemove}
      >
        <TabsPanel content={tabsContent} mode='plain' selectedTabId={tabId} onChange={(id) => setTabId(id)} />
      </ListItem>
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
    </>
  )
})
