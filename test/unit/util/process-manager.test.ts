import {afterEach, describe, expect, it} from 'vitest'
import {fork, type ChildProcess} from 'node:child_process'
import path from 'node:path'
import {ProcessManager, ResourcePool} from '../../../lib/util/ProcessManager.ts'

const WORKER = path.resolve(import.meta.dirname, '../../support/fake-device-worker.mjs')

// A real device worker cleans up before it exits on SIGTERM
const EXIT_DELAY_MS = 700

const isAlive = (child: ChildProcess) => child.exitCode === null && child.signalCode === null

describe('ProcessManager shutdown of workers', () => {
    let children: ChildProcess[]
    /* Whether the previous worker was still alive when each worker got spawned */
    let previousAliveAtSpawn: boolean[]
    let pool: ResourcePool<number>
    let manager: ProcessManager<object, number>

    const setup = (env: Record<string, string> = {}) => {
        children = []
        previousAliveAtSpawn = []
        pool = new ResourcePool([7400, 7401])
        manager = new ProcessManager<object, number>({
            spawn: () => {
                const previous = children.at(-1)
                previousAliveAtSpawn.push(!!previous && isAlive(previous))
                const child = fork(WORKER, [], {
                    stdio: 'ignore',
                    env: {...process.env, FAKE_WORKER_EXIT_DELAY_MS: String(EXIT_DELAY_MS), ...env}
                })
                children.push(child)
                return child
            }
        }, {killTimeout: 5000, resourcePool: pool})
    }

    const startWorker = async() => {
        await manager.create('serial', {}, {resourceCount: 2})
        expect(await manager.start('serial')).toBe(true)
        return children[0]
    }

    afterEach(() => {
        children.forEach(child => child.kill('SIGKILL'))
    })

    it('remove() returns only once the worker has exited', async() => {
        setup()
        const child = await startWorker()

        await manager.remove('serial')

        expect(isAlive(child)).toBe(false)
        expect(manager.has('serial')).toBe(false)
    })

    it('releases the ports only once the worker has exited', async() => {
        setup()
        const child = await startWorker()
        expect(pool.availableCount).toBe(0)

        let releasedWhileAlive = false
        const release = pool.release.bind(pool)
        pool.release = resources => {
            releasedWhileAlive = isAlive(child)
            release(resources)
        }

        await manager.remove('serial')
        expect(releasedWhileAlive).toBe(false)
        expect(pool.availableCount).toBe(2)
    })

    it('stop() returns only once the worker has exited', async() => {
        setup()
        const child = await startWorker()

        await manager.stop('serial')

        expect(isAlive(child)).toBe(false)
        expect(manager.has('serial')).toBe(true) // stop keeps the entry and its ports
    })

    it('removes a worker stopped earlier without waiting on it again', async() => {
        setup()
        await startWorker()
        await manager.stop('serial') // device went offline

        const startedAt = Date.now()
        await manager.remove('serial') // then it disconnected
        expect(Date.now() - startedAt).toBeLessThan(1000) // not the 2 x 5s kill timeout
        expect(pool.availableCount).toBe(2)
    })

    it('gives a device that comes back while its worker shuts down a new worker, after the old one is gone', async() => {
        setup()
        const old = await startWorker()

        const removal = manager.remove('serial') // device disconnected
        expect(manager.has('serial')).toBe(false) // ...and may come back right away

        await manager.create('serial', {}, {resourceCount: 2})
        expect(await manager.start('serial')).toBe(true)
        await removal

        expect(isAlive(old)).toBe(false)
        expect(previousAliveAtSpawn).toEqual([false, false]) // never two workers for one device
        expect(isAlive(children[1])).toBe(true)
        expect(pool.availableCount).toBe(0) // its ports are taken again
    })

    it('cleanup() waits for every worker', async() => {
        setup()
        const child = await startWorker()

        await manager.cleanup()

        expect(isAlive(child)).toBe(false)
    })

    it('cleanup() waits for a removal already under way', async() => {
        setup()
        const child = await startWorker()

        const removal = manager.remove('serial')
        await manager.cleanup()

        expect(isAlive(child)).toBe(false)
        await removal
    })

    it('settles start() of a worker stopped before it got ready', async() => {
        setup({FAKE_WORKER_NO_READY: '1'})
        await manager.create('serial', {}, {resourceCount: 2})
        const started = manager.start('serial')
        await new Promise(resolve => setTimeout(resolve, 300)) // spawned, not ready

        await manager.remove('serial')

        expect(isAlive(children[0])).toBe(false)
        await expect(started).resolves.toBe(false)
    })
})
