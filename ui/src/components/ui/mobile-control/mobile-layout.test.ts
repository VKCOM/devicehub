import { describe, expect, it } from 'vitest'

import { ACCESSORY_HEIGHT, STRIP_SIZE, computeMobileLayout, resolveSheetSnap } from './mobile-layout'

import type { MobileLayoutInput } from './mobile-layout'

/* iPhone 12 mini */
const portrait: MobileLayoutInput = {
  width: 375,
  height: 812,
  insets: { top: 50, right: 0, bottom: 34, left: 0 },
  isStripEnabled: true,
  sheet: 'closed',
  isKeyboardOpen: false,
  keyboardHeight: 0,
  visualViewportTop: 0,
  dragVisible: null,
}

const landscape: MobileLayoutInput = {
  ...portrait,
  width: 812,
  height: 375,
  insets: { top: 0, right: 47, bottom: 21, left: 47 },
}

describe('resolveSheetSnap', () => {
  const half = 325
  const max = 676

  it('settles to the nearest stop without a fling', () => {
    expect(resolveSheetSnap({ visible: 100, velocity: 0, half, max })).toBe('closed')
    expect(resolveSheetSnap({ visible: 300, velocity: 0, half, max })).toBe('half')
    expect(resolveSheetSnap({ visible: 480, velocity: 0, half, max })).toBe('half')
    expect(resolveSheetSnap({ visible: 520, velocity: 0, half, max })).toBe('full')
  })

  it('closes on a fling down from the half sheet and halves it from the full one', () => {
    expect(resolveSheetSnap({ visible: 320, velocity: 0.8, half, max })).toBe('closed')
    expect(resolveSheetSnap({ visible: 600, velocity: 0.8, half, max })).toBe('half')
  })

  it('opens fully on a fling up', () => {
    expect(resolveSheetSnap({ visible: 330, velocity: -0.8, half, max })).toBe('full')
  })

  it('treats a slow move as a position, not a fling', () => {
    expect(resolveSheetSnap({ visible: 320, velocity: 0.4, half, max })).toBe('half')
  })
})

describe('computeMobileLayout', () => {
  it('fits the stage between the safe area and the strip', () => {
    const layout = computeMobileLayout(portrait)

    expect(layout.isLandscape).toBe(false)
    expect(layout.stage).toEqual({ top: 50, left: 0, right: 0, bottom: STRIP_SIZE + 34 })
    expect(layout.isStripVisible).toBe(true)
  })

  it('shrinks the stage above the half sheet, which stays non-modal', () => {
    const layout = computeMobileLayout({ ...portrait, sheet: 'half' })

    expect(layout.sheetHalf).toBe(Math.round(812 * 0.4))
    expect(layout.stage.bottom).toBe(STRIP_SIZE + 34 + layout.sheetHalf)
    expect(layout.isScrimVisible).toBe(false)
    expect(layout.sheet.transform).toBe(`translateY(${layout.sheetMax - layout.sheetHalf}px)`)
  })

  it('makes the full sheet modal and keeps the stage at the half height', () => {
    const layout = computeMobileLayout({ ...portrait, sheet: 'full' })

    expect(layout.isScrimVisible).toBe(true)
    expect(layout.stage.bottom).toBe(STRIP_SIZE + 34 + layout.sheetHalf)
    expect(layout.sheet.transform).toBe('translateY(0px)')
  })

  it('follows the finger while the handle is dragged', () => {
    const layout = computeMobileLayout({ ...portrait, sheet: 'half', dragVisible: 100 })

    expect(layout.stage.bottom).toBe(STRIP_SIZE + 34 + 100)
    expect(layout.isScrimVisible).toBe(false)
  })

  it('without the strip lets the stage reach the bottom safe area', () => {
    const layout = computeMobileLayout({ ...portrait, isStripEnabled: false })

    expect(layout.stage.bottom).toBe(34)
    expect(layout.sheet.paddingBottom).toBe(34)
  })

  it('pins the accessory row to the top of the keyboard and hides the strip', () => {
    const layout = computeMobileLayout({ ...portrait, isKeyboardOpen: true, keyboardHeight: 336 })

    expect(layout.isStripVisible).toBe(false)
    expect(layout.stage.bottom).toBe(336 + ACCESSORY_HEIGHT)
    expect(layout.accessoryTop).toBe(812 - 336 - ACCESSORY_HEIGHT)
  })

  it('moves the strip to the right and opens the sheet as a side panel in landscape', () => {
    const closed = computeMobileLayout(landscape)
    const open = computeMobileLayout({ ...landscape, sheet: 'half' })
    const stripWidth = STRIP_SIZE + 47
    const panelWidth = Math.round((812 - stripWidth - 47) / 2)

    expect(closed.isLandscape).toBe(true)
    expect(closed.stage).toEqual({ top: 0, left: 47, right: stripWidth, bottom: 21 })
    expect(open.sheet.width).toBe(panelWidth)
    expect(open.stage.right).toBe(stripWidth + panelWidth)
    expect(open.isScrimVisible).toBe(false)
  })
})
