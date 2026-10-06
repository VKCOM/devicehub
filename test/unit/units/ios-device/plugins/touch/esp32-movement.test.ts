import {describe, expect, it} from 'vitest'
import {getDirection, getStep} from '../../../../../../lib/units/ios-device/plugins/touch/esp32-movement.js'

describe('ESP32 movement commands', () => {
    it('selects a firmware-supported step based on the remaining distance', () => {
        expect(getStep(100)).toBe(8)
        expect(getStep(-8)).toBe(-8)
        expect(getStep(7)).toBe(4)
        expect(getStep(-2)).toBe(-1)
        expect(getStep(0)).toBe(0)
    })

    it.each([
        ['x', 1, 'R'],
        ['x', 4, 'r'],
        ['x', 8, 'k'],
        ['x', -1, 'L'],
        ['x', -4, 'l'],
        ['x', -8, 'g'],
        ['y', 1, 'D'],
        ['y', 4, 'd'],
        ['y', 8, 'h'],
        ['y', -1, 'U'],
        ['y', -4, 'u'],
        ['y', -8, 'j'],
    ] as const)('maps axis %s step %i to firmware command %s', (axis, step, command) => {
        expect(getDirection(axis, step)).toBe(command)
    })
})
