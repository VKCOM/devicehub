import {describe, expect, it} from 'vitest'
import {scrcpyBitRate} from '../../../../../lib/units/device/plugins/screen/util/scrcpy-quality.js'

describe('scrcpyBitRate', () => {
    it('streams at the configured bit rate at the top of the quality slider', () => {
        expect(scrcpyBitRate(4_000_000, 80)).toBe(4_000_000)
    })

    it('scales the bit rate down with the quality', () => {
        expect(scrcpyBitRate(4_000_000, 40)).toBe(2_000_000)
        expect(scrcpyBitRate(4_000_000, 10)).toBe(500_000)
    })

    it('keeps a usable floor and caps out of range qualities', () => {
        expect(scrcpyBitRate(1_000_000, 10)).toBe(200_000)
        expect(scrcpyBitRate(4_000_000, 0)).toBe(200_000)
        expect(scrcpyBitRate(4_000_000, 1000)).toBe(5_000_000)
    })
})
