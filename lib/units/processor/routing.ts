//
// Pure routing logic for the processor (no ZMQ I/O — testable in isolation).
//
// The processor sits between the proxy and the devices. It has TWO inputs with
// DIFFERENT framing:
//
//   - from the proxy over a DEALER: [kind, ...rest, body]
//     (the DEALER has already stripped any identity frame);
//   - from a device over its own ROUTER: [deviceKeyId, kind, ...rest, body]
//     (the ROUTER prepends the sender deviceKey as frame 0).
//
// Each entry point returns Send[] tagged with the channel to send on:
//   via 'router' -> down to a device (target = deviceKey);
//   via 'dealer' -> up to the proxy (no target; the single DEALER link is implicit).
//
// The processor never decodes the Envelope body and, when moving a command DOWN
// to a device, it does NOT touch the reply-path — the return path to the proxy
// is carried implicitly by the single DEALER link.
//
import {KIND, deviceKey, encodeAnnounce, classifyFrames} from '../../wire/frame.js'

export interface Send {
    // 'router'  -> down to a device: router.send([target, ...frames]);
    // 'dealer'  -> up to the proxy:  dealer.send(frames);
    // 'consume' -> decode + dispatch locally (dbapi / forward-to-app). The
    //              raw Envelope body is in frames[0]; `sender` is the device
    //              routing identity so a reply can be addressed back to it.
    // 'init'    -> the proxy's one-shot startup handoff; frames[0] is the
    //              proxy's start timestamp as a decimal string.
    via: 'router' | 'dealer' | 'consume' | 'init'
    target?: Buffer
    sender?: Buffer
    frames: Buffer[]
}

export class ProcessorRouting {
    // The set of providerNames this processor owns. The proxy routes a device
    // command here only after learning this ownership via an ANNOUNCE, so the
    // processor must (re)announce every known provider whenever its DEALER link
    // to the proxy (re)connects — otherwise a restarted proxy has an empty table.
    private providers = new Set<string>()

    // Record that this processor owns a providerName (learned from a device
    // introduction). Idempotent. Returns true only when the provider was newly
    // learned, so the caller can announce it to the proxy exactly once instead
    // of on every device introduction.
    learnProvider(providerName: string): boolean {
        if (this.providers.has(providerName)) {
            return false
        }
        this.providers.add(providerName)
        return true
    }

    // One ANNOUNCE frame per known provider, to be sent up the DEALER link on
    // (re)connect. [A, providerName]
    announceFrames(): Send[] {
        return [...this.providers].map(providerName => ({
            via: 'dealer' as const,
            frames: encodeAnnounce(providerName),
        }))
    }

    // Route a message arriving from the proxy (over the DEALER). Framing is
    // [kind, ...] with no identity frame.
    routeFromProxy(frames: Buffer[]): Send[] {
        // From the proxy over a DEALER: no prepended identity.
        const {kind, message} = classifyFrames(frames, {routerPrepended: false})

        switch (kind) {
            case KIND.DEVICE:
                return this.routeDeviceDown(message)
            case KIND.INIT:
                // [I, startedAt] — surface the timestamp frame for the glue to
                // parse and act on. Arrives at most once per proxy lifetime.
                return [{via: 'init', frames: message.slice(1)}]
            default:
                return []
        }
    }

    // Route a message arriving from a device (over the ROUTER). Framing is
    // [deviceKeyId, kind, ...] with the sender deviceKey prepended by the ROUTER.
    //
    // A device only ever emits two kinds:
    //   R -> a reply headed for the app; forward it up to the proxy unchanged.
    //   E -> a device event; hand it to the glue to decode + dispatch locally
    //        (the processor decides, by message type, whether to consume it in
    //        dbapi or forward it to the app side).
    routeFromDevice(frames: Buffer[]): Send[] {
        // From a device over the ROUTER: frame 0 is the sender deviceKey.
        const {sender, kind, message} = classifyFrames(frames, {routerPrepended: true})

        switch (kind) {
            case KIND.REPLY:
                // [R, ...replyPath, body] — forward up to the proxy unchanged.
                return [{via: 'dealer', frames: message}]
            case KIND.EVENT:
                // [E, body] — surface the raw body for local dispatch.
                return [{via: 'consume', sender: sender!, frames: message.slice(1)}]
            default:
                return []
        }
    }

    private routeDeviceDown(frames: Buffer[]): Send[] {
        // [D, providerName, serial, ...replyPath, body]
        const providerName = frames[1].toString()
        const serial = frames[2].toString()
        return [{
            via: 'router',
            target: Buffer.from(deviceKey(providerName, serial)),
            // forward as-is: the processor does not push its own identity.
            frames,
        }]
    }
}
