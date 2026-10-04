import {afterEach, describe, expect, it, vi} from 'vitest'
import yargs from 'yargs'

const {provider, device, fork} = vi.hoisted(() => ({
    provider: vi.fn(async (options: any) => options),
    device: vi.fn(async (options: any) => options),
    fork: vi.fn()
}))
vi.mock('../../../lib/units/ios-provider/index.js', () => ({default: provider}))
vi.mock('../../../lib/units/ios-device/index.js', () => ({default: device}))
vi.mock('child_process', () => ({fork}))

import * as providerCommand from '../../../lib/cli/ios-provider/index.js'
import * as deviceCommand from '../../../lib/cli/ios-device/index.js'

afterEach(() => vi.clearAllMocks())

describe('iOS provider CLI to worker options', () => {
    it.each([
        {flags: ['--silent', 'true'], silent: true},
        {flags: ['--silent=true'], silent: true},
        {flags: ['--silent'], silent: true},
        {flags: ['--silent', 'false'], silent: false},
        {flags: [], silent: false}
    ])('preserves $flags through the worker CLI', async ({flags, silent}) => {
        await yargs([
            'ios-provider', ...flags,
            '--provider', 'test-provider',
            '--public-ip', '127.0.0.1',
            '--storage-url', 'http://127.0.0.1:7100',
            '--connect-processor', 'tcp://127.0.0.1:7114',
            '--silent-allowed-email', 'first@example.test',
            '--silent-allowed-email', 'second@example.test'
        ]).command(providerCommand).exitProcess(false).strict().parseAsync()

        const options = provider.mock.calls[0][0]
        options.fork('test-serial', {
            wdaPort: 8100, screenPort: 8101, screenListenPort: 18000,
            connectPort: 18200, isSimulator: false
        })
        // child_process serializes CLI argument values to strings.
        const workerArgs = fork.mock.calls[0][1].map(String)
        await yargs(workerArgs).command(deviceCommand).exitProcess(false).strict().parseAsync()

        expect(device).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            silent,
            silentAllowedEmail: ['first@example.test', 'second@example.test'],
            provider: 'test-provider', serial: 'test-serial'
        }))
    })
})
