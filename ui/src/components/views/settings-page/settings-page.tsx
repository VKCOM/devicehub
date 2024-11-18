import { Div, Group, Panel, PanelHeader, Tabs, TabsItem, View } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { ConditionalRender } from '@/components/lib/conditional-render'

import {
  getSettingsDevicesRoute,
  getSettingsGroupsRoute,
  getSettingsKeysRoute,
  getSettingsRoute,
  getSettingsShellRoute,
  getSettingsUsersRoute,
} from '@/constants/route-paths'

import { GeneralSettingsTab } from './tabs/general-settings-tab'

import styles from './settings-page.module.css'

import type { ReactNode } from 'react'

type TabsContent = {
  id: string
  title: string
  ariaControls: string
  selectedId: string
  content: ReactNode
}

const TABS_CONTENT: TabsContent[] = [
  {
    id: 'tab-general',
    title: 'General',
    ariaControls: 'tab-content-general',
    selectedId: getSettingsRoute(),
    content: <GeneralSettingsTab />,
  },
  {
    id: 'tab-keys',
    title: 'Keys',
    ariaControls: 'tab-content-keys',
    selectedId: getSettingsKeysRoute(),
    content: <Div />,
  },
  {
    id: 'tab-groups',
    title: 'Groups',
    ariaControls: 'tab-content-groups',
    selectedId: getSettingsGroupsRoute(),
    content: <Div />,
  },
  {
    id: 'tab-devices',
    title: 'Devices',
    ariaControls: 'tab-content-devices',
    selectedId: getSettingsDevicesRoute(),
    content: <Div />,
  },
  {
    id: 'tab-users',
    title: 'Users',
    ariaControls: 'tab-content-users',
    selectedId: getSettingsUsersRoute(),
    content: <Div />,
  },
  {
    id: 'tab-shell',
    title: 'Shell',
    ariaControls: 'tab-content-shell',
    selectedId: getSettingsShellRoute(),
    content: <Div />,
  },
]

export const SettingsPage = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <View activePanel='main'>
      <Panel id='main'>
        <PanelHeader className={styles.settingsPageWrapper}>
          <Tabs>
            {TABS_CONTENT.map((tab) => (
              <TabsItem
                key={tab.id}
                aria-controls={tab.ariaControls}
                id={tab.id}
                selected={tab.selectedId === pathname}
                onClick={() => {
                  navigate(tab.selectedId)
                }}
              >
                {t(tab.title)}
              </TabsItem>
            ))}
          </Tabs>
        </PanelHeader>
        {TABS_CONTENT.map((tab) => (
          <ConditionalRender key={tab.id} conditions={[tab.selectedId === pathname]}>
            <Group aria-labelledby={tab.id} id={tab.ariaControls} role='tabpanel'>
              {tab.content}
            </Group>
          </ConditionalRender>
        ))}
      </Panel>
    </View>
  )
}
