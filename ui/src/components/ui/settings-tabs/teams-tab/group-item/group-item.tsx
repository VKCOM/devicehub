import { useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Icon24CheckSquareOutline } from '@vkontakte/icons'
import { Button, Counter, Tooltip } from '@vkontakte/vkui'

import { ListItem } from '@/components/lib/list-item'
import { TabsPanel } from '@/components/lib/tabs-panel'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { isRootGroup } from '@/lib/utils/is-root-group.util'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useRemoveGroup } from '@/lib/hooks/use-remove-group.hook'
import { useUpdateGroup } from '@/lib/hooks/use-update-group.hook'

import { GroupName } from './group-name'
import { Schedule } from './tabs/schedule'
import { GroupUsersTable } from './tabs/group-users-table'
import { GroupDevicesTable } from './tabs/group-devices-table'
import { GroupConflictsTable } from './tabs/group-conflicts-table'

import styles from './group-item.module.css'

import type { MouseEvent } from 'react'
import type { TabsContent } from '@/components/lib/tabs-panel'
import type { GroupListResponseGroupsItem } from '@/generated/types'

type GroupItemProps = {
  group: GroupListResponseGroupsItem
}

export const GroupItem = observer(({ group }: GroupItemProps) => {
  const { t } = useTranslation()
  const [selectedTab, setSelectedTab] = useState('Users')
  const { mutate: removeGroup } = useRemoveGroup()
  const { mutate: updateGroup } = useUpdateGroup(group.id || '')

  const groupSettingsService = useInjection(CONTAINER_IDS.groupSettingsService)
  const { conflictsCount } = useInjection(CONTAINER_IDS.groupItemService)

  const tabsContent = useMemo<TabsContent[]>(
    () => [
      {
        id: 'Users',
        title: t('Users'),
        ariaControls: 'tab-content-users',
        content: <GroupUsersTable />,
      },
      {
        id: 'Devices',
        title: t('Devices'),
        ariaControls: 'tab-content-devices',
        content: <GroupDevicesTable />,
      },
      {
        id: 'Schedule',
        title: t('Schedule'),
        ariaControls: 'tab-content-schedule',
        content: <Schedule group={group} />,
      },
      {
        id: 'Conflicts',
        title: t('Conflicts'),
        status: (
          <ConditionalRender conditions={[conflictsCount > 0]}>
            <Counter appearance='accent-red' mode='primary' size='s'>
              {conflictsCount}
            </Counter>
          </ConditionalRender>
        ),
        ariaControls: 'tab-content-conflicts',
        content: <GroupConflictsTable />,
      },
    ],
    [t, conflictsCount, group]
  )

  const onReadyClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    updateGroup({ state: 'ready' })
  }

  return (
    <ListItem
      extraSubtitle={`ID: ${group.id} - ${t('Owner')}: ${group.owner?.name}`}
      isNeedConfirmRemove={groupSettingsService.needConfirm}
      isRemoveDisabled={isRootGroup(group.privilege)}
      isSelected={groupSettingsService.isItemSelected(group.id)}
      modalDescription={t('Really delete this group')}
      subtitle={`${t('Class')}: ${group.class} - ${t('Devices')}: ${group.devices?.length || 0} - ${t('Users')}: ${group.users?.length || 0}`}
      title={<GroupName groupId={group.id} name={group.name} />}
      indicator={
        <ConditionalRender conditions={[group.state === 'pending']}>
          <Tooltip appearance='accent' description={t('Get ready')}>
            <Button
              before={<Icon24CheckSquareOutline className={styles.readyIcon} />}
              hasHover={false}
              mode='tertiary'
              onClick={onReadyClick}
            />
          </Tooltip>
        </ConditionalRender>
      }
      onIsSelectedChange={(event) => groupSettingsService.setSelectedItem(group, event.target.checked)}
      onRemove={() => {
        if (group.id) {
          removeGroup(group.id)

          groupSettingsService.setSelectedItem(group, false)
        }
      }}
    >
      <TabsPanel
        content={tabsContent}
        mode='plain'
        selectedTabId={selectedTab}
        onChange={(tabId) => setSelectedTab(tabId)}
      />
    </ListItem>
  )
})
