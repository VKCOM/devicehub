import { describe, expect, it } from 'vitest'

import { isMobileControlViewport } from './use-is-mobile-control.hook'

describe('isMobileControlViewport', () => {
  it.each([
    ['iPhone 12 mini portrait', 375, 812],
    ['iPhone 12 mini landscape', 812, 375],
    ['large Android phone landscape', 915, 412],
  ])('gives a %s the phone layout', (_, width, height) => {
    expect(isMobileControlViewport({ width, height, isCoarsePointer: true })).toBe(true)
  })

  it.each([
    ['iPad portrait', 820, 1180],
    ['iPad landscape', 1180, 820],
    ['iPad mini landscape', 1133, 744],
  ])('keeps the desktop layout on an %s', (_, width, height) => {
    expect(isMobileControlViewport({ width, height, isCoarsePointer: true })).toBe(false)
  })

  it('keeps the desktop layout for a mouse, even in a narrow window', () => {
    expect(isMobileControlViewport({ width: 375, height: 700, isCoarsePointer: false })).toBe(false)
  })
})
