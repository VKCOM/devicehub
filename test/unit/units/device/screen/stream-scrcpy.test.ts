import {EventEmitter} from 'node:events'
import Bluebird from 'bluebird'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../../lib/units/device/support/adb.js', () => ({default: {consume() {}}}))
vi.mock('../../../../../lib/units/base-device/support/router.js', () => ({default: {consume() {}}}))
vi.mock('../../../../../lib/units/device/resources/minicap.js', () => ({default: {consume() {}}}))
vi.mock('../../../../../lib/units/device/resources/scrcpy.js', () => ({default: {consume() {}}}))
vi.mock('../../../../../lib/units/device/plugins/util/display.js', () => ({default: {consume() {}}}))
vi.mock('../../../../../lib/units/device/plugins/screen/options.js', () => ({default: {consume() {}}}))
vi.mock('../../../../../lib/units/device/plugins/group.js', () => ({default: {consume() {}}}))
const shutdown: Array<() => unknown> = []
vi.mock('../../../../../lib/util/lifecycle.js', () => ({
    default: {observe: (fn: () => unknown) => shutdown.push(fn), fatal: vi.fn()}
}))

const stream = (await import('../../../../../lib/units/device/plugins/screen/stream.js')).default
const {ChangeQualityMessage} = await import('../../../../../lib/wire/wire.js')

const settle = () => new Promise(resolve => setTimeout(resolve, 300))

const setup = async(start: (config: any) => Promise<any>) => {
    const handlers = new Map<unknown, (channel: string, message: any) => void>()
    const router = {on: (type: unknown, handler: any) => handlers.set(type, handler)}
    const display = Object.assign(new EventEmitter(), {properties: {width: 1080, height: 1920, rotation: 0}})
    // Never starts: the test only checks it is asked to
    const minicap = {run: vi.fn(() => new Bluebird(() => {}))}
    const scrcpy = {available: true, start: vi.fn(start)}
    const producer = await stream.invoke(
        {serial: 'serial', screenGrabber: 'minicap-apk', screenFrameRate: 20, screenJpegQuality: 80,
            needScrcpy: true, scrcpyBitRate: 4_000_000},
        {}, router, minicap, scrcpy, display, {publicPort: 0}, {}
    )
    const changeQuality = (quality: number) => handlers.get(ChangeQualityMessage)!('channel', {quality})
    return {producer, scrcpy, minicap, changeQuality}
}

const session = () => Object.assign(new EventEmitter(), {stop: vi.fn()})

afterEach(async() => {
    for (const fn of shutdown.splice(0)) {
        await fn()
    }
})

describe('screen stream with scrcpy', () => {
    it('restarts scrcpy at the bit rate of a new quality, and only for a new one', async() => {
        const sessions: any[] = []
        const {producer, scrcpy, changeQuality} = await setup(async() => {
            sessions.push(session())
            return sessions[sessions.length - 1]
        })

        producer.start()
        await settle()
        expect(scrcpy.start).toHaveBeenCalledTimes(1)
        expect(scrcpy.start.mock.calls[0][0]).toEqual({maxSize: 1920, maxFps: 20, bitRate: 4_000_000})

        // Auto quality sends the current quality again every few seconds
        changeQuality(80)
        await settle()
        expect(scrcpy.start).toHaveBeenCalledTimes(1)

        changeQuality(40)
        await settle()
        expect(sessions[0].stop).toHaveBeenCalled()
        expect(scrcpy.start).toHaveBeenCalledTimes(2)
        expect(scrcpy.start.mock.calls[1][0]).toMatchObject({bitRate: 2_000_000})
    })

    it('uses a quality chosen while scrcpy is about to start, without a restart', async() => {
        const {producer, scrcpy, changeQuality} = await setup(async() => session())

        producer.start()
        changeQuality(20)
        await settle()

        expect(scrcpy.start).toHaveBeenCalledTimes(1)
        expect(scrcpy.start.mock.calls[0][0]).toMatchObject({bitRate: 1_000_000})
    })

    it('falls back to minicap when scrcpy cannot start', async() => {
        const {producer, minicap} = await setup(async() => {
            throw new Error('no encoder')
        })

        producer.start()
        await settle()

        expect(producer.mode).toBe('minicap')
        expect(minicap.run).toHaveBeenCalled()
    })
})
