import { useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ToolsBadge } from './tools-badge'

import styles from './mobile-control.module.css'

import type { PointerEvent } from 'react'
import type { MobileViewport } from '@/lib/hooks/use-mobile-viewport.hook'

const SIZE = 48
const EDGE_GAP = 10
const DRAG_THRESHOLD = 8
const IDLE_DELAY = 3000

type FloatingToolsButtonProps = {
  viewport: MobileViewport
}

type Drag = { startX: number; startY: number; x: number; y: number; isMoved: boolean }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/* Opens the tools when the navigation strip is off; snaps to the left or right edge where it is dropped */
export const FloatingToolsButton = observer(({ viewport }: FloatingToolsButtonProps) => {
  const { t } = useTranslation()
  const dragRef = useRef<Drag | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [isIdle, setIsIdle] = useState(false)

  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)

  const { width, height, insets } = viewport
  const { side, y: relativeY } = mobileControlStore.fabPosition
  const x = side === 'left' ? insets.left + EDGE_GAP : width - insets.right - EDGE_GAP - SIZE
  const y = clamp(relativeY * height, insets.top + EDGE_GAP, height - insets.bottom - SIZE - EDGE_GAP)

  const wake = () => setIsIdle(false)

  useEffect(() => {
    if (isIdle) return undefined

    const timer = setTimeout(() => setIsIdle(true), IDLE_DELAY)

    return () => clearTimeout(timer)
  }, [isIdle, side, relativeY])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startX: event.clientX, startY: event.clientY, x, y, isMoved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    wake()
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current

    if (!drag) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY

    if (!drag.isMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.isMoved = true

    if (drag.isMoved) setDragOffset({ x: drag.x + dx, y: drag.y + dy })
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current

    dragRef.current = null
    setDragOffset(null)

    if (!drag) return

    if (!drag.isMoved) {
      mobileControlStore.setSheet('half')

      return
    }

    const centerX = drag.x + event.clientX - drag.startX + SIZE / 2
    const top = drag.y + event.clientY - drag.startY

    mobileControlStore.setFabPosition({
      side: centerX < width / 2 ? 'left' : 'right',
      y: clamp(top / height, 0, 1),
    })
  }

  const position = dragOffset ?? { x, y }

  return (
    <button
      aria-label={t('Tools')}
      className={cn(styles.fab, { [styles.fabDragging]: !!dragOffset, [styles.fabIdle]: isIdle && !dragOffset })}
      style={{ transform: `translate(${position.x}px, ${position.y}px)${dragOffset ? ' scale(1.08)' : ''}` }}
      type='button'
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null
        setDragOffset(null)
      }}
    >
      <ToolsBadge />
    </button>
  )
})
