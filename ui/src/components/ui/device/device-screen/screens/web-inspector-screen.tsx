import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { useInjection } from 'inversify-react'
import { Button, Spinner } from '@vkontakte/vkui'
import { Icon24ArrowLeftOutline } from '@vkontakte/icons'
import { Decode } from 'console-feed'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { globalToast } from '@/store/global-toast'

import { Launcher } from './launcher'
import { Inspector } from './inspector'

import styles from './web-inspector-screen.module.css'

import type { ApplicationsList, ApplicationAssetsListItem } from '@/types/application.type'

type CurrentView = 'launcher' | 'inspector'

type AppState = 'idle' | 'launching' | 'running' | 'terminating' | 'killing'

export const WebInspectorScreen = observer(() => {
  const [apps, setApps] = useState<ApplicationsList>({})
  const [isLoading, setIsLoading] = useState(true)
  const [currentView, setCurrentView] = useState<CurrentView>('launcher')
  const [assetsList, setAssetsList] = useState<ApplicationAssetsListItem[]>([])
  const [launchedApp, setLaunchedApp] = useState<string | null>(null)
  const [html, setHTML] = useState<string>('')
  const [appStates, setAppStates] = useState<Record<string, AppState>>({})
  const [consoleLogs, setConsoleLogs] = useState<ReturnType<typeof Decode>[]>([])

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const applicationInstallationService = useInjection(CONTAINER_IDS.applicationInstallationService)

  const inspectorConnection = useRef<WebSocket | null>(null)

  useEffect(() => {
    const loadApps = async () => {
      try {
        setIsLoading(true)
        const appsReq = await deviceControlStore.getApps()
        const response = await appsReq.donePromise

        if (response.data === 'success' && response.content) {
          setApps(response.content)
        }
      } catch (error) {
        console.error('Failed to load apps:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadApps()
  }, [deviceControlStore])

  useEffect(() => {
    if (!inspectorConnection.current) {
      return () => {}
    }

    inspectorConnection.current.onmessage = (event) => {
      console.info('Message:', event.data)
      const data = JSON.parse(event.data)

      if (data.htmlUpdate) {
        setHTML(data.htmlUpdate)
      } else {
        setConsoleLogs((prev) => [...prev, Decode(data)])
      }
    }

    inspectorConnection.current.onerror = (error) => {
      console.error('WebSocket error', error)
    }

    return () => {
      inspectorConnection.current?.close()
    }
  }, [inspectorConnection.current])

  const loadAssetsList = async () => {
    try {
      const assetsReq = await deviceControlStore.getAppAssetList()
      const response = await assetsReq.donePromise

      if (response.data === 'success' && response.content) {
        setAssetsList(response.content.assets)
      }
    } catch (error) {
      console.error('Failed to load assets list:', error)
    }
  }

  const fetchHtmlContent = async () => {
    try {
      const htmlReq = await deviceControlStore.getAppHTML()
      const response = await htmlReq.donePromise

      if (response.data !== 'success' && !response.content) {
        throw new Error('Failed while fetch html content')
      }

      setHTML(response.content?.content || '')
    } catch (error) {
      console.error('Failed to fetch HTML content:', error)
    }
  }

  const connectInspectService = async () => {
    if (inspectorConnection.current) {
      fetchHtmlContent()

      return
    }

    const updUrlReq = await deviceControlStore.getAppInspectServerUrl()
    const updUrlResp = await updUrlReq.donePromise

    if (!updUrlResp.content) {
      throw new Error('Error while get inspector server url')
    }

    inspectorConnection.current = new WebSocket(updUrlResp.content)
  }

  const handleAppLaunch = async (pkg: string) => {
    try {
      setAppStates((prev) => ({ ...prev, [pkg]: 'launching' }))
      const ldaReq = await deviceControlStore.launchApp(pkg)
      const response = await ldaReq.donePromise

      if (response.content?.error) {
        throw new Error(response.content.error)
      }

      setLaunchedApp(pkg)
      setAppStates((prev) => ({ ...prev, [pkg]: 'running' }))
      connectInspectService()
      setCurrentView('inspector')
      loadAssetsList()
    } catch (err: unknown) {
      setAppStates((prev) => ({ ...prev, [pkg]: 'idle' }))
      globalToast.setMessage(`App Launch Error: ${(err as Error)?.message || 'Failed to launch application'}`)
      console.error('Failed to launch app:', err)
    }
  }

  const handleAppTerminate = async (pkg: string) => {
    try {
      setAppStates((prev) => ({ ...prev, [pkg]: 'terminating' }))
      const terminateReq = await deviceControlStore.terminateApp()
      const response = await terminateReq.donePromise

      if (response.content?.error) {
        throw new Error(response.content.error)
      }

      setAppStates((prev) => ({ ...prev, [pkg]: 'idle' }))
      setLaunchedApp(null)
    } catch (err: unknown) {
      setAppStates((prev) => ({ ...prev, [pkg]: 'running' }))
      globalToast.setMessage(`App Terminate Error: ${(err as Error)?.message || 'Failed to terminate application'}`)
      console.error('Failed to terminate app:', err)
    }
  }

  const handleAppKill = async (pkg: string) => {
    try {
      setAppStates((prev) => ({ ...prev, [pkg]: 'killing' }))
      const killReq = await deviceControlStore.killApp()
      const response = await killReq.donePromise

      if (response.content?.error) {
        throw new Error(response.content.error)
      }

      setAppStates((prev) => ({ ...prev, [pkg]: 'idle' }))
      setLaunchedApp(null)
    } catch (err: unknown) {
      setAppStates((prev) => ({ ...prev, [pkg]: 'running' }))
      globalToast.setMessage(`App Kill Error: ${(err as Error)?.message || 'Failed to kill application'}`)
      console.error('Failed to kill app:', err)
    }
  }

  const handleRunningAppClick = (pkg: string) => {
    if (launchedApp === pkg) {
      setCurrentView('inspector')
    }
  }

  const handleAssetDownload = async (url: string) => {
    try {
      const assetReq = await deviceControlStore.getAppAsset(url)
      const response = await assetReq.donePromise

      if (response.data === 'success' && response.content) {
        const { content, base64Encoded } = response.content
        const filename = url.split('/').pop() || 'asset'

        const blob: Blob = base64Encoded
          ? (() => {
              const binaryString = atob(content)
              const bytes = new Uint8Array(binaryString.length)

              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }

              return new Blob([bytes])
            })()
          : new Blob([content], { type: 'text/plain' })

        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      }
    } catch (error) {
      globalToast.setMessage(`Download Error: ${(error as Error)?.message || 'Failed to download asset'}`)
      console.error('Failed to download asset:', error)
    }
  }

  const handleConsoleCommand = (command: string) => {
    if (inspectorConnection.current && inspectorConnection.current.readyState === WebSocket.OPEN) {
      try {
        inspectorConnection.current.send(command)
        setConsoleLogs((prev) =>
          prev.concat([
            {
              method: 'command',
              timestamp: new Date().toISOString(),
              data: [command],
            },
          ])
        )
      } catch (error) {
        console.error('Failed to encode command:', error)
      }
    }
  }

  const handleBackToLauncher = () => {
    setCurrentView('launcher')
    setAssetsList([])
    setConsoleLogs([])
  }

  useEffect(() => {
    const app = applicationInstallationService.installedApp

    if (app.pkg && applicationInstallationService.isLaunching) {
      setAppStates((prev) => ({ ...prev, [app.pkg]: 'launching' }))
    }

    if (!applicationInstallationService.isLaunched) {
      const [pkg] = Object.entries(appStates).find(([, state]) => state === 'launching') || []

      if (!pkg) {
        return
      }

      setAppStates((prev) => ({ ...prev, [pkg]: 'idle' }))

      if (applicationInstallationService.isError) {
        globalToast.setMessage(`App Launch Error: ${applicationInstallationService.status}}`)
        console.error('Failed to launch app:', applicationInstallationService.status)
      }
    }
  }, [applicationInstallationService.isLaunching])

  useEffect(() => {
    const app = applicationInstallationService.installedApp

    if (app.pkg) {
      const exist = Object.values(apps).some((pkg) => pkg === app.pkg)

      if (!exist) {
        setApps((prev) => ({ ...prev, [app.name]: app.pkg }))
      }

      if (applicationInstallationService.isLaunched) {
        try {
          setLaunchedApp(app.pkg)
          setAppStates((prev) => ({ ...prev, [app.pkg]: 'running' }))
          connectInspectService()
          setCurrentView('inspector')
          loadAssetsList()
        } catch (err: unknown) {
          setAppStates((prev) => ({ ...prev, [app.pkg]: 'idle' }))
          globalToast.setMessage(`App Launch Error: ${(err as Error)?.message || 'Failed to launch application'}`)
          console.error('Failed to launch app:', err)
        }
      }
    }
  }, [applicationInstallationService.installedApp])

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Spinner size='l' />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {currentView === 'inspector' && (
        <div className={styles.headerContainer}>
          <Button before={<Icon24ArrowLeftOutline />} mode='tertiary' size='s' onClick={handleBackToLauncher}>
            {'Back to Applications'}
          </Button>
        </div>
      )}

      <Launcher
        apps={apps}
        appStates={appStates}
        hidden={currentView !== 'launcher'}
        launchedApp={launchedApp}
        onAppKill={handleAppKill}
        onAppLaunch={handleAppLaunch}
        onAppTerminate={handleAppTerminate}
        onRunningAppClick={handleRunningAppClick}
      />

      {currentView === 'inspector' && (
        <Inspector
          assetsList={assetsList}
          html={html}
          logs={consoleLogs}
          onAssetDownload={handleAssetDownload}
          onConsoleCommand={handleConsoleCommand}
        />
      )}
    </div>
  )
})
