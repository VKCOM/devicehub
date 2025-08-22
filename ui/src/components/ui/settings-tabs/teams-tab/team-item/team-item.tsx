import { useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'

import { ListItem } from '@/components/lib/list-item'
import { TabsPanel } from '@/components/lib/tabs-panel'
import { TeamGroupsTable } from '@/components/ui/settings-tabs/teams-tab/team-item/tabs/team-groups-table'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useRemoveTeam } from '@/lib/hooks/use-remove-team.hook'

import { TeamName } from './team-name'
import { TeamUsersTable } from './tabs/team-users-table'

import type { TabsContent } from '@/components/lib/tabs-panel'
import type { Team } from '@/generated/types'

type TeamItemProps = {
  team: Team
}

export const TeamItem = observer(({ team }: TeamItemProps) => {
  const { t } = useTranslation()
  const [selectedTab, setSelectedTab] = useState('Users')
  const { mutate: removeTeam } = useRemoveTeam()

  const teamSettingsService = useInjection(CONTAINER_IDS.teamSettingsService)

  const tabsContent = useMemo<TabsContent[]>(
    () => [
      {
        id: 'Users',
        title: t('Users'),
        ariaControls: 'tab-content-users',
        content: <TeamUsersTable />,
      },
      {
        id: 'Groups',
        title: t('Groups'),
        ariaControls: 'tab-content-groups',
        content: <TeamGroupsTable />,
      },
    ],
    [t, team]
  )

  return (
    <ListItem
      extraSubtitle={`ID: ${team.id}`}
      isNeedConfirmRemove={teamSettingsService.needConfirm}
      isSelected={teamSettingsService.isItemSelected(team.id)}
      modalDescription={t('Really delete this team')}
      subtitle={`${t('Groups')}: ${team.groups?.length || 0} - ${t('Users')}: ${team.users?.length || 0}`}
      title={<TeamName name={team.name} teamId={team.id} />}
      onIsSelectedChange={(event) => teamSettingsService.setSelectedItem(team, event.target.checked)}
      onRemove={() => {
        if (team.id) {
          removeTeam(team.id)

          teamSettingsService.setSelectedItem(team, false)
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
