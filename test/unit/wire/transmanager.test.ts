import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {TransactionManager} from '../../../lib/wire/transmanager.ts'
import {GetPresentDevices, TransactionDoneMessage, TransactionProgressMessage} from '../../../lib/wire/wire.ts'
import {Envelope} from '../../../lib/wire/wire.ts'
import {Any} from '../../../lib/wire/google/protobuf/any.ts'

// A minimal fake AppTransport: records device commands sent and lets tests emit
// replies the way the real AppTransport does (a 'message' event carrying the
// reply's correlationId as the channel and the Envelope body).
class FakeTransport {
    sent: Array<{providerName: string; serial: string; envelope: Buffer}> = []
    private handler: ((channel: string, data: Buffer) => void) | null = null

    sendCommand(providerName: string, serial: string, envelope: Uint8Array) {
        this.sent.push({providerName, serial, envelope: Buffer.from(envelope)})
    }

    on(event: string, fn: (channel: string, data: Buffer) => void) {
        if (event === 'message') {
            this.handler = fn
        }
        return this
    }

    // Simulate AppTransport emitting a reply: ('message', channel, body).
    deliver(channel: string, data: Buffer) {
        this.handler?.(channel, data)
    }
}

// Build a TransactionDoneMessage reply Envelope, carrying the correlationId in
// the Envelope.channel slot (how a reply is correlated to its request).
const buildReply = (correlationId: string, success: boolean, body?: object) =>
    Buffer.from(Envelope.toBinary({
        message: Any.pack({
            source: 'serial-1',
            seq: 0,
            success,
            data: success ? 'success' : 'fail',
            body: body ? JSON.stringify(body) : undefined,
        }, TransactionDoneMessage),
        channel: correlationId,
    }))

// A reply whose payload lives in the `data` field (how ConnectStart/Install
// carry the url / result string), with no JSON body.
const buildReplyWithData = (correlationId: string, success: boolean, data: string) =>
    Buffer.from(Envelope.toBinary({
        message: Any.pack({
            source: 'serial-1',
            seq: 0,
            success,
            data,
        }, TransactionDoneMessage),
        channel: correlationId,
    }))

// A progress reply (how shell/install stream their output/progress before the
// final done). Carried on the same reply-path as the done, correlated by
// Envelope.channel.
const buildProgress = (correlationId: string, seq: number, data: string, progress = 0) =>
    Buffer.from(Envelope.toBinary({
        message: Any.pack({
            source: 'serial-1',
            seq,
            data,
            progress,
        }, TransactionProgressMessage),
        channel: correlationId,
    }))

describe('TransactionManager', () => {
    let transport: FakeTransport
    let tm: TransactionManager

    beforeEach(() => {
        vi.useFakeTimers()
        transport = new FakeTransport()
        tm = new TransactionManager(transport as any)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('sends one device command carrying a fresh correlation id', () => {
        tm.runTransaction('provider-a', 'serial-1', GetPresentDevices, {})

        expect(transport.sent).toHaveLength(1)
        const {providerName, serial, envelope} = transport.sent[0]
        expect(providerName).toBe('provider-a')
        expect(serial).toBe('serial-1')
        // The envelope must carry a correlationId in its channel slot so the
        // reply can be matched back.
        const decoded = Envelope.fromBinary(envelope)
        expect(decoded.channel).toBeTruthy()
    })

    const correlationIdOfLastSend = () => {
        const {envelope} = transport.sent[transport.sent.length - 1]
        return Envelope.fromBinary(envelope).channel!
    }

    it('resolves with {success, data, body} when a matching reply arrives', async () => {
        const promise = tm.runTransaction('p', 's', GetPresentDevices, {})
        const correlationId = correlationIdOfLastSend()

        transport.deliver(correlationId, buildReply(correlationId, true, {devices: ['s1', 's2']}))

        await expect(promise).resolves.toEqual({
            success: true,
            data: 'success',
            body: {devices: ['s1', 's2']},
        })
    })

    it('exposes the reply `data` field (e.g. a connect url) to the resolved value', async () => {
        const promise = tm.runTransaction('p', 's', GetPresentDevices, {})
        const correlationId = correlationIdOfLastSend()

        // ConnectStart/Install replies carry their payload (url, result string)
        // in the `data` field, not `body`.
        transport.deliver(correlationId, buildReplyWithData(correlationId, true, 'ws://device:1234'))

        await expect(promise).resolves.toEqual({
            success: true,
            data: 'ws://device:1234',
            body: {},
        })
    })

    it('rejects with {success, data, body} when the reply signals failure', async () => {
        const promise = tm.runTransaction('p', 's', GetPresentDevices, {})
        const correlationId = correlationIdOfLastSend()

        transport.deliver(correlationId, buildReply(correlationId, false, {reason: 'nope'}))

        await expect(promise).rejects.toEqual({
            success: false,
            data: 'fail',
            body: {reason: 'nope'},
        })
    })

    it('rejects with a timeout error and cleans up the pending entry', async () => {
        const promise = tm.runTransaction('p', 's', GetPresentDevices, {}, {timeout: 1000})
        const correlationId = correlationIdOfLastSend()

        const assertion = expect(promise).rejects.toThrow('Timeout when running transaction')
        await vi.advanceTimersByTimeAsync(1000)
        await assertion

        // A late reply after timeout must be a no-op (entry already removed).
        expect(() => transport.deliver(correlationId, buildReply(correlationId, true, {devices: []})))
            .not.toThrow()
    })

    it('streams progress replies to onProgress before resolving on done', async () => {
        const progress: Array<{data?: string; progress?: number; seq: number}> = []
        const promise = tm.runTransaction('p', 's', GetPresentDevices, {}, {
            onProgress: (data, prog, seq) => progress.push({data, progress: prog, seq}),
        })
        const correlationId = correlationIdOfLastSend()

        // shell/install stream their output as progress messages...
        transport.deliver(correlationId, buildProgress(correlationId, 0, 'line-0', 10))
        transport.deliver(correlationId, buildProgress(correlationId, 1, 'line-1', 50))
        // ...then finalize with a done.
        transport.deliver(correlationId, buildReply(correlationId, true, {}))

        await expect(promise).resolves.toEqual({success: true, data: 'success', body: {}})
        expect(progress).toEqual([
            {data: 'line-0', progress: 10, seq: 0},
            {data: 'line-1', progress: 50, seq: 1},
        ])
    })

    it('does not require onProgress: progress replies are harmless without it', async () => {
        const promise = tm.runTransaction('p', 's', GetPresentDevices, {})
        const correlationId = correlationIdOfLastSend()

        expect(() => transport.deliver(correlationId, buildProgress(correlationId, 0, 'ignored')))
            .not.toThrow()
        transport.deliver(correlationId, buildReply(correlationId, true, {}))

        await expect(promise).resolves.toEqual({success: true, data: 'success', body: {}})
    })

    it('routes progress only to its own transaction (no cross-talk)', async () => {
        const p1: string[] = []
        const p2: string[] = []
        const promise1 = tm.runTransaction('p', 's', GetPresentDevices, {}, {
            onProgress: (data) => p1.push(data ?? ''),
        })
        const id1 = correlationIdOfLastSend()
        const promise2 = tm.runTransaction('p', 's', GetPresentDevices, {}, {
            onProgress: (data) => p2.push(data ?? ''),
        })
        const id2 = correlationIdOfLastSend()

        transport.deliver(id1, buildProgress(id1, 0, 'for-1'))
        transport.deliver(id2, buildProgress(id2, 0, 'for-2'))
        transport.deliver(id1, buildReply(id1, true, {}))
        transport.deliver(id2, buildReply(id2, true, {}))

        await Promise.all([promise1, promise2])
        expect(p1).toEqual(['for-1'])
        expect(p2).toEqual(['for-2'])
    })

    it('handles two concurrent transactions on one transport independently', async () => {
        const p1 = tm.runTransaction('p', 's', GetPresentDevices, {})
        const id1 = correlationIdOfLastSend()
        const p2 = tm.runTransaction('p', 's', GetPresentDevices, {})
        const id2 = correlationIdOfLastSend()

        expect(id1).not.toBe(id2)

        // Reply to the second one first: they must not cross-resolve.
        transport.deliver(id2, buildReply(id2, true, {devices: ['second']}))
        transport.deliver(id1, buildReply(id1, true, {devices: ['first']}))

        await expect(p1).resolves.toEqual({success: true, data: 'success', body: {devices: ['first']}})
        await expect(p2).resolves.toEqual({success: true, data: 'success', body: {devices: ['second']}})
    })
})
