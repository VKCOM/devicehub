import { observer } from 'mobx-react-lite'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenList, type ScreenListItem } from '../screen-list'

import styles from './launcher.module.css'

import type { ApplicationsList } from '@/types/application.type'

type AppState = 'idle' | 'launching' | 'running' | 'terminating' | 'killing'

export interface LauncherProps {
  apps: ApplicationsList
  appStates: Record<string, AppState>
  launchedApp: string | null
  onAppLaunch: (pkg: string) => Promise<void>
  onAppTerminate: (pkg: string) => Promise<void>
  onAppKill: (pkg: string) => Promise<void>
  onRunningAppClick: (pkg: string) => void
  hidden?: boolean
}

export const Launcher = observer<LauncherProps>(
  ({ apps, appStates, launchedApp, onAppLaunch, onAppTerminate, onAppKill, onRunningAppClick, hidden }) => {
    const { t } = useTranslation()
    const [searchQuery, setSearchQuery] = useState('')

    const appItems = useMemo(
      (): ScreenListItem[] =>
        Object.entries(apps).map(([name, pkg]) => ({
          id: pkg,
          name,
          subtitle: pkg,
          data: { packageName: pkg },
        })),
      [apps]
    )

    const handleItemClick = async (item: ScreenListItem) => {
      const pkg = (item.data as { packageName: string })?.packageName
      const appState = appStates[pkg] || 'idle'

      if (appState === 'running') {
        onRunningAppClick(pkg)

        return
      }

      if (appState === 'idle') {
        await onAppLaunch(pkg)
      }
    }

    const handleTerminate = async (pkg: string) => {
      await onAppTerminate(pkg)
    }

    const handleKill = async (pkg: string) => {
      await onAppKill(pkg)
    }

    const renderAppItem = (item: ScreenListItem) => {
      const pkg = (item.data as { packageName: string })?.packageName
      const appState = appStates[pkg] || 'idle'
      const isRunning = launchedApp === pkg

      const getButtonText = () => {
        switch (appState) {
          case 'launching':
            return t('Launching...')
          case 'running':
            return t('Running')
          case 'terminating':
            return t('Terminating...')
          case 'killing':
            return t('Killing...')
          default:
            return t('Launch')
        }
      }

      const getButtonClass = () => {
        switch (appState) {
          case 'running':
            return styles.runningButton
          case 'terminating':
          case 'killing':
            return styles.terminatingButton
          default:
            return styles.launchButton
        }
      }

      const getSecondaryButton = () => {
        if (isRunning && appState === 'running') {
          return (
            <button
              className={styles.terminateButton}
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                handleTerminate(pkg)
              }}
            >
              {t('Terminate')}
            </button>
          )
        }

        if (isRunning && appState === 'terminating') {
          return (
            <button
              className={styles.killButton}
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                handleKill(pkg)
              }}
            >
              {'Kill'}
            </button>
          )
        }

        return null
      }

      return (
        <div
          key={item.id}
          className={styles.appItem}
          role='button'
          tabIndex={0}
          onClick={() => handleItemClick(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleItemClick(item)
            }
          }}
        >
          <div className={styles.appInfo}>
            <div className={styles.appName}>{item.name}</div>
            <div className={styles.appPackage}>{item.subtitle}</div>
          </div>
          <div className={styles.buttonContainer}>
            <button
              className={getButtonClass()}
              disabled={appState === 'launching' || appState === 'terminating' || appState === 'killing'}
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                handleItemClick(item)
              }}
            >
              {getButtonText()}
            </button>
            {getSecondaryButton()}
          </div>
        </div>
      )
    }

    return (
      <ScreenList
        emptyStateSubtitle={t('Applications will appear here when available')}
        emptyStateTitle={t('No applications available')}
        hidden={hidden}
        items={appItems}
        placeholder={t('Search applications...')}
        renderItem={renderAppItem}
        searchQuery={searchQuery}
        onItemClick={handleItemClick}
        onSearchChange={setSearchQuery}
      />
    )
  }
)
