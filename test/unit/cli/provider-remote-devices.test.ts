import {afterEach, describe, expect, it, vi} from 'vitest'
import yargs from 'yargs'

const {provider, device, fork} = vi.hoisted(() => ({
    provider: vi.fn(async(options: any) => options),
    device: vi.fn(async(options: any) => options),
    fork: vi.fn()
}))
vi.mock('../../../lib/units/provider/index.js', () => ({default: provider}))
vi.mock('../../../lib/units/device/index.js', () => ({default: device}))
vi.mock('child_process', () => ({fork}))

import * as providerCommand from '../../../lib/cli/provider/index.js'
import * as deviceCommand from '../../../lib/cli/device/index.js'

afterEach(() => vi.clearAllMocks())

const startProvider = async(flags: string[] = []) => {
    await yargs([
        'provider', ...flags,
        '--name', 'test-provider',
        '--public-ip', '127.0.0.1',
        '--storage-url', 'http://127.0.0.1:7100',
        '--connect-processor', 'tcp://127.0.0.1:7114',
        '--group-timeout', '900',
        '--silent-allowed-email', 'global@example.test'
    ]).command(providerCommand).exitProcess(false).strict().parseAsync()

    return provider.mock.calls[0][0]
}

/* Runs the worker CLI on the arguments the provider forked it with */
const workerOptions = async(options: any, overrides?: unknown) => {
    options.fork('10.0.0.5:5555', [7400, 7401], 'tcp://127.0.0.1:7114', overrides)
    // child_process serializes CLI argument values to strings.
    const workerArgs = fork.mock.calls[0][1].map(String)
    await yargs(workerArgs).command(deviceCommand).exitProcess(false).strict().parseAsync()
    return device.mock.calls[0][0]
}

describe('provider CLI: remote device API', () => {
    it('keeps the API disabled by default', async() => {
        expect((await startProvider()).api).toBeNull()
    })

    it('enables the API', async() => {
        const options = await startProvider(['--enable-api', '--api-host', '127.0.0.1', '--api-port', '7131'])
        expect(options.api).toEqual({host: '127.0.0.1', port: 7131})
    })

    it('uses the global settings for regular devices', async() => {
        const worker = await workerOptions(await startProvider())
        expect(worker).toMatchObject({
            silent: false,
            silentAllowedEmail: ['global@example.test'],
            groupTimeout: 900_000,
            connectUrlPattern: '${publicIp}:${publicPort}'
        })
        expect(worker.groupId).toBeUndefined()
    })

    it('applies the per-device settings of a silent API device', async() => {
        const worker = await workerOptions(await startProvider(), {
            silent: true,
            silentAllowedEmail: ['a@example.test', 'b@example.test'],
            groupTimeout: 60,
            connectUrlPattern: 'adb.example.test:15555'
        })
        expect(worker).toMatchObject({
            silent: true,
            silentAllowedEmail: ['a@example.test', 'b@example.test'],
            groupTimeout: 60_000,
            connectUrlPattern: 'adb.example.test:15555',
            serial: '10.0.0.5:5555',
            provider: 'test-provider'
        })
    })

    it('places a grouped API device into its group, never silent', async() => {
        const worker = await workerOptions(await startProvider(['--silent']), {
            silent: false,
            silentAllowedEmail: [],
            groupId: 'group-42'
        })
        expect(worker).toMatchObject({silent: false, silentAllowedEmail: [], groupId: 'group-42', groupTimeout: 900_000})
    })
})

describe('provider CLI: worker flags', () => {
    it('does not lock rotation unless asked to', async() => {
        expect((await workerOptions(await startProvider())).lockRotation).toBe(false)
    })

    it('locks rotation when asked to', async() => {
        expect((await workerOptions(await startProvider(['--lock-rotation']))).lockRotation).toBe(true)
    })
})
