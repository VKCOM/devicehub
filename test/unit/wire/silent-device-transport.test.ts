import {EventEmitter} from 'node:events'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {DeviceTransport} from '../../../lib/wire/device-transport.js'
import {Any} from '../../../lib/wire/google/protobuf/any.js'
import {encodeDeviceFrame} from '../../../lib/wire/frame.js'
import * as wire from '../../../lib/wire/wire.js'
import wireutil from '../../../lib/wire/util.js'
import {resolveAdbPort} from '../../../lib/units/base-device/support/processor-config.js'

class Dealer extends EventEmitter {
    frames: Buffer[][] = []
    async send(frames: Buffer[]) { this.frames.push(frames) }
    async close() {}
    async flush() {}
}
const closing: DeviceTransport[] = []
afterEach(async () => { await Promise.all(closing.splice(0).map(t => t.close())); vi.useRealTimers(); vi.restoreAllMocks() })
const create = (silent = true) => {
    const dealer = new Dealer()
    const transport = new DeviceTransport(dealer as any, silent ? {providerName: 'p', serial: 's'} : undefined)
    closing.push(transport)
    return {dealer, transport}
}
const command = (dealer: Dealer, type: any, message: any, context?: wire.SilentCommandContext) => {
    const frames = encodeDeviceFrame('p', 's', Buffer.from(wire.Envelope.toBinary({
        message: Any.pack(type.create(message), type), channel: 'txn_test', silentCommand: context
    })))
    frames.splice(3, 0, Buffer.from('app'))
    dealer.emit('frames', frames)
}

describe('silent worker transport', () => {
    it('sends one snapshot per state change and suppresses unchanged state reports', () => {
        const {dealer, transport} = create()
        const battery = wireutil.pack(wire.BatteryEvent, wire.BatteryEvent.create({serial: 's', level: 42}))
        transport.send([wireutil.global, battery])
        expect(dealer.frames).toHaveLength(1)
        expect(Any.contains(wire.Envelope.fromBinary(dealer.frames[0].at(-1)!).message!, wire.SilentDeviceSnapshot)).toBe(true)
        const stringify = vi.spyOn(JSON, 'stringify')
        transport.send([wireutil.global, battery])
        expect(dealer.frames).toHaveLength(1)
        expect(stringify).not.toHaveBeenCalled()
        transport.send([wireutil.global, wireutil.pack(wire.BatteryEvent, wire.BatteryEvent.create({serial: 's', level: 43}))])
        expect(dealer.frames).toHaveLength(2)
        // Handshakes must still reach the processor even when their state is unchanged.
        for (let i = 0; i < 2; i++) transport.send([wireutil.global, wireutil.pack(wire.DeviceReadyMessage, {serial: 's', channel: 'solo'})])
        const messages = dealer.frames.map(f => wire.Envelope.fromBinary(f.at(-1)!).message!)
        expect(messages.filter(m => Any.contains(m, wire.DeviceReadyMessage))).toHaveLength(2)
    })
    it('does not decode log payloads to build a snapshot', () => {
        const {dealer, transport} = create()
        const event = wireutil.pack(wire.DeviceLogcatEntryMessage, wire.DeviceLogcatEntryMessage.create({serial: 's', message: 'log'}))
        const unpack = vi.spyOn(Any, 'unpack')
        transport.send([wireutil.global, event])
        expect(unpack).not.toHaveBeenCalled()
        expect(dealer.frames).toHaveLength(1)
    })
    it('marks even events emitted before introduction and never changes ordinary envelopes', () => {
        for (const silent of [true, false]) {
            const {dealer, transport} = create(silent)
            transport.send([wireutil.global, wireutil.pack(wire.DeviceHeartbeatMessage, {serial: 's'})])
            const envelope = wire.Envelope.fromBinary(dealer.frames[0].at(-1)!)
            expect(!!envelope.silentEvent).toBe(silent)
        }
    })
    it('answers Describe on the reply path and blocks unleased commands before any plugin sees them', async () => {
        const {dealer, transport} = create()
        const receive = vi.fn()
        transport.on('message', receive)
        command(dealer, wire.DescribeSilentDevice, {actor: {email: 'user', name: 'user', group: 'g'}})
        await vi.waitFor(() => expect(dealer.frames.some(f => f[0].toString() === 'R')).toBe(true))
        expect(dealer.frames.find(f => f[0].toString() === 'R')![1].toString()).toBe('app')
        command(dealer, wire.TouchDownMessage, {})
        expect(receive).not.toHaveBeenCalled()
        const result = Any.unpack(wire.Envelope.fromBinary(dealer.frames.at(-1)!.at(-1)!).message!, wire.TransactionDoneMessage)
        expect(result.data).toBe('not_owner')
    })
    it('normal devices reject the silent Describe endpoint explicitly', async () => {
        const {dealer} = create(false)
        command(dealer, wire.DescribeSilentDevice, {actor: {email: 'user', name: 'user', group: 'g'}})
        const reply = Any.unpack(wire.Envelope.fromBinary(dealer.frames.at(-1)!.at(-1)!).message!, wire.TransactionDoneMessage)
        expect(reply.data).toBe('not_silent')
    })
    it('resolves a configured port over E/D without using an unknown txn_ reply channel', async () => {
        const {dealer, transport} = create(false)
        const pending = resolveAdbPort(transport)
        const frames = dealer.frames.at(-1)!
        expect(frames[0].toString()).toBe('E')
        const request = Any.unpack(wire.Envelope.fromBinary(frames.at(-1)!).message!, wire.ResolveAdbPortRequest)
        dealer.emit('frames', encodeDeviceFrame('p', 's', Buffer.from(wireutil.pack(wire.ResolveAdbPortResponse, {
            requestId: request.requestId, adbPort: 7400
        }))))
        await expect(pending).resolves.toBe(7400)
        expect(transport.listenerCount('message')).toBe(0)
    })
    it('cancels pending configuration lookup when the device closes', async () => {
        const {transport} = create(false)
        const pending = resolveAdbPort(transport)
        const assertion = expect(pending).rejects.toThrow('closed')
        await transport.close()
        await assertion
    })
    it('closes the dealer even if releasing worker resources fails', async () => {
        const {dealer, transport} = create()
        const close = vi.spyOn(dealer, 'close')
        vi.spyOn(transport.silent!, 'close').mockRejectedValueOnce(new Error('cleanup failed'))
        await expect(transport.close()).rejects.toThrow('cleanup failed')
        expect(close).toHaveBeenCalledOnce()
    })

})
