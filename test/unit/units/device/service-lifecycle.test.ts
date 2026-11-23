import {PassThrough} from 'node:stream'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../lib/units/device/support/adb.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/router.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/transport.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/support/sdk.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/resources/service.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/util/devutil.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/util/lifecycle.js', () => ({default: {
    ending: false, observe: vi.fn(), observeFatal: vi.fn(), fatal: vi.fn()
}}))
const {default: servicePlugin} = await import('../../../../lib/units/device/plugins/service.js')
const {default: lifecycle} = await import('../../../../lib/util/lifecycle.js')

const flush = async() => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const streams: PassThrough[] = []
const stream = () => { const out = new PassThrough(); streams.push(out); return out }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); lifecycle.ending = false })
afterEach(() => {
    lifecycle.ending = true
    streams.splice(0).forEach(out => out.destroy())
    vi.useRealTimers()
})

async function setup(killEndsSocket = false) {
    const agents: PassThrough[] = []
    const services: PassThrough[] = []
    const shells: PassThrough[] = []
    const devutil = {
        killProcsByComm: vi.fn(async() => {
            if (killEndsSocket) agents.at(-1)?.emit('end')
            if (shells.length > 8) throw new Error('Concurrent agent restart loop')
        }),
        ensureUnusedLocalSocket: vi.fn(async(sock: string) => sock),
        waitForLocalSocket: vi.fn(async(sock: string) => {
            const out = stream()
            ;(sock.endsWith('stfagent') ? agents : services).push(out)
            return out
        }),
        executeShellCommand: vi.fn(async() => {})
    }
    const shell = vi.fn(async(command: string) => {
        const out = stream()
        if (command.includes('app_process')) shells.push(out)
        else out.end('Starting service\n')
        return out
    })
    const router = {on: vi.fn().mockReturnThis()}
    const ready = servicePlugin.invoke({serial: 'serial'}, {getDevice: () => ({shell})}, router, {},
        {level: 30}, {path: '/test.apk', main: 'test.Agent', startIntent: {action: 'start', component: 'test/.Service'}}, devutil)
    await vi.advanceTimersByTimeAsync(3100)
    await ready
    return {agents, services, shells, devutil}
}

describe('STF service recovery', () => {
    it('launches exactly one replacement agent when the service ends', async() => {
        const h = await setup()
        h.services[0].emit('end')
        await vi.advanceTimersByTimeAsync(10_000)
        expect(h.shells).toHaveLength(2)
        expect(h.services).toHaveLength(2)
    })

    it('coalesces error and end from the same service socket', async() => {
        const h = await setup()
        h.services[0].emit('error', new Error('closed'))
        h.services[0].emit('end')
        await vi.advanceTimersByTimeAsync(10_000)
        expect(h.shells).toHaveLength(2)
        expect(h.services).toHaveLength(2)
    })

    it('does not restart from the old agent socket closed by intentional replacement', async() => {
        const h = await setup(true)
        h.services[0].emit('end')
        await vi.advanceTimersByTimeAsync(10_000)
        expect(h.shells).toHaveLength(2)
        expect(h.services).toHaveLength(2)
        expect(lifecycle.fatal).not.toHaveBeenCalled()
    })

    it('does not relaunch during worker shutdown', async() => {
        const h = await setup()
        lifecycle.ending = true
        h.services[0].emit('end')
        h.agents[0].emit('end')
        await flush()
        expect(h.shells).toHaveLength(1)
        expect(lifecycle.fatal).not.toHaveBeenCalled()
    })
})
