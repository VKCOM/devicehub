/**
 * The feature list of our A_CNXN banner.
 *
 * A client uses a feature only when the device's banner lists it and so does its
 * own build (CanUseFeature, transport.cpp:1253-1255). Without the list it falls
 * back to the oldest protocols: `adb shell` with no exit status and stderr mixed
 * into stdout, `adb push`/`pull` with v1 sync and no compression, `adb install`
 * by pushing to /data/local/tmp and running pm. So we list what the device
 * lists, as far as this bridge passes it through intact, plus the transport
 * features we implement ourselves.
 */

/**
 * Device features that need nothing from the bridge: each changes only the
 * service names the client opens or the bytes inside a stream, and both pass
 * through untouched (connection.ts relays the name, service.ts the bytes).
 * Names and meaning: transport.cpp:81-105.
 */
const PASSED_THROUGH = new Set([
    // `shell,v2,...:`: exit status, separate stderr, window size (shell_protocol.h)
    'shell_v2',
    // `exec:cmd package install`: streamed install without a copy on /data/local/tmp
    'cmd',
    // sync STA2/LST2 and LIS2/DNT2 (file_sync_protocol.h)
    'stat_v2',
    'ls_v2',
    // client-side behaviour of `adb push` (client/file_sync_client.cpp)
    'fixed_push_mkdir',
    'fixed_push_symlink_timestamp',
    // `adb install` of .apex packages
    'apex',
    // `abb:` and `abb_exec:` services (Android Binder Bridge)
    'abb',
    'abb_exec',
    // `adb remount` run as a shell service
    'remount_shell',
    // `track-app:` service, and its extended form
    'track_app',
    'app_info',
    // sync SND2/RCV2, optionally compressed, and push --dry-run
    'sendrecv_v2',
    'sendrecv_v2_brotli',
    'sendrecv_v2_lz4',
    'sendrecv_v2_zstd',
    'sendrecv_v2_dry_run_send',
    // `dev-raw:` service
    'devraw',
])

/** Several A_WRTE in flight per stream (flow.ts) */
export const FEATURE_DELAYED_ACK = 'delayed_ack'

/**
 * Transport features the bridge implements on the `adb connect` link itself,
 * whatever the device has: they are about this link, not the services behind it.
 */
export const BRIDGE_FEATURES = [FEATURE_DELAYED_ACK]

/**
 * What we advertise for a device advertising `device`: the part of it we pass
 * through, then our own. Anything else the device lists is either about its
 * link to the provider's adb server (delayed_ack there is not ours), host-only
 * (openscreen_mdns, server_status, devicetracker_proto_format, libusb,
 * push_sync), or newer than this list; leaving it out costs the client a
 * fallback, listing it could cost a broken stream.
 */
export function advertisedFeatures(device: Iterable<string>): string[] {
    const features: string[] = []
    for (const feature of device) {
        if (PASSED_THROUGH.has(feature) && !features.includes(feature)) {
            features.push(feature)
        }
    }
    return [...features, ...BRIDGE_FEATURES]
}
