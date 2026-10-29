import {describe, expect, it} from 'vitest'
import {parseLogcatFilters} from '../../../../lib/units/websocket/support/logcatFilters.ts'

describe('parseLogcatFilters', () => {
    it('wraps the single filter sent by the UI in the repeated protobuf field', () => {
        expect(parseLogcatFilters({tag: '*', priority: 2})).toEqual([
            {tag: '*', priority: 2}
        ])
    })

    it('preserves filter arrays sent by older clients', () => {
        const filters = [
            {tag: 'ActivityManager', priority: 4},
            {tag: 'System.err', priority: 6}
        ]
        expect(parseLogcatFilters(filters)).toEqual(filters)
    })

    it('accepts an empty filter array', () => {
        expect(parseLogcatFilters([])).toEqual([])
    })

    it('rejects malformed filters before protobuf serialization', () => {
        expect(parseLogcatFilters({tag: '*', priority: 'verbose'})).toBeNull()
        expect(parseLogcatFilters([{tag: '*', priority: 2}, {tag: 1, priority: 3}])).toBeNull()
        expect(parseLogcatFilters(undefined)).toBeNull()
    })
})
