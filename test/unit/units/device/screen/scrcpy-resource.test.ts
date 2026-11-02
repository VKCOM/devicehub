import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {describe, expect, it, vi} from 'vitest'
import {SCRCPY_VERSION} from '../../../../../lib/units/device/resources/scrcpy-release.js'
import {SCRCPY_CODEC_H264} from '../../../../../lib/units/device/resources/util/scrcpy-stream.js'

vi.mock('../../../../../lib/units/device/support/adb.js', () => ({default: {consume() {}}}))
// The server binary is only pushed, never read: any existing file will do
vi.mock('../../../../../lib/util/pathutil.js', () => ({root: () => import.meta.filename}))

const scrcpy = (await import('../../../../../lib/units/device/resources/scrcpy.js')).default

// What scrcpy-server writes first on its video socket
const codec = Buffer.alloc(4)
codec.writeUInt32BE(SCRCPY_CODEC_H264)
const session = Buffer.alloc(12)
session.writeUInt32BE(0x80000000, 0)
session.writeUInt32BE(720, 4)
session.writeUInt32BE(1280, 8)
const config = Buffer.concat([Buffer.from([0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]), Buffer.from('sps')])

const fakeAdb = (refusals: number) => {
    const calls = {shell: [] as string[], openLocal: [] as string[], push: [] as string[]}
    const device = {
        push: async(_src: string, dest: string) => {
            calls.push.push(dest)
            // Like @u4/adbkit: push() resolves once the transfer has already ended,
            // so a listener for 'end' attached afterwards never fires
            const transfer = Object.assign(new EventEmitter(), {waitForEnd: async() => {}})
            transfer.emit('end')
            return transfer
        },
        shell: async(cmd: string) => {
            calls.shell.push(cmd)
            return new PassThrough()
        },
        openLocal: async(address: string) => {
            calls.openLocal.push(address)
            if (calls.openLocal.length <= refusals) {
                throw new Error('closed')
            }
            // The server has written everything before anyone listens
            const socket = new PassThrough()
            socket.end(Buffer.concat([codec, session, config]))
            return socket
        }
    }
    return {adb: {getDevice: () => device}, calls}
}

describe('scrcpy resource', () => {
    it('starts the server and hands over the stream from its first packet', async() => {
        const {adb, calls} = fakeAdb(2)
        const resource = await scrcpy.invoke({serial: 'serial'}, adb)
        expect(resource.available).toBe(true)
        expect(calls.push).toEqual([`/data/local/tmp/devicehub-scrcpy-server-${SCRCPY_VERSION}.jar`])

        const items: any[] = []
        const started = await resource.start({maxSize: 1280, maxFps: 30, bitRate: 4000000}, (item: any) => items.push(item))
        await new Promise(resolve => started.once('end', resolve))

        const [cmd] = calls.shell
        expect(cmd).toContain(`com.genymobile.scrcpy.Server ${SCRCPY_VERSION} `)
        expect(cmd).toContain('max_size=1280')
        expect(cmd).toContain('video_bit_rate=4000000')
        expect(cmd).toContain('audio=false')
        expect(cmd).toContain('control=false')
        // Retried until the server listened, on the socket named after its scid
        const scid = /scid=([0-9a-f]{8})/.exec(cmd)![1]
        expect(calls.openLocal).toEqual(Array(3).fill(`localabstract:scrcpy_${scid}`))

        expect(items.map(item => item.type)).toEqual(['codec', 'session', 'packet'])
        expect(items[2]).toMatchObject({config: true})
    })

    it('gives up when the server never listens', async() => {
        const {adb} = fakeAdb(Infinity)
        const resource = await scrcpy.invoke({serial: 'serial'}, adb)
        await expect(resource.start({maxSize: 1280, maxFps: 30, bitRate: 4000000}, () => {})).rejects.toThrow('closed')
    }, 15000) // retries for 10 s before giving up
})
