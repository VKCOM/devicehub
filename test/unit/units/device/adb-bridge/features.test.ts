import {describe, it, expect} from 'vitest'
import {advertisedFeatures} from '../../../../../lib/units/device/plugins/adb-bridge/features.ts'

// What `adb features` lists for adbd on the emulator (API 32) and the Huawei P60 (API 31)
const CURRENT = ['shell_v2', 'cmd', 'stat_v2', 'ls_v2', 'fixed_push_mkdir', 'apex', 'abb',
    'fixed_push_symlink_timestamp', 'abb_exec', 'remount_shell', 'track_app', 'sendrecv_v2',
    'sendrecv_v2_brotli', 'sendrecv_v2_lz4', 'sendrecv_v2_zstd', 'sendrecv_v2_dry_run_send', 'openscreen_mdns']

describe('advertised features', () => {
    it("passes a current device's services and sync features through, plus delayed_ack", () => {
        expect(advertisedFeatures(CURRENT)).toEqual([
            ...CURRENT.filter(feature => feature !== 'openscreen_mdns'), 'delayed_ack'
        ])
    })

    // delayed_ack on the device's side is its link to the provider's adb
    // server; ours is advertised because we implement it on this link
    it("never takes the device's delayed_ack for its own", () => {
        expect(advertisedFeatures(['shell_v2', 'delayed_ack'])).toEqual(['shell_v2', 'delayed_ack'])
    })

    // An old device (or a server that cannot tell) gets the legacy protocols,
    // as it would directly
    it('advertises only its own features for a device without any', () => {
        expect(advertisedFeatures([])).toEqual(['delayed_ack'])
    })

    // Android 7 (API 24-25) adbd: shell_v2 and cmd only
    it('keeps the smaller set of an older device', () => {
        expect(advertisedFeatures(['shell_v2', 'cmd'])).toEqual(['shell_v2', 'cmd', 'delayed_ack'])
    })

    it('leaves out what it does not know or what only a host has', () => {
        expect(advertisedFeatures(['shell_v2', 'some_future_thing', 'push_sync', 'libusb', 'server_status']))
            .toEqual(['shell_v2', 'delayed_ack'])
    })
})
