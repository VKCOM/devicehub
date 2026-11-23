import {describe, expect, it, vi} from 'vitest'
import {InputQueue} from '../../../../lib/units/device/support/input-queue.js'

const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>(r => {
        resolve = r
    })
    return {promise, resolve}
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('InputQueue', () => {
    it('runs instant work right away while nothing is on its way', () => {
        const queue = new InputQueue(vi.fn())
        const work = vi.fn()

        queue.run(work)

        expect(work).toHaveBeenCalledOnce()
        expect(queue.isBusy).toBe(false)
    })

    it('keeps a key pressed during slow text after that text', async() => {
        const queue = new InputQueue(vi.fn())
        const order: string[] = []
        const shell = deferred()

        queue.text('привет', async text => {
            order.push(`text:${text}`)
            await shell.promise
        })
        queue.run(() => order.push('backspace'))

        await flush()
        expect(order).toEqual(['text:привет'])
        expect(queue.isBusy).toBe(true)

        shell.resolve()
        await flush()
        expect(order).toEqual(['text:привет', 'backspace'])
        expect(queue.isBusy).toBe(false)
    })

    it('joins text typed while a slow call is on its way into one next call', async() => {
        const queue = new InputQueue(vi.fn())
        const sent: string[] = []
        const first = deferred()

        queue.text('п', async text => {
            sent.push(text)
            await first.promise
        })
        await flush()
        queue.text('р', async text => {
            sent.push(text)
        })
        queue.text('и', async() => {
            throw new Error('a joined text has no call of its own')
        })

        first.resolve()
        await flush()
        expect(sent).toEqual(['п', 'ри'])
    })

    it('reports a failed call and goes on with the next input', async() => {
        const onError = vi.fn()
        const queue = new InputQueue(onError)
        const work = vi.fn()

        queue.text('x', async() => {
            throw new Error('shell failed')
        })
        queue.run(work)

        await flush()
        expect(onError).toHaveBeenCalledOnce()
        expect(work).toHaveBeenCalledOnce()
    })
})
