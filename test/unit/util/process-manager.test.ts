import {afterEach, describe, expect, it, vi} from 'vitest'
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
    let errors: string[]
    /* What the owner answers when asked whether to restart a dead worker */
    let restart: boolean

    const setup = (env: Record<string, string> = {}) => {
        children = []
        previousAliveAtSpawn = []
        errors = []
        restart = true
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
            },
            onError: (_id, _context, error) => { errors.push(error.message) },
            shouldRestart: () => restart
        }, {killTimeout: 5000, resourcePool: pool})
    }

    const startWorker = async() => {
        await manager.create('serial', {}, {resourceCount: 2})
        expect(await manager.start('serial')).toBe(true)
        return children[0]
    }

    afterEach(async() => {
        // Forget the workers first: a manager restarts a worker killed behind its back
        await manager.cleanup()
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

    describe('a worker that dies on its own', () => {
        const restarted = () => vi.waitFor(() => {
            expect(children).toHaveLength(2)
            expect(manager.get('serial')?.state).toBe('running')
        }, {timeout: 5000})

        it.each([0, 1])('is reported and restarted when it exits with code %i', async code => {
            setup()
            const child = await startWorker()

            child.send({type: 'crash', code})

            await restarted()
            expect(errors).toEqual([`Exit code "${code}" (undefined)`])
        })

        it('is reported and restarted when it is killed by someone else', async() => {
            setup()
            const child = await startWorker()

            child.kill('SIGKILL')

            await restarted()
            expect(errors).toEqual(['Exit code "-1" (killed with SIGKILL)'])
        })

        it('is left waiting when its owner does not want it restarted, until started again', async() => {
            setup()
            const child = await startWorker()
            restart = false

            child.send({type: 'crash'})

            await vi.waitFor(() => expect(manager.get('serial')?.state).toBe('waiting'), {timeout: 5000})
            expect(children).toHaveLength(1)
            expect(errors).toEqual(['Exit code "1" (undefined)'])

            expect(await manager.start('serial')).toBe(true)
            expect(children).toHaveLength(2)
        })

        it('is not restarted once stopped while waiting for its restart', async() => {
            setup()
            const child = await startWorker()

            child.send({type: 'crash'})
            await vi.waitFor(() => expect(errors).toHaveLength(1))
            await manager.stop('serial')

            await new Promise(resolve => setTimeout(resolve, 2500)) // past the restart delay
            expect(children).toHaveLength(1)
        })

        it('is not restarted twice when started again while waiting for its restart', async() => {
            setup()
            const child = await startWorker()

            child.send({type: 'crash'})
            await vi.waitFor(() => expect(errors).toHaveLength(1))
            expect(await manager.start('serial', true)).toBe(true)

            await new Promise(resolve => setTimeout(resolve, 2500)) // past the restart delay
            expect(children).toHaveLength(2)
            expect(isAlive(children[1])).toBe(true)
        })

        it('is not when it is stopped on purpose', async() => {
            setup()
            await startWorker()

            await manager.stop('serial')

            await new Promise(resolve => setTimeout(resolve, 2500)) // past the restart delay
            expect(children).toHaveLength(1)
            expect(errors).toEqual([])
        })
    })
})
