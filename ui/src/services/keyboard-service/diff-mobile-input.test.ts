import { describe, expect, it } from 'vitest'

import { diffMobileInput, MOBILE_INPUT_SENTINEL, shouldResetMobileInput } from './keyboard-service'

const S = MOBILE_INPUT_SENTINEL

describe('diffMobileInput', () => {
  it('sends a typed character', () => {
    expect(diffMobileInput(S, `${S}a`)).toEqual({ deleted: 0, inserted: 'a' })
  })

  it('sends each step of a composing word', () => {
    expect(diffMobileInput(`${S}he`, `${S}hel`)).toEqual({ deleted: 0, inserted: 'l' })
  })

  it('replaces an autocorrected word with Backspace presses and the new text', () => {
    expect(diffMobileInput(`${S}teh`, `${S}the`)).toEqual({ deleted: 2, inserted: 'he' })
  })

  it('sends a Backspace for every deleted character of the margin', () => {
    expect(diffMobileInput(S, S.slice(1))).toEqual({ deleted: 1, inserted: '' })
    expect(diffMobileInput(S.slice(1), S.slice(2))).toEqual({ deleted: 1, inserted: '' })
  })

  it('sends nothing when the value did not change', () => {
    expect(diffMobileInput(`${S}ab`, `${S}ab`)).toEqual({ deleted: 0, inserted: '' })
  })

  it('refills the input only when the margin runs low or the text grows long', () => {
    expect(shouldResetMobileInput(`${S}hello`)).toBe(false)
    expect(shouldResetMobileInput(S.slice(0, 20))).toBe(false)
    expect(shouldResetMobileInput(S.slice(0, 7))).toBe(true)
    expect(shouldResetMobileInput(S + 'x'.repeat(300))).toBe(true)
  })
})
