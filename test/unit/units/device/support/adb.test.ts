import net from 'node:net'
import {describe, expect, it, vi} from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async(importOriginal) => ({
    ...await importOriginal<typeof import('node:child_process')>(),
    execFile
}))

const {createWorkerAdbClient} = await import('../../../../../lib/units/device/support/adb.js')

/* A port nothing listens on, as when the ADB server went down */
const closedPort = async() => {
    const server = net.createServer()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address() as net.AddressInfo
    await new Promise(resolve => server.close(resolve))
    return port
}

describe('device worker ADB client', () => {
    // The provider owns the ADB server: workers starting their own race it and each other
    it('never starts the ADB server itself', async() => {
        const client = createWorkerAdbClient({adbHost: '127.0.0.1', adbPort: await closedPort()})

        await expect(client.listDevices()).rejects.toThrow(/ADB server 127\.0\.0\.1:\d+ is not running/)
        expect(execFile).not.toHaveBeenCalled()
    })
})
