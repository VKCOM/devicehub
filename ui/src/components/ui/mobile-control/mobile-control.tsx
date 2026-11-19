import { useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import { reaction } from 'mobx'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { PlatformProvider, Snackbar } from '@vkontakte/vkui'
import {
  Icon24AddSquareOutline,
  Icon24CancelOutline,
  Icon24ShareOutline,
  Icon28RotateRightOutline,
  Icon20MagnifierPlusOutline,
} from '@vkontakte/icons'

import { DeviceScreen } from '@/components/ui/device/device-screen'
import { DeviceAccessScreen } from '@/components/ui/device-access-screen'
import { ErrorFallback } from '@/components/lib/error-fallback'

import { getStreamRect } from '@/services/touch-service/edge-zones'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { deviceAccessStore } from '@/store/device-access-store'
import { useWakeLock } from '@/lib/hooks/use-wake-lock.hook'
import { useMobileViewport } from '@/lib/hooks/use-mobile-viewport.hook'
import { getMobileVkuiPlatform, isIosSafariClient, isStandaloneClient } from '@/lib/utils/mobile-platform.util'

import { ToolsSheet } from './tools-sheet'
import { MobileDialogs } from './mobile-dialogs'
import { NavigationStrip } from './navigation-strip'
import { KeyboardAccessory } from './keyboard-accessory'
import { FloatingToolsButton } from './floating-tools-button'
import { computeMobileLayout } from './mobile-layout'

import styles from './mobile-control.module.css'

import type { PointerEvent } from 'react'
import type { SheetState } from './mobile-layout'

/* NOTE: iOS Safari starts its own back gesture this close to the window edges */
const BROWSER_EDGE_SWIPE_ZONE = 20
const ROTATE_HINT_DURATION = 3000

type MobileControlProps = {
  onTakeAgain: () => void
}

const isClosingMotion = (previous: SheetState, next: SheetState) =>
  next === 'closed' || (previous === 'full' && next === 'half')

/*
 * Phone layout of the control page: the stream as large as possible, the device navigation under it,
 * and every tool of the desktop page in a sheet. The site header and page paddings are hidden.
 */
export const MobileControl = observer(({ onTakeAgain }: MobileControlProps) => {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const previousSheetRef = useRef<SheetState>('closed')
  const wasKeyboardShownRef = useRef(false)
  const [dragVisible, setDragVisible] = useState<number | null>(null)
  const [isRotateHintShown, setIsRotateHintShown] = useState(false)
  const [platform] = useState(getMobileVkuiPlatform)

  const touchService = useInjection(CONTAINER_IDS.touchService)
  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)
  const applicationInstallationService = useInjection(CONTAINER_IDS.applicationInstallationService)

  const viewport = useMobileViewport()
  const { data: device } = deviceBySerialStore.deviceQueryResult()

  const layout = computeMobileLayout({
    width: viewport.width,
    height: viewport.height,
    insets: viewport.insets,
    keyboardHeight: viewport.keyboardHeight,
    visualViewportTop: viewport.visualViewportTop,
    isStripEnabled: mobileControlStore.isStripEnabled,
    sheet: mobileControlStore.sheet,
    isKeyboardOpen: mobileControlStore.isKeyboardOpen,
    dragVisible,
  })

  const deviceName =
    (device?.platform === 'Android'
      ? `${device?.manufacturer || ''} ${device?.marketName || ''}`.trim()
      : device?.model || '') ||
    device?.serial ||
    ''
  const deviceMeta = [[device?.platform, device?.version].filter(Boolean).join(' '), device?.serial]
    .filter(Boolean)
    .join(' · ')

  // NOTE: Closing motions are quicker than opening ones
  const motion = isClosingMotion(previousSheetRef.current, mobileControlStore.sheet) ? 'out' : 'in'

  useEffect(() => {
    previousSheetRef.current = mobileControlStore.sheet
  }, [mobileControlStore.sheet])

  useWakeLock(mobileControlStore.keepScreenOn)

  /* NOTE: Edge swipes go to the exact device edge; the magnifier keeps touches on the phone */
  useEffect(() => {
    touchService.setEdgeZonesEnabled(true)

    return () => {
      touchService.setEdgeZonesEnabled(false)
      touchService.setTouchInputBlocked(false)
    }
  }, [])

  useEffect(() => {
    touchService.setTouchInputBlocked(mobileControlStore.isMagnifierOn)
  }, [mobileControlStore.isMagnifierOn])

  /* NOTE: No page scroll, rubber band or pull to refresh around the fixed layout */
  useEffect(() => {
    const { documentElement, body } = document
    const previous = [documentElement.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow]

    documentElement.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'

    return () => {
      ;[documentElement.style.overscrollBehavior, body.style.overscrollBehavior, body.style.overflow] = previous
    }
  }, [])

  /* NOTE: iOS Safari edge swipe navigates back; a cancelled touch start near the window edge blocks it */
  useEffect(() => {
    const root = rootRef.current

    if (!root) return undefined

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]

      if (!touch || !stageRef.current?.contains(event.target as Node)) return

      if (touch.clientX < BROWSER_EDGE_SWIPE_ZONE || touch.clientX > window.innerWidth - BROWSER_EDGE_SWIPE_ZONE) {
        if (event.cancelable) event.preventDefault()
      }
    }

    // NOTE: Safari before 16 has no overflow: clip, a focus or scrollIntoView inside may scroll the root
    const onScroll = () => {
      root.scrollTop = 0
      root.scrollLeft = 0
    }

    root.addEventListener('touchstart', onTouchStart, { passive: false })
    root.addEventListener('scroll', onScroll)

    return () => {
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('scroll', onScroll)
    }
  }, [])

  /* NOTE: Android system back and browser back close the keyboard, then the sheet, then ask to stop */
  useEffect(() => {
    const onPopState = () => {
      window.history.pushState({ mobileControl: true }, '')

      if (!mobileControlStore.handleBack()) mobileControlStore.setStopConfirmationOpen(true)
    }

    window.history.pushState({ mobileControl: true }, '')
    window.addEventListener('popstate', onPopState)

    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /* NOTE: The OS may hide the keyboard by itself (iOS Done, Android back), keyboard mode ends with it */
  useEffect(() => {
    const isShown = viewport.isKeyboardShown

    if (mobileControlStore.isKeyboardOpen && wasKeyboardShownRef.current && !isShown) {
      mobileControlStore.onKeyboardHiddenByOs()
    }

    wasKeyboardShownRef.current = mobileControlStore.isKeyboardOpen && isShown
  }, [viewport.isKeyboardShown, mobileControlStore.isKeyboardOpen])

  /* NOTE: A device in landscape is small on a phone in portrait */
  useEffect(
    () =>
      reaction(
        () => deviceScreenStore.isScreenRotated,
        (isRotated) => setIsRotateHintShown(isRotated && window.innerWidth < window.innerHeight)
      ),
    []
  )

  useEffect(() => {
    if (!isRotateHintShown) return undefined

    const timer = setTimeout(() => setIsRotateHintShown(false), ROTATE_HINT_DURATION)

    return () => clearTimeout(timer)
  }, [isRotateHintShown])

  useEffect(() => {
    if (layout.isLandscape) setIsRotateHintShown(false)
  }, [layout.isLandscape])

  /* NOTE: Results of a long operation arrive as a snackbar, its progress is on the tools button */
  useEffect(
    () =>
      reaction(
        () => [applicationInstallationService.isInstalled, applicationInstallationService.isError],
        ([isInstalled, isError]) => {
          if (isInstalled) mobileControlStore.showSnackbar(t('App installed'))

          if (isError) mobileControlStore.showSnackbar(t('App installation failed'))
        }
      ),
    []
  )

  useEffect(() => {
    if (isIosSafariClient() && !isStandaloneClient()) mobileControlStore.maybeShowAddToHomeScreenHintOnce()
  }, [])

  const onFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})

      return
    }

    document.documentElement.requestFullscreen?.().catch(() => {
      mobileControlStore.showSnackbar(t('Full screen is not available in this browser'))
    })
  }

  const stageWidth = Math.max(0, viewport.width - layout.stage.left - layout.stage.right)
  const stageHeight = Math.max(0, viewport.height - layout.stage.top - layout.stage.bottom)
  const streamRect = getStreamRect(
    { left: 0, top: 0, width: stageWidth, height: stageHeight },
    deviceScreenStore.getStreamAspectRatio ?? 0
  )

  const { isMagnifierOn, magnifierOffset, magnifierZoom } = mobileControlStore

  const onPanStart = (event: PointerEvent<HTMLDivElement>) => {
    panRef.current = { ...magnifierOffset, startX: event.clientX, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPanMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current

    if (!pan) return

    const limitX = stageWidth / magnifierZoom / 2
    const limitY = stageHeight / magnifierZoom / 2
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

    mobileControlStore.setMagnifierOffset({
      x: clamp(pan.x + (event.clientX - pan.startX) / magnifierZoom, limitX),
      y: clamp(pan.y + (event.clientY - pan.startY) / magnifierZoom, limitY),
    })
  }

  const isFabShown =
    !mobileControlStore.isStripEnabled &&
    !mobileControlStore.isKeyboardOpen &&
    !mobileControlStore.isSheetOpen &&
    !deviceAccessStore.state

  return (
    <PlatformProvider value={platform}>
      <div
        ref={rootRef}
        className={cn(styles.mobileControl, {
          [styles.landscape]: layout.isLandscape,
          [styles.dragging]: dragVisible !== null,
          [styles.motionOut]: motion === 'out',
        })}
      >
        <div
          ref={stageRef}
          className={styles.stage}
          style={{
            top: layout.stage.top,
            right: layout.stage.right,
            bottom: layout.stage.bottom,
            left: layout.stage.left,
          }}
        >
          <div
            className={styles.screenHost}
            style={{
              transform: isMagnifierOn
                ? `scale(${magnifierZoom}) translate(${magnifierOffset.x}px, ${magnifierOffset.y}px)`
                : undefined,
            }}
          >
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <DeviceScreen />
            </ErrorBoundary>
          </div>
          <div
            aria-hidden='true'
            className={styles.streamFrame}
            style={{ left: streamRect.left, top: streamRect.top, width: streamRect.width, height: streamRect.height }}
          >
            {(['left', 'right', 'top', 'bottom'] as const).map((edge) => (
              <i
                key={edge}
                className={cn(styles.edgeGlow, styles[edge], {
                  [styles.edgeGlowOn]: !isMagnifierOn && touchService.activeEdges.includes(edge),
                })}
              />
            ))}
          </div>
          {isMagnifierOn && (
            <div
              className={styles.panSurface}
              role='none'
              onPointerCancel={() => (panRef.current = null)}
              onPointerDown={onPanStart}
              onPointerMove={onPanMove}
              onPointerUp={() => (panRef.current = null)}
            />
          )}
          {isMagnifierOn && (
            <div className={styles.stageChip} role='status'>
              <Icon20MagnifierPlusOutline />
              {t('Magnifier on, touches stay here')}
              <button
                className={styles.chipAction}
                type='button'
                onClick={() => mobileControlStore.setMagnifierOn(false)}
              >
                {t('Turn off')}
              </button>
            </div>
          )}
          {!isMagnifierOn && isRotateHintShown && (
            <button className={styles.stageChip} type='button' onClick={() => setIsRotateHintShown(false)}>
              <Icon28RotateRightOutline height={18} width={18} />
              {t('Rotate your phone for a larger picture')}
            </button>
          )}
        </div>
        <div
          aria-hidden='true'
          className={cn(styles.scrim, { [styles.scrimOn]: layout.isScrimVisible })}
          onClick={() => mobileControlStore.setSheet('half')}
        />
        <NavigationStrip layout={layout} />
        <ToolsSheet
          deviceMeta={deviceMeta}
          deviceName={deviceName}
          layout={layout}
          onDrag={setDragVisible}
          onFullscreen={onFullscreen}
        />
        {isFabShown && <FloatingToolsButton viewport={viewport} />}
        <KeyboardAccessory layout={layout} />
        {mobileControlStore.isAddToHomeScreenHintShown && (
          <div
            className={styles.addToHomeScreen}
            role='dialog'
            style={{ bottom: (layout.isLandscape ? viewport.insets.bottom : layout.stage.bottom) + 8 }}
          >
            <span className={styles.addToHomeScreenIcon}>
              <Icon24AddSquareOutline />
            </span>
            <div>
              <b>{t('Open without the address bar')}</b>
              <p>
                {t('Tap Share in Safari, then Add to Home Screen. DeviceHub opens full screen from there.')}{' '}
                <Icon24ShareOutline className={styles.inlineIcon} height={16} width={16} />
              </p>
            </div>
            <button
              aria-label={t('Dismiss')}
              className={styles.dismissButton}
              type='button'
              onClick={() => mobileControlStore.hideAddToHomeScreenHint()}
            >
              <Icon24CancelOutline />
            </button>
          </div>
        )}
        {mobileControlStore.snackbarText && (
          <Snackbar
            key={mobileControlStore.snackbarText}
            offsetY={layout.isLandscape ? viewport.insets.bottom + 10 : layout.stage.bottom + 10}
            onClose={() => mobileControlStore.hideSnackbar()}
          >
            {mobileControlStore.snackbarText}
          </Snackbar>
        )}
        <MobileDialogs deviceName={deviceName} />
        <DeviceAccessScreen onTakeAgain={onTakeAgain} />
      </div>
    </PlatformProvider>
  )
})
