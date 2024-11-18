import { isDeviceUsable } from './is-device-usable.util'

describe('isDeviceUsable', () => {
  test('first positive case', () => {
    expect(isDeviceUsable({ present: true, status: 3, ready: true, hasOwner: true, using: true })).toBe(true)
  })

  test('second positive case', () => {
    expect(isDeviceUsable({ present: true, status: 3, ready: true, hasOwner: false, using: false })).toBe(true)
  })

  test('negative case', () => {
    expect(isDeviceUsable({ present: false, status: 3, ready: true, hasOwner: true, using: false })).toBe(false)
  })
})
