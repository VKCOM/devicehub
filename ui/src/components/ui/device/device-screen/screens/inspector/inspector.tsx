import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsItem, Spinner, Input } from '@vkontakte/vkui'
import Split from 'react-split'
import { Console } from 'console-feed'

import { DOMTabContent } from './tabs/dom-tab'
import { AssetsTabContent } from './tabs/assets-tab'

import styles from './inspector.module.css'

import type { Decode } from 'console-feed'
import type { ApplicationAssetsListItem } from '@/types/application.type'

export type InspectorTab = 'dom' | 'assets' | 'console'

export interface InspectorProps {
  activeTab?: InspectorTab
  onTabChange?: (tab: InspectorTab) => void
  assetsList?: ApplicationAssetsListItem[]
  onAssetDownload?: (url: string) => void
  html: string
  logs?: ReturnType<typeof Decode>[]
  onConsoleCommand?: (command: string) => void
}

export const Inspector = observer<InspectorProps>(
  ({
    activeTab = 'dom',
    onTabChange,
    assetsList = [],
    onAssetDownload,
    html,
    logs = [] as Array<{ id: string; data?: unknown[]; method: string; timestamp?: string }>,
    onConsoleCommand,
  }) => {
    const { t } = useTranslation()
    const [selectedTab, setSelectedTab] = useState<InspectorTab>(activeTab)
    const [consoleActive, setConsoleActive] = useState(false)
    const [consoleInput, setConsoleInput] = useState('')

    const handleTabChange = (tab: InspectorTab) => {
      setSelectedTab(tab)
      onTabChange?.(tab)

      if (tab === 'console') {
        setConsoleActive(true)
      }
    }

    const handleConsoleToggle = () => {
      const newConsoleActive = !consoleActive
      setConsoleActive(newConsoleActive)
    }

    const renderTabContent = () => {
      switch (selectedTab) {
        case 'dom':
          return (
            <div className={styles.tabContent}>
              {!html ? (
                <div className={styles.loadingState}>
                  <Spinner size='l' />
                  <div className={styles.loadingText}>{t('Loading HTML content...')}</div>
                </div>
              ) : (
                <DOMTabContent htmlContent={html} />
              )}
            </div>
          )
        case 'assets':
          return (
            <div className={styles.tabContent}>
              <AssetsTabContent assetsList={assetsList} onAssetDownload={onAssetDownload || (() => {})} />
            </div>
          )
        default:
          return null
      }
    }

    const renderMainContent = () => <div className={styles.content}>{renderTabContent()}</div>

    const handleConsoleKeyPress = (e: React.KeyboardEvent) => {
      if (onConsoleCommand && e.key === 'Enter' && consoleInput.trim()) {
        onConsoleCommand(consoleInput)
        setConsoleInput('')
      }
    }

    const renderConsolePanel = () => (
      <div className={styles.consolePanel}>
        <div className={styles.consoleFeed}>
          <Console logs={logs as never} variant='dark' />
        </div>
        <div className={styles.consoleInput}>
          <Input
            placeholder='Enter command...'
            value={consoleInput}
            onChange={(e) => setConsoleInput(e.target.value)}
            onKeyPress={handleConsoleKeyPress}
          />
        </div>
      </div>
    )

    const renderTabsContainer = () => (
      <div className={styles.tabsContainer}>
        <Tabs>
          <TabsItem selected={selectedTab === 'dom'} onClick={() => handleTabChange('dom')}>
            {'DOM'}
          </TabsItem>
          <TabsItem selected={selectedTab === 'assets'} onClick={() => handleTabChange('assets')}>
            {'Assets'}
          </TabsItem>
          <TabsItem
            className={consoleActive ? styles.consoleTabActive : ''}
            selected={consoleActive}
            onClick={handleConsoleToggle}
          >
            {'Console'}
          </TabsItem>
        </Tabs>
        {consoleActive && renderConsolePanel()}
      </div>
    )

    return (
      <div className={styles.container}>
        {consoleActive ? (
          <Split
            className={styles.splitContainer}
            direction='vertical'
            gutterSize={3}
            minSize={[80, 150]}
            sizes={[70, 30]}
          >
            {renderMainContent()}
            {renderTabsContainer()}
          </Split>
        ) : (
          <>
            {renderMainContent()}
            {renderTabsContainer()}
          </>
        )}
      </div>
    )
  }
)
