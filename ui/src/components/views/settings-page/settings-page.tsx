import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Panel, View } from '@vkontakte/vkui'

import { TabsPanel } from '@/components/lib/tabs-panel'
import { GeneralTab } from '@/components/ui/settings-tabs/general-tab'
import { GroupsTab } from '@/components/ui/settings-tabs/groups-tab'
import { TeamsTab } from '@/components/ui/settings-tabs/teams-tab'
import { KeysTab } from '@/components/ui/settings-tabs/keys-tab'
import { DevicesTab } from '@/components/ui/settings-tabs/devices-tab'
import { ShellTab } from '@/components/ui/settings-tabs/shell-tab'
import { UsersTab } from '@/components/ui/settings-tabs/users-tab'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import {
  getSettingsDevicesRoute,
  getSettingsGroupsRoute,
  getSettingsTeamsRoute,
  getSettingsKeysRoute,
  getSettingsRoute,
  getSettingsShellRoute,
  getSettingsUsersRoute,
} from '@/constants/route-paths'

import styles from './settings-page.module.css'

import type { TabsContent } from '@/components/lib/tabs-panel'

export const SettingsPage = observer(() => {
  const { t } = useTranslation()

  const { isAdmin } = useInjection(CONTAINER_IDS.currentUserProfileStore)

  const tabsContent = useMemo<TabsContent[]>(
    () => [
      {
        id: getSettingsRoute(),
        title: t('General'),
        ariaControls: 'tab-content-general',
        content: <GeneralTab />,
      },
      {
        id: getSettingsKeysRoute(),
        title: t('Keys'),
        ariaControls: 'tab-content-keys',
        content: <KeysTab />,
      },
      {
        id: getSettingsGroupsRoute(),
        title: t('Groups'),
        ariaControls: 'tab-content-groups',
        content: <GroupsTab />,
      },
      {
        id: getSettingsTeamsRoute(),
        title: t('Teams'),
        ariaControls: 'tab-content-teams',
        disabled: !isAdmin,
        content: <TeamsTab />,
      },
      {
        id: getSettingsDevicesRoute(),
        title: t('Devices'),
        ariaControls: 'tab-content-devices',
        disabled: !isAdmin,
        content: <DevicesTab />,
      },
      {
        id: getSettingsUsersRoute(),
        title: t('Users'),
        ariaControls: 'tab-content-users',
        disabled: !isAdmin,
        content: <UsersTab />,
      },
      {
        id: getSettingsShellRoute(),
        title: t('Shell'),
        ariaControls: 'tab-content-shell',
        disabled: !isAdmin,
        content: <ShellTab />,
      },
    ],
    [t, isAdmin]
  )

  return (
    <View activePanel='settings'>
      <Panel className={styles.settingsPageWrapper} id='settings'>
        <TabsPanel content={tabsContent} routeSync />
      </Panel>
    </View>
  )
})
