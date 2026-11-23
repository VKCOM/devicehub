import 'reflect-metadata'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileControlStore } from './mobile-control-store'

describe('MobileControlStore', () => {
  beforeEach(() => localStorage.clear())

  const withInput = () => {
    const store = new MobileControlStore('serial-1')
    const input = { focus: vi.fn(), blur: vi.fn() } as unknown as HTMLTextAreaElement

    store.setKeyboardInput(input)

    return { store, input }
  }

  it('focuses the input synchronously when the keyboard opens and toggles it closed', () => {
    const { store, input } = withInput()

    store.setSheet('half')
    store.toggleKeyboard()

    expect(input.focus).toHaveBeenCalledOnce()
    expect(store.isKeyboardOpen).toBe(true)
    expect(store.sheet).toBe('closed')

    store.toggleKeyboard()

    expect(input.blur).toHaveBeenCalledOnce()
    expect(store.isKeyboardOpen).toBe(false)
  })

  it('hides the keyboard when the sheet opens', () => {
    const { store } = withInput()

    store.openKeyboard()
    store.setSheet('half')

    expect(store.isKeyboardOpen).toBe(false)
  })

  it('closes the keyboard, then the sheet, then lets back through', () => {
    const { store } = withInput()

    store.openKeyboard()

    expect(store.handleBack()).toBe(true)
    expect(store.isKeyboardOpen).toBe(false)

    store.setSheet('full')

    expect(store.handleBack()).toBe(true)
    expect(store.sheet).toBe('closed')
    expect(store.handleBack()).toBe(false)
  })

  it('remembers the navigation strip per device', () => {
    new MobileControlStore('serial-1').setStripEnabled(false)

    expect(new MobileControlStore('serial-1').isStripEnabled).toBe(false)
    expect(new MobileControlStore('serial-2').isStripEnabled).toBe(true)
  })

  it('shows the Add to Home Screen hint by itself only once', () => {
    const first = new MobileControlStore('serial-1')

    first.maybeShowAddToHomeScreenHintOnce()

    expect(first.isAddToHomeScreenHintShown).toBe(true)

    const second = new MobileControlStore('serial-1')

    second.maybeShowAddToHomeScreenHintOnce()

    expect(second.isAddToHomeScreenHintShown).toBe(false)
  })

  it('keeps the keyboard row keys in their fixed order and remembers them', () => {
    const store = new MobileControlStore('serial-1')

    expect(store.accessoryKeys).toEqual(['tab', 'left', 'right', 'esc', 'paste'])

    store.setAccessoryKeyShown('enter', true)
    store.setAccessoryKeyShown('tab', false)

    expect(store.accessoryKeys).toEqual(['left', 'right', 'esc', 'enter', 'paste'])
    expect(new MobileControlStore('serial-2').accessoryKeys).toEqual(['left', 'right', 'esc', 'enter', 'paste'])
  })

  it('remembers the touch display settings', () => {
    const store = new MobileControlStore('serial-1')

    expect(store.isTouchIndicatorShown).toBe(true)
    expect(store.isTouchTrailShown).toBe(true)

    store.setTouchTrailShown(false)

    expect(new MobileControlStore('serial-1').isTouchTrailShown).toBe(false)
  })
})
