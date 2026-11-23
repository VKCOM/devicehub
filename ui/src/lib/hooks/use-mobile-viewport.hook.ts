import { useEffect, useState } from 'react'

import { KEYBOARD_MIN_HEIGHT } from '@/components/ui/mobile-control/mobile-layout'

import type { Insets } from '@/components/ui/mobile-control/mobile-layout'

export type MobileViewport = {
  width: number
  height: number
  insets: Insets
  /* NOTE: How much of the layout viewport the on-screen keyboard covers, from the visual viewport */
  keyboardHeight: number
  /*
   * NOTE: Whether the keyboard is up. Browsers that resize the layout viewport for the keyboard
   * (Chrome in full screen, for one) leave no overlap, so this compares with the tallest height seen
   */
  isKeyboardShown: boolean
  visualViewportTop: number
}

const readInsets = (probe: HTMLElement): Insets => {
  const style = getComputedStyle(probe)

  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  }
}

const readViewport = (probe: HTMLElement, fullHeight: number): MobileViewport => {
  const visualViewport = window.visualViewport
  const height = window.innerHeight
  const visualViewportTop = visualViewport?.offsetTop ?? 0
  const visualHeight = visualViewport?.height ?? height

  return {
    width: window.innerWidth,
    height,
    insets: readInsets(probe),
    keyboardHeight: Math.max(0, Math.round(height - visualHeight - visualViewportTop)),
    isKeyboardShown: fullHeight - visualHeight - visualViewportTop > KEYBOARD_MIN_HEIGHT,
    visualViewportTop: Math.max(0, Math.round(visualViewportTop)),
  }
}

const isSameViewport = (a: MobileViewport, b: MobileViewport): boolean =>
  a.width === b.width &&
  a.height === b.height &&
  a.keyboardHeight === b.keyboardHeight &&
  a.isKeyboardShown === b.isKeyboardShown &&
  a.visualViewportTop === b.visualViewportTop &&
  a.insets.top === b.insets.top &&
  a.insets.right === b.insets.right &&
  a.insets.bottom === b.insets.bottom &&
  a.insets.left === b.insets.left

/*
 * Size, safe areas and keyboard of the phone screen. The safe areas come from env() through
 * a probe element, the keyboard from the visual viewport (iOS never resizes the layout viewport).
 */
export const useMobileViewport = (): MobileViewport => {
  const [probe] = useState(() => {
    const element = document.createElement('div')

    element.setAttribute('aria-hidden', 'true')
    element.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'

    return element
  })
  const [viewport, setViewport] = useState<MobileViewport>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    keyboardHeight: 0,
    isKeyboardShown: false,
    visualViewportTop: 0,
  }))

  useEffect(() => {
    document.body.appendChild(probe)

    let frame = 0
    /* NOTE: The tallest layout viewport of the current width and screen mode, a keyboard only takes from it */
    let fullHeight = window.innerHeight
    let fullHeightWidth = window.innerWidth

    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (window.innerWidth !== fullHeightWidth) {
          fullHeightWidth = window.innerWidth
          fullHeight = window.innerHeight
        }

        fullHeight = Math.max(fullHeight, window.innerHeight)

        const next = readViewport(probe, fullHeight)

        // NOTE: The whole phone layout depends on this, an event that changed nothing must not re-render it
        setViewport((current) => (isSameViewport(current, next) ? current : next))
      })
    }

    /* NOTE: Leaving full screen brings the browser toolbars back, the old height is gone for good */
    const onFullscreenChange = () => {
      fullHeight = 0
      update()
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      probe.remove()
    }
  }, [probe])

  return viewport
}
