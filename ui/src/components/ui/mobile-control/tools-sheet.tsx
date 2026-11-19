import { useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router'
import { HorizontalScroll, Tabs, TabsItem } from '@vkontakte/vkui'
import {
  Icon24CancelCircleOutline,
  Icon24CancelOutline,
  Icon24ChevronDown,
  Icon24ChevronRight,
  Icon24Fullscreen,
  Icon24FullscreenExit,
  Icon24GearOutline,
  Icon24NotificationOutline,
} from '@vkontakte/icons'

import { InfoTab } from '@/components/ui/device-control-panel/tabs/info-tab'
import { LogsTab } from '@/components/ui/device-control-panel/tabs/logs-tab'
import { AdvancedTab } from '@/components/ui/device-control-panel/tabs/advanced-tab'
import { DashboardTab } from '@/components/ui/device-control-panel/tabs/dashboard-tab'
import { FileExplorerTab } from '@/components/ui/device-control-panel/tabs/file-explorer-tab'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { isSamePath } from '@/lib/utils/is-same-path.util'
import { isFullscreenAvailable } from '@/lib/utils/mobile-platform.util'

import {
  getControlRoute,
  getControlLogsRoute,
  getControlInfoRoute,
  getControlAdvancedRoute,
  getControlFileExplorerRoute,
} from '@/constants/route-paths'

import { QuickActions } from './quick-actions'
import { ViewSettings } from './view-settings'
import { resolveSheetSnap } from './mobile-layout'

import styles from './tools-sheet.module.css'

import type { PointerEvent, ReactNode } from 'react'
import type { MobileLayout } from './mobile-layout'

/* NOTE: Overscroll past the end of the half sheet content that opens the sheet fully */
const EXPAND_DISTANCE = 48
const EXPAND_FLING_VELOCITY = -0.3

type ToolsSheetProps = {
  layout: MobileLayout
  deviceName: string
  deviceMeta: string
  onDrag: (visible: number | null) => void
  onFullscreen: () => void
}

type Drag = { startY: number; startVisible: number; visible: number; lastY: number; lastTime: number; velocity: number }

/*
 * Tools of the device: non-modal at 40% of the height so the stream stays usable above it,
 * modal when dragged to full height. In landscape it is a side panel on the right.
 */
export const ToolsSheet = observer(({ layout, deviceName, deviceMeta, onDrag, onFullscreen }: ToolsSheetProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { serial = '', provider } = useParams()
  const dragRef = useRef<Drag | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement)

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)

    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const settingsService = useInjection(CONTAINER_IDS.settingsService)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)

  // NOTE: The routes are the desktop ones, the order and the shorter titles are for a phone
  const tabs: { id: string; title: string; content: ReactNode }[] = [
    { id: getControlInfoRoute(serial, provider), title: t('Info'), content: <InfoTab /> },
    { id: getControlRoute(serial, provider), title: t('Main'), content: <DashboardTab /> },
    { id: getControlLogsRoute(serial, provider), title: t('Logs'), content: <LogsTab /> },
    { id: getControlFileExplorerRoute(serial, provider), title: t('Files'), content: <FileExplorerTab /> },
    { id: getControlAdvancedRoute(serial, provider), title: t('More actions'), content: <AdvancedTab /> },
  ]
  // NOTE: Main is the tab of the first open, its route is the control page itself
  const mainTab = tabs[1]
  const selectedTab = tabs.find((tab) => isSamePath(tab.id, pathname)) ?? mainTab
  const isSettings = mobileControlStore.sheetPage === 'settings'
  const isAlertShown = settingsService.isAlertMessageActive && !mobileControlStore.isAlertDismissed

  const onTabClick = (id: string) => {
    navigate(id, { replace: true })

    // NOTE: A log needs the height, at 40% only a few lines fit
    if (id === getControlLogsRoute(serial, provider)) mobileControlStore.setSheet('full')
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (layout.isLandscape || (event.target as HTMLElement).closest('button')) return

    const visible = mobileControlStore.sheet === 'full' ? layout.sheetMax : layout.sheetHalf

    dragRef.current = {
      startY: event.clientY,
      startVisible: visible,
      visible,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocity: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    onDrag(visible)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current

    if (!drag) return

    const now = performance.now()

    drag.visible = Math.min(Math.max(drag.startVisible - (event.clientY - drag.startY), 0), layout.sheetMax)
    drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastTime)
    drag.lastY = event.clientY
    drag.lastTime = now
    onDrag(drag.visible)
  }

  /* NOTE: The selected tab may be out of the scrolled row, e.g. after a reload on Files or More actions */
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const selected = tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    let scroller = selected?.parentElement ?? null

    // The scrolled row is the closest ancestor that scrolls sideways
    while (scroller && scroller !== tabsRef.current && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowX)) {
      scroller = scroller.parentElement
    }

    if (!selected || !scroller) return

    const selectedRect = selected.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()

    if (selectedRect.left < scrollerRect.left || selectedRect.right > scrollerRect.right) {
      scroller.scrollLeft += selectedRect.left - scrollerRect.left - (scrollerRect.width - selectedRect.width) / 2
    }
  }, [selectedTab.id, isSettings])

  /*
   * NOTE: In the half sheet a swipe up that goes on past the end of the content opens the sheet
   * fully: the sheet follows the finger from that point, so nothing jumps. Native listeners,
   * because React touch listeners are passive and the content must stop scrolling meanwhile.
   */
  const bodyRef = useRef<HTMLDivElement>(null)
  const sheetStateRef = useRef({ sheet: mobileControlStore.sheet, layout, onDrag })

  sheetStateRef.current = { sheet: mobileControlStore.sheet, layout, onDrag }

  useEffect(() => {
    const body = bodyRef.current

    if (!body) return undefined

    let startY = 0
    let anchorY: number | null = null
    let visible = 0
    let lastY = 0
    let lastTime = 0
    let velocity = 0

    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0].clientY
      anchorY = null
    }

    const onTouchMove = (event: TouchEvent) => {
      const { sheet, layout: current } = sheetStateRef.current
      const y = event.touches[0].clientY

      if (sheet !== 'half' || current.isLandscape || event.touches.length > 1) return

      if (anchorY === null) {
        const isAtEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 1

        if (!isAtEnd || y >= startY) return

        anchorY = y
        lastY = y
        lastTime = performance.now()
      }

      event.preventDefault()

      const now = performance.now()

      visible = Math.min(Math.max(current.sheetHalf + (anchorY - y), current.sheetHalf), current.sheetMax)
      velocity = (y - lastY) / Math.max(1, now - lastTime)
      lastY = y
      lastTime = now
      sheetStateRef.current.onDrag(visible)
    }

    const onTouchEnd = () => {
      if (anchorY === null) return

      const { layout: current } = sheetStateRef.current

      anchorY = null
      sheetStateRef.current.onDrag(null)
      // NOTE: Eager on purpose: a short pull or an upward flick is enough, a pull back down cancels
      mobileControlStore.setSheet(
        velocity < EXPAND_FLING_VELOCITY || visible - current.sheetHalf > EXPAND_DISTANCE ? 'full' : 'half'
      )
    }

    const options: AddEventListenerOptions = { passive: false }

    body.addEventListener('touchstart', onTouchStart, options)
    body.addEventListener('touchmove', onTouchMove, options)
    body.addEventListener('touchend', onTouchEnd)
    body.addEventListener('touchcancel', onTouchEnd)

    return () => {
      body.removeEventListener('touchstart', onTouchStart, options)
      body.removeEventListener('touchmove', onTouchMove, options)
      body.removeEventListener('touchend', onTouchEnd)
      body.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  const onPointerEnd = () => {
    const drag = dragRef.current

    if (!drag) return

    dragRef.current = null
    onDrag(null)
    mobileControlStore.setSheet(
      resolveSheetSnap({
        visible: drag.visible,
        velocity: drag.velocity,
        half: layout.sheetHalf,
        max: layout.sheetMax,
      })
    )
  }

  return (
    <section
      aria-hidden={!mobileControlStore.isSheetOpen}
      aria-label={t('Tools')}
      className={cn(styles.sheet, { [styles.sideSheet]: layout.isLandscape })}
      style={{
        bottom: layout.sheet.bottom,
        right: layout.sheet.right,
        width: layout.sheet.width ?? undefined,
        height: layout.sheet.height ?? undefined,
        transform: layout.sheet.transform,
        paddingBottom: layout.sheet.paddingBottom,
      }}
    >
      <div
        className={styles.sheetHead}
        role='none'
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
      >
        <div className={styles.grabber}>
          <i />
        </div>
        <div className={styles.headRow}>
          <div className={styles.deviceTitle}>
            <b>{deviceName}</b>
            <small>{deviceMeta}</small>
          </div>
          {isFullscreenAvailable() && (
            <button
              aria-label={isFullscreen ? t('Exit full screen') : t('Full screen')}
              aria-pressed={isFullscreen}
              className={styles.iconButton}
              type='button'
              onClick={onFullscreen}
            >
              {isFullscreen ? <Icon24FullscreenExit /> : <Icon24Fullscreen />}
            </button>
          )}
          <button
            aria-label={t('View settings')}
            aria-pressed={isSettings}
            className={cn(styles.iconButton, styles.mutedButton, { [styles.pressedButton]: isSettings })}
            type='button'
            onClick={() => mobileControlStore.toggleSettings()}
          >
            <Icon24GearOutline />
          </button>
          <button
            aria-label={t('Stop Using')}
            className={cn(styles.iconButton, styles.destructiveButton)}
            type='button'
            onClick={() => mobileControlStore.setStopConfirmationOpen(true)}
          >
            <Icon24CancelCircleOutline />
          </button>
          <button
            aria-label={t('Close tools')}
            className={cn(styles.iconButton, styles.mutedButton)}
            type='button'
            onClick={() => mobileControlStore.setSheet('closed')}
          >
            {layout.isLandscape ? <Icon24ChevronRight /> : <Icon24ChevronDown />}
          </button>
        </div>
      </div>
      <QuickActions />
      {!isSettings && (
        <Tabs
          className={styles.tabs}
          getRootRef={tabsRef}
          layoutFillMode='shrinked'
          mode='default'
          withScrollToSelectedTab
        >
          {/* NOTE: Tabs do not scroll by themselves, five titles are wider than a phone */}
          <HorizontalScroll className={styles.tabsScroll} showArrows={false}>
            {tabs.map((tab) => (
              <TabsItem
                key={tab.id}
                id={tab.id}
                selected={tab.id === selectedTab.id}
                onClick={() => onTabClick(tab.id)}
              >
                {tab.title}
              </TabsItem>
            ))}
          </HorizontalScroll>
        </Tabs>
      )}
      <div ref={bodyRef} className={styles.sheetBody}>
        {isAlertShown && !isSettings && (
          <div className={styles.alertBanner} role='status'>
            <Icon24NotificationOutline className={styles.alertIcon} />
            <span>{settingsService.alertMessage.data}</span>
            <button
              aria-label={t('Dismiss')}
              className={cn(styles.iconButton, styles.mutedButton)}
              type='button'
              onClick={() => mobileControlStore.dismissAlert()}
            >
              <Icon24CancelOutline />
            </button>
          </div>
        )}
        {isSettings ? (
          <ViewSettings deviceName={deviceName} />
        ) : (
          <div key={selectedTab.id} className={styles.tabContent} role='tabpanel'>
            {selectedTab.content}
          </div>
        )}
      </div>
    </section>
  )
})
