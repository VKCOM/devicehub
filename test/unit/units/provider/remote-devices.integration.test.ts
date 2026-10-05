/*
 * The provider unit with its API against a real ADB server and fake adbd
 * devices (no emulator needed). Only the device worker is replaced by a stub
 * that speaks the provider IPC.
 *
 * Needs the `adb` binary (ADB_PATH overrides it). Runs when ADB_INTEGRATION_TESTS=1
 * (not DH_-prefixed: the CLI reads DH_* variables as options)
 * or on CI; it starts its own ADB server on a random port, which may compete
 * with a local server for USB devices, hence opt-in on developer machines.
 */
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {execFile, execFileSync, fork, type ChildProcess} from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import {promisify} from 'node:util'
import provider, {type Provider} from '../../../../lib/units/provider/index.ts'
import {ProcessManager} from '../../../../lib/util/ProcessManager.ts'
import type {DeviceForkOverrides} from '../../../../lib/units/provider/remote-devices/manager.ts'
import {FakeAdbd} from '../../../support/fake-adbd.ts'

const ADB = process.env.ADB_PATH || 'adb'
const enabled = process.env.ADB_INTEGRATION_TESTS === '1' || !!process.env.CI
/* Longer than the 2s the process manager waits before restarting a dead worker */
const RECOVERY_TIMEOUT_MS = 4000
const WORKER = path.resolve(import.meta.dirname, '../../../support/fake-device-worker.mjs')

const freePort = () => new Promise<number>(resolve => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
        const {port} = server.address() as net.AddressInfo
        server.close(() => resolve(port))
    })
})

interface Worker {
    child: ChildProcess
    overrides?: DeviceForkOverrides
}

interface HookEvent {
    event: string
    provider: string
    serial: string
    data: Record<string, any>
    url: string
}

describe.skipIf(!enabled)('provider remote devices (real ADB server)', {timeout: 30_000}, () => {
    let adbPort: number
    const adb = (...args: string[]) => promisify(execFile)(ADB, ['-P', String(adbPort), ...args])
    const adbDevices = async() => (await adb('devices')).stdout
        .split('\n').slice(1).filter(Boolean).map(line => line.split(/\s+/))

    // Webhook receiver: two URLs on one server to check URL sharing
    let hookServer: http.Server
    let hookBase: string
    let events: HookEvent[]

    let apiBase: string
    let workers: Map<string, Worker>
    let spawned: string[]
    /* Whether the device's previous worker was still alive when each worker got spawned */
    let previousAliveAtSpawn: boolean[]
    let workerExitDelayMs: number
    /* Workers spawned from now on die on startup */
    let workerCrashes: boolean
    let running: Provider | undefined
    let adbds: FakeAdbd[]

    const startAdbd = async(mode?: 'device' | 'unauthorized', host?: string) => {
        const adbd = new FakeAdbd(mode, host)
        adbds.push(adbd)
        await adbd.start()
        return adbd
    }

    const connect = (body: Record<string, unknown>) => fetch(apiBase, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({host: '127.0.0.1', webhook: `${hookBase}/a`, ...body})
    })

    const remove = (serial: string) => fetch(`${apiBase}/${serial.replace(':', '/')}`, {method: 'DELETE'})

    const waitForEvent = (event: string, serial: string) => vi.waitFor(() => {
        const found = events.find(e => e.event === event && e.serial === serial)
        if (!found) {
            throw new Error(`No "${event}" for ${serial}; got ${JSON.stringify(events.map(e => e.event))}`)
        }
        return found
    }, {timeout: 15_000, interval: 100})

    const isAlive = (child: ChildProcess) => child.exitCode === null && child.signalCode === null

    const exited = (child: ChildProcess) => vi.waitFor(() => {
        if (isAlive(child)) {
            throw new Error('worker still running')
        }
    }, {timeout: 10_000})

    /*
     * Waits until adb no longer lists the device. The worker must be gone by
     * the moment it disappears: it is stopped before adb lets go of the device.
     */
    const goneFromAdb = async(serial: string, worker: ChildProcess) => {
        const deadline = Date.now() + 10_000
        while (Date.now() < deadline) {
            const listed = (await adbDevices()).map(([s]) => s).includes(serial)
            if (!listed) {
                expect(isAlive(worker), 'worker still running after adb let go of the device').toBe(false)
                return
            }
            await new Promise(resolve => setTimeout(resolve, 20))
        }
        throw new Error(`${serial} is still listed by adb`)
    }

    const connectReady = async(body: Record<string, unknown> = {}) => {
        const adbd = await startAdbd()
        const serial = `127.0.0.1:${adbd.port}`
        expect((await connect({port: adbd.port, ...body})).status).toBe(202)
        await waitForEvent('device.connected', serial)
        await waitForEvent('device.ready', serial)
        return {adbd, serial, worker: workers.get(serial)!}
    }

    /* Make the stub worker report a state change, as a real worker's group plugin does */
    const report = (serial: string, state: 'busy' | 'idle', email: string, reason?: string) =>
        workers.get(serial)!.child.send({type: 'device-state', serial, state, email, reason})

    beforeAll(async() => {
        execFileSync(ADB, ['version']) // Fails loudly on CI when adb is missing

        adbPort = await freePort()
        await adb('start-server')

        events = []
        hookServer = http.createServer((req, res) => {
            let body = ''
            req.on('data', chunk => body += chunk)
            req.on('end', () => {
                events.push({...JSON.parse(body), url: req.url})
                res.end()
            })
        })
        await new Promise<void>(resolve => hookServer.listen(0, '127.0.0.1', resolve))
        hookBase = `http://127.0.0.1:${(hookServer.address() as net.AddressInfo).port}`
    })

    afterAll(async() => {
        await adb('kill-server').catch(() => {})
        await new Promise(resolve => hookServer?.close(resolve))
    })

    /* `allowRemote` makes the provider serve any remote device ADB lists, as with --allow-remote */
    const startProvider = async({allowRemote = false} = {}) => {
        const apiPort = await freePort()
        apiBase = `http://127.0.0.1:${apiPort}/api/v1/remote-devices`

        running = await provider({
            name: 'it-provider',
            adbHost: '127.0.0.1',
            adbPort,
            adbAutostart: false,
            adbPath: ADB,
            idleDeviceReconnect: 0,
            ports: Array.from({length: 20}, (_, i) => 30_000 + i),
            allowRemote,
            killTimeout: 10_000, // a worker shutting down may outlive an ADB poll cycle, as in production (30s)
            deviceType: 'Android',
            endpoints: {processor: ['tcp://127.0.0.1:1']},
            // Only our fake devices, whatever else this ADB server sees
            filter: serial => allowRemote && /^(127\.0\.0\.1|\[::1\]):/.test(serial),
            fork: (serial, _ports, _endpoint, overrides) => {
                spawned.push(serial)
                const previous = workers.get(serial)?.child
                previousAliveAtSpawn.push(!!previous && isAlive(previous))
                // Like a real worker, it takes a while to clean up and exit on SIGTERM
                const child = fork(WORKER, [], {
                    stdio: 'ignore',
                    env: {
                        ...process.env,
                        FAKE_WORKER_EXIT_DELAY_MS: String(workerExitDelayMs),
                        FAKE_WORKER_CRASH: workerCrashes ? '1' : ''
                    }
                })
                workers.set(serial, {child, overrides})
                return child
            },
            api: {host: '127.0.0.1', port: apiPort, connectTimeoutMs: 3000, recoveryTimeoutMs: RECOVERY_TIMEOUT_MS}
        })
    }

    beforeEach(async() => {
        events.length = 0
        workers = new Map()
        spawned = []
        previousAliveAtSpawn = []
        workerExitDelayMs = 700
        workerCrashes = false
        adbds = []
        await startProvider()
    })

    afterEach(async() => {
        await running?.stop()
        await Promise.all(adbds.map(adbd => adbd.stop().catch(() => {})))
        for (const {child} of workers.values()) {
            child.kill('SIGKILL')
        }
    })

    it('connects a silent device with its own settings', async() => {
        const {serial, worker} = await connectReady({
            silent: true, emails: ['a@example.test'], idleTtl: 60, connectUrl: 'adb.example.test:15555'
        })

        expect(worker.overrides).toEqual({
            silent: true,
            silentAllowedEmail: ['a@example.test'],
            groupTimeout: 60,
            connectUrl: 'adb.example.test:15555',
            groupId: undefined,
            hideHeader: false
        })
        expect(await adbDevices()).toContainEqual([serial, 'device'])

        const list = await (await fetch(apiBase)).json()
        expect(list.devices).toMatchObject([{serial, state: 'active'}])
    })

    it('connects with host and port only, other fields null', async() => {
        const adbd = await startAdbd()
        const serial = `127.0.0.1:${adbd.port}`
        const res = await fetch(apiBase, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                host: '127.0.0.1', port: adbd.port,
                connectUrl: null, silent: null, emails: null, groupId: null, idleTtl: null, webhook: null
            })
        })
        expect(res.status).toBe(202)

        await vi.waitFor(async() => expect(await adbDevices()).toContainEqual([serial, 'device']), {timeout: 10_000})
        await vi.waitFor(() => expect(workers.has(serial)).toBe(true), {timeout: 10_000})
        expect(workers.get(serial)!.overrides).toMatchObject({silent: false, silentAllowedEmail: []})
        expect(events).toEqual([]) // no webhook given
    })

    it('connects and disconnects an IPv6 device', async ctx => {
        const adbd = await startAdbd('device', '::1').catch(() => null)
        if (!adbd) {
            ctx.skip() // no IPv6 loopback on this machine
            return
        }
        const serial = `[::1]:${adbd.port}`

        expect((await connect({host: '::1', port: adbd.port})).status).toBe(202)
        await waitForEvent('device.ready', serial)
        expect(await adbDevices()).toContainEqual([serial, 'device'])

        expect((await fetch(`${apiBase}/::1/${adbd.port}`, {method: 'DELETE'})).status).toBe(202)
        await waitForEvent('device.disconnected', serial)
        await vi.waitFor(async() => expect((await adbDevices()).map(([s]) => s)).not.toContain(serial))
    })

    it('connects a grouped device as non-silent', async() => {
        const {worker} = await connectReady({groupId: 'group-42', emails: ['ignored@example.test']})
        expect(worker.overrides).toMatchObject({silent: false, silentAllowedEmail: [], groupId: 'group-42'})
    })

    it('connects a device without flags as a regular one (Common group)', async() => {
        const {worker} = await connectReady()
        expect(worker.overrides).toMatchObject({silent: false, silentAllowedEmail: []})
        expect(worker.overrides?.groupId).toBeUndefined()
    })

    it('reports acquire and release with normalized reasons', async() => {
        const {serial} = await connectReady()

        report(serial, 'busy', 'u@example.test')
        expect((await waitForEvent('device.acquired', serial)).data).toEqual({email: 'u@example.test'})

        for (const [reason, expected] of [
            ['automatic_timeout', 'idle_timeout'], // group plugin timeout
            ['timeout', 'idle_timeout'], // silent lease timeout
            ['ungroup_request', 'manual']
        ]) {
            events.length = 0
            report(serial, 'busy', 'u@example.test') // a release is reported only for an owned device
            report(serial, 'idle', 'u@example.test', reason)
            expect((await waitForEvent('device.released', serial)).data)
                .toEqual({email: 'u@example.test', reason: expected})
        }
    })

    it('forgets a device whose connection dropped, without reconnecting', async() => {
        const {adbd, serial, worker} = await connectReady()

        await adbd.stop()

        // A real ADB server keeps a dropped TCP device listed as "offline"
        const event = await waitForEvent('device.disconnected', serial)
        expect(['offline', 'connection_lost']).toContain(event.data.reason)

        // The worker is stopped before adb lets go of the device; no reconnect,
        // gone from the API, the worker is not respawned
        await goneFromAdb(serial, worker.child)
        expect((await (await fetch(apiBase)).json()).devices).toEqual([])
        expect(spawned).toEqual([serial])
    })

    it('reports an owned device whose worker died as released, and keeps it once a new worker is ready', async() => {
        const {serial, worker} = await connectReady()
        report(serial, 'busy', 'u@example.test')
        await waitForEvent('device.acquired', serial)
        events.length = 0

        worker.child.send({type: 'crash'})
        expect((await waitForEvent('device.released', serial)).data)
            .toEqual({email: 'u@example.test', reason: 'device_absent'})
        await waitForEvent('device.ready', serial) // the process manager restarts it after 2s

        await new Promise(resolve => setTimeout(resolve, RECOVERY_TIMEOUT_MS)) // past the recovery timeout
        expect(events.filter(e => e.serial === serial).map(e => e.event)).toEqual(['device.released', 'device.ready'])
        expect(spawned).toEqual([serial, serial])
        expect((await (await fetch(apiBase)).json()).devices).toMatchObject([{serial, state: 'active'}])
    })

    it('disconnects a device whose worker cannot be brought back up', async() => {
        const {serial, worker} = await connectReady()
        report(serial, 'busy', 'u@example.test')
        await waitForEvent('device.acquired', serial)
        events.length = 0

        workerCrashes = true
        worker.child.send({type: 'crash'})

        expect((await waitForEvent('device.disconnected', serial)).data).toEqual({reason: 'worker_failed'})
        expect(events.filter(e => e.serial === serial).map(e => e.event))
            .toEqual(['device.released', 'device.disconnected'])
        await vi.waitFor(async() => expect(await adbDevices()).not.toContainEqual([serial, 'device']), {timeout: 10_000})
        expect((await (await fetch(apiBase)).json()).devices).toEqual([])
    })

    it('disconnects a device through the API', async() => {
        const {serial, worker} = await connectReady()

        expect((await remove(serial)).status).toBe(202)
        expect((await waitForEvent('device.disconnected', serial)).data).toEqual({reason: 'api'})
        await goneFromAdb(serial, worker.child)

        expect((await remove(serial)).status).toBe(404)
    })

    it('reports a refused connection once and never retries', async() => {
        const port = await freePort() // nothing listens there
        const serial = `127.0.0.1:${port}`

        expect((await connect({port})).status).toBe(202)
        expect((await waitForEvent('device.connect_failed', serial)).data.reason).toMatch(/failed to connect/i)

        await new Promise(resolve => setTimeout(resolve, 4000)) // longer than a poll cycle
        expect(events.filter(e => e.serial === serial).map(e => e.event)).toEqual(['device.connect_failed'])
        expect(spawned).toEqual([])
    })

    it('never serves a device whose adb connect timed out, even with --allow-remote', {timeout: 60_000}, async() => {
        // Like an emulator console port: accepts TCP, never speaks ADB. adb
        // times out after ~10s and keeps listing the device as "offline".
        const sockets = new Set<net.Socket>()
        const silent = net.createServer(socket => {
            sockets.add(socket)
            socket.on('error', () => {})
        })
        await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve))
        const port = (silent.address() as net.AddressInfo).port
        const serial = `127.0.0.1:${port}`

        await running!.stop()
        await startProvider({allowRemote: true})
        const create = vi.spyOn(ProcessManager.prototype, 'create')

        try {
            expect((await connect({port})).status).toBe(202)
            expect((await waitForEvent('device.connect_failed', serial)).data.reason).toMatch(/failed to connect/i)
            const createdBeforeFailure = create.mock.calls.length

            await vi.waitFor(
                async() => expect((await adbDevices()).map(([s]) => s)).not.toContain(serial),
                {timeout: 10_000, interval: 200}
            )
            await new Promise(resolve => setTimeout(resolve, 4000)) // longer than a poll cycle

            // Once given up on, it is not picked up as a regular remote device
            expect(create.mock.calls.slice(createdBeforeFailure).map(([id]) => id)).not.toContain(serial)
            expect(spawned).toEqual([])
        }
        finally {
            create.mockRestore()
            // adb keeps retrying in the background: close its connections too
            sockets.forEach(socket => socket.destroy())
            await new Promise(resolve => silent.close(resolve))
        }
    })

    it('gives up on a device that does not authorize this provider', async() => {
        const adbd = await startAdbd('unauthorized')
        const serial = `127.0.0.1:${adbd.port}`

        expect((await connect({port: adbd.port})).status).toBe(202)
        expect((await waitForEvent('device.connect_failed', serial)).data.reason).toMatch(/authenticate|unauthorized/i)

        await vi.waitFor(async() => expect((await adbDevices()).map(([s]) => s)).not.toContain(serial))
        expect(spawned).toEqual([])
    })

    it('shares one webhook URL between devices', async() => {
        const first = await connectReady()
        const second = await connectReady()
        expect(events.filter(e => e.event === 'device.connected').map(e => e.url)).toEqual(['/a', '/a'])

        await remove(first.serial)
        await waitForEvent('device.disconnected', first.serial)

        // The URL still serves the other device
        events.length = 0
        report(second.serial, 'busy', 'u@example.test')
        await waitForEvent('device.acquired', second.serial)
    })

    /* A device ADBObserver finds on its own, served with --allow-remote */
    const connectRegular = async() => {
        await running!.stop()
        await startProvider({allowRemote: true})

        const adbd = await startAdbd()
        const serial = `127.0.0.1:${adbd.port}`
        await adb('connect', serial)
        await vi.waitFor(() => expect(workers.has(serial)).toBe(true), {timeout: 10_000})
        return {adbd, serial, worker: workers.get(serial)!.child}
    }

    it('stops the worker of a regular device that went offline', async() => {
        const {adbd, serial, worker} = await connectRegular()

        await adbd.stop()

        await exited(worker)
        expect(await adbDevices()).toContainEqual([serial, 'offline'])
        expect(events).toEqual([]) // not an API device: no webhooks
        await adb('disconnect', serial)
    })

    it('does not respawn the worker of a regular device while it is offline', {timeout: 60_000}, async() => {
        const {adbd, serial, worker} = await connectRegular()

        // adb loses the device and its worker dies of it, maybe before the provider notices
        await adbd.stop()
        worker.send({type: 'crash'})
        await vi.waitFor(async() => expect(await adbDevices()).toContainEqual([serial, 'offline']), {timeout: 10_000})
        // Respawned at most while adb itself still listed the device as usable
        await new Promise(resolve => setTimeout(resolve, 4000)) // a poll cycle: the provider knows
        await vi.waitFor(() => expect(isAlive(workers.get(serial)!.child)).toBe(false), {timeout: 15_000})
        expect(spawned.length).toBeLessThanOrEqual(2)

        const spawnedWhileOffline = spawned.length
        await new Promise(resolve => setTimeout(resolve, 12_000)) // past every restart delay
        expect(spawned).toHaveLength(spawnedWhileOffline)
        expect(isAlive(workers.get(serial)!.child)).toBe(false)

        // Back in adb: started again
        await adbd.start()
        await adb('connect', serial)
        await vi.waitFor(() => {
            expect(spawned).toHaveLength(spawnedWhileOffline + 1)
            expect(isAlive(workers.get(serial)!.child)).toBe(true)
        }, {timeout: 15_000})
        await adb('disconnect', serial)
    })

    it('removes the worker of a regular device that disconnected', async() => {
        const {serial, worker} = await connectRegular()

        await adb('disconnect', serial)

        await exited(worker)
        expect(spawned).toEqual([serial]) // not respawned
        expect(events).toEqual([])
    })

    it('gives a regular device that comes back while its worker shuts down a new worker', {timeout: 60_000}, async() => {
        workerExitDelayMs = 5000 // longer than an ADB poll cycle
        const {serial, worker} = await connectRegular()

        await adb('disconnect', serial)
        await new Promise(resolve => setTimeout(resolve, 3500)) // the provider noticed, the worker shuts down
        expect(isAlive(worker)).toBe(true)
        await adb('connect', serial) // back before its worker is gone

        await vi.waitFor(() => expect(spawned).toEqual([serial, serial]), {timeout: 20_000, interval: 100})
        expect(previousAliveAtSpawn).toEqual([false, false]) // never two workers for one device
        expect(isAlive(workers.get(serial)!.child)).toBe(true)
    })

    it('ignores remote devices connected outside the API', async() => {
        const adbd = await startAdbd()
        const serial = `127.0.0.1:${adbd.port}`
        await adb('connect', serial)
        await vi.waitFor(async() => expect(await adbDevices()).toContainEqual([serial, 'device']))

        await new Promise(resolve => setTimeout(resolve, 4000)) // longer than a poll cycle
        expect(spawned).toEqual([])
        expect((await connect({port: adbd.port})).status).toBe(409)

        await adb('disconnect', serial)
    })

    it('disconnects API devices when the provider stops', async() => {
        const {serial, worker} = await connectReady()

        await running!.stop()
        running = undefined

        expect((await waitForEvent('device.disconnected', serial)).data).toEqual({reason: 'provider_shutdown'})
        await exited(worker.child)
        expect((await adbDevices()).map(([s]) => s)).not.toContain(serial)
        await expect(fetch(apiBase)).rejects.toThrow()
    })
})
