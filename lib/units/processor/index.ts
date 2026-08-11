//
// processor: the mediator between the proxy (app side) and the devices.
//
// Transport:
//   - a DEALER connected to the proxy (stable routingId = the processor name);
//   - a ROUTER bound for devices/providers.
//
// Framing differs per input:
//   - from the proxy over the DEALER: [kind, ...]           (identity stripped)
//   - from a device over the ROUTER:  [deviceKeyId, kind..] (identity prepended)
//
// The device DEALER sets ZMQ_ROUTING_ID = deviceKey (providerName\0serial), so
// the ROUTER-added frame 0 identifies the sending device by its deviceKey. That
// identity is the single source of truth for (providerName, serial) — device
// messages such as heartbeats only carry the bare serial.
//
// Pure routing decisions live in ProcessorRouting; presence lives in
// PresenceTracker; this unit is the ZMQ I/O glue plus the ported dbapi handlers.
//
import Promise from 'bluebird'
import {MessageType} from '@protobuf-ts/runtime'
import logger from '../../util/logger.js'
import wire from '../../wire/index.js'
import wireutil from '../../wire/util.js'
import db from '../../db/index.js'
import dbapi from '../../db/models/all/index.js'
import lifecycle from '../../util/lifecycle.js'
import srv from '../../util/srv.js'
import UserModel from '../../db/models/user/index.js'
import DeviceModel from '../../db/models/device/index.js'
import {RouterSocket, DealerSocket} from '../../util/zmqsocket.js'
import {encodeDeviceFrame, encodeAnnounce, encodeBroadcast, encodeHello, deviceKey} from '../../wire/frame.js'
import {Envelope} from '../../wire/wire.js'
import {Any} from '../../wire/google/protobuf/any.js'
import {ProcessorRouting} from './routing.js'
import {PresenceTracker, type PresenceEvent} from './presence.js'
import {
    UserChangeMessage,
    GroupChangeMessage,
    DeviceGroupChangeMessage,
    GroupUserChangeMessage,
    DeviceHeartbeatMessage,
    DeviceLogMessage,
    TransactionProgressMessage,
    TransactionDoneMessage,
    TransactionTreeMessage,
    InstallResultMessage,
    DeviceLogcatEntryMessage,
    TemporarilyUnavailableMessage,
    UpdateRemoteConnectUrl,
    InstalledApplications,
    DeviceIntroductionMessage,
    InitializeIosDeviceState,
    DevicePresentMessage,
    DeviceAbsentMessage,
    DeviceStatusMessage,
    DeviceReadyMessage,
    JoinGroupByAdbFingerprintMessage,
    JoinGroupByVncAuthResponseMessage,
    ConnectStartedMessage,
    ConnectStoppedMessage,
    JoinGroupMessage,
    LeaveGroupMessage,
    DeviceIdentityMessage,
    AirplaneModeEvent,
    BatteryEvent,
    DeviceBrowserMessage,
    ConnectivityEvent,
    PhoneStateEvent,
    RotationEvent,
    CapabilitiesMessage,

    UpdateIosDevice,
    SdkIosVersion,
    SizeIosDevice,
    DeviceTypeMessage,
    DeleteDevice,
    GetServicesAvailabilityMessage,
    DeviceRegisteredMessage,
    GetPresentDevices,
    DeviceGetIsInOrigin,
    GetDeadDevices,
    DeviceIosIntroductionMessage,
} from '../../wire/wire.js'

interface Options {
    name: string
    endpoints: {
        // proxy DEALER endpoint(s) to connect to (SRV-resolvable).
        proxy: string[]
        // ROUTER bind address for devices/providers.
        deviceRouter: string
    }
    heartbeatTimeout: number
    publicIp: string
}

// wireutil.pack/envelope return a Uint8Array; the ZMQ layer wants Buffer.
const buf = (u: Uint8Array): Buffer => Buffer.from(u)

const _deviceKeyCache = new Map<string, {providerName: string; serial: string}>()

const parseDeviceKey = (identity: Buffer): {providerName: string; serial: string} => {
    const s = identity.toString()
    const cached = _deviceKeyCache.get(s)
    if (cached) {
        return cached
    }
    const sep = s.indexOf('\u0000')
    const parsed = sep < 0
        ? {providerName: '', serial: s}
        : {providerName: s.slice(0, sep), serial: s.slice(sep + 1)}
    _deviceKeyCache.set(s, parsed)
    return parsed
}

const dropDeviceKey = (identity: Buffer) => {
    _deviceKeyCache.delete(identity.toString())
}


export default db.ensureConnectivity(async(options: Options) => {
    const log = logger.createLogger('processor')
    if (options.name) {
        logger.setGlobalIdentifier(options.name)
    }

    await db.connect()

    const routing = new ProcessorRouting()
    const presence = new PresenceTracker(options.heartbeatTimeout)

    // Processor boot time. Used to identify device presence records that predate
    // this instance — candidates for the startup reconciliation sweep.
    const startedAt = Date.now()

    // deviceKeys seeded by the startup sweep. On expiry, re-verified against
    // Mongo before marking absent — another processor may have adopted them.
    // Removed on the first real heartbeat, promoting the device to the normal
    // TTL path.
    const sweptKeys = new Set<string>()

    // ROUTER (bind) — devices and providers connect here.
    const deviceRouter = new RouterSocket()
    await deviceRouter.bind(options.endpoints.deviceRouter)
    log.info('processor device ROUTER listening on %s', options.endpoints.deviceRouter)

    // DEALER (connect) — the single link up to the proxy.
    const proxyDealer = new DealerSocket({routingId: options.name, probeRouter: true})
    await Promise.all(options.endpoints.proxy.map(async(endpoint: string) => {
        try {
            return await srv.resolve(endpoint).then((records) =>
                srv.attempt(records, (record) => {
                    log.info('Proxy dealer connected to "%s"', record.url)
                    proxyDealer.connect(record.url)
                    return true
                })
            )
        }
        catch (err: any) {
            log.fatal('Unable to connect to proxy endpoint %s', err?.message)
            lifecycle.fatal()
        }
    }))

    // (Re)announce every known provider up to the proxy. Providers are otherwise
    // announced once each, when first learned — NOT on every heartbeat — so this
    // bulk re-announce is what a restarted proxy relies on to relearn them.
    const announce = () => {
        for (const send of routing.announceFrames()) {
            proxyDealer.send(send.frames).catch((err: any) =>
                log.warn('Announce failed: %s', err?.message))
        }
    }

    // Identify ourselves to the proxy as a processor, exactly once. This is the
    // only way the proxy can tell a processor apart from an app-side unit, so it
    // can elect the first processor to connect and hand it the startup INIT. It
    // carries no state and is never repeated.
    const hello = () => {
        proxyDealer.send(encodeHello()).catch((err: any) =>
            log.warn('Hello to proxy failed: %s', err?.message))
    }

    // Send a protocol message DOWN to a device by its routing identity.
    //
    // Both processor-originated messages (registration, probe, auto-group, reply
    // to a device request) and proxy-forwarded app commands use [D, providerName,
    // serial, ...replyPath, envelope]. Processor-originated messages carry an
    // EMPTY reply-path (there is no app node waiting for a reply). The
    // (providerName, serial) are derived from the routing identity (deviceKey).
    const sendToDevice = (identity: Buffer, envelope: Uint8Array) => {
        const {providerName, serial} = parseDeviceKey(identity)
        const frames = encodeDeviceFrame(providerName, serial, buf(envelope))
        deviceRouter.send([identity, ...frames]).catch((err: any) =>
            log.warn('Undeliverable to device %s: %s', identity.toString(), err?.message))
    }

    // Forward an event to the app side, wrapped as a broadcast (B). The proxy
    // fans it out to the registered broadcast receivers (websocket, log, ...).
    const sendToApp = (envelope: Uint8Array) => {
        proxyDealer.send(encodeBroadcast(buf(envelope)))
            .catch((err: any) => log.warn('Broadcast to app failed: %s', err?.message))
    }

    // Per-request reply helper. wireutil.reply() packs a TransactionDoneMessage
    // without a channel; we re-inject the request's correlationId so the
    // requester's TransactionManager can match it. Minted fresh per message to
    // avoid interleaving seq counters across concurrent requests.
    const makeReply = (correlationId?: string): ReturnType<typeof wireutil.reply> => {
        const inner = wireutil.reply(correlationId ?? wireutil.global)
        const withChannel = (packed: Uint8Array): Uint8Array => {
            if (!correlationId) {
                return packed
            }
            const decoded = Envelope.fromBinary(buf(packed))
            return Envelope.toBinary({...decoded, channel: correlationId})
        }
        return {
            okay: (data, body) => withChannel(inner.okay(data, body)),
            fail: (data, body) => withChannel(inner.fail(data, body)),
            progress: (data, progress) => withChannel(inner.progress(data, progress)),
        }
    }

    // Presence changes are app-bound broadcasts carrying the bare serial.
    presence.on('present', ({serial}) => {
        log.info('Device "%s" is present', serial)
        const now = Date.now()
        dbapi.setDevicePresent(serial, now)
        sendToApp(wireutil.pack(DevicePresentMessage, {serial, presenceChangedAt: now}))
    })

    presence.on('absent', (event) => {
        // Evict the parse-cache entry so the key doesn't linger after the device is gone.
        _deviceKeyCache.delete(deviceKey(event.providerName, event.serial))

        // A swept device is one we seeded from Mongo at startup and never heard
        // from. Its expiry needs a Mongo re-check, so it is batched separately.
        if (sweptKeys.delete(deviceKey(event.providerName, event.serial))) {
            enqueueSweptAbsent(event)
            return
        }
        log.info('Reaping device "%s" due to heartbeat timeout', event.serial)

        const now = Date.now()
        dbapi.setDeviceAbsent(event.serial, now)
        sendToApp(wireutil.pack(DeviceAbsentMessage, {serial: event.serial, presenceChangedAt: now}))
    })

    // ---- startup presence reconciliation ------------------------------------
    //
    // Devices left present by a previous processor instance would stay present
    // forever — the old processor is gone, so nobody is watching their
    // heartbeats. The proxy elects exactly one processor per proxy lifetime to
    // clean this up by sending it an INIT with the proxy's start time.
    //
    // We only act when the proxy is OLDER than us: that means we are a fresh
    // generation, so any presence predating our boot belongs to a processor that
    // is no longer running. If the proxy started after us, it restarted while we
    // were alive, and the presence records are ours — live TTLs already cover them.
    let swept = false

    const runStartupSweep = async (proxyStartedAt: number) => {
        if (swept) {
            return
        }
        swept = true

        if (proxyStartedAt >= startedAt) {
            log.info('Skipping startup presence sweep: proxy (%s) is not older than us (%s)',
                proxyStartedAt, startedAt)
            return
        }

        const stale = await DeviceModel.loadDevicesPresentBefore(new Date(startedAt))
        log.info('Startup presence sweep: watching %s device(s) present before our boot', stale.length)

        for (const device of stale) {
            const providerName = device.provider?.name ?? ''
            sweptKeys.add(deviceKey(providerName, device.serial))
            // silent: we are NOT claiming these devices, so no 'present'
            // broadcast. time = startedAt so they all expire together exactly one
            // heartbeatTimeout after our boot — a live device will heartbeat to us
            // before then and get promoted off sweptKeys.
            presence.bump(providerName, device.serial, startedAt, {silent: true})
        }
    }

    // Swept devices all share time = startedAt, so TTLSet drops them in one
    // synchronous pass. Batch the expiries to collapse N Mongo round-trips into
    // a single re-check query.
    let sweptBatch: PresenceEvent[] = []
    let sweptFlush: NodeJS.Immediate | null = null

    const enqueueSweptAbsent = (event: PresenceEvent) => {
        sweptBatch.push(event)
        sweptFlush ??= setImmediate(() => {
            sweptFlush = null
            const batch = sweptBatch
            sweptBatch = []
            flushSweptAbsent(batch).catch((err: any) =>
                log.error('Startup presence sweep failed: %s', err?.message || err))
        })
    }

    const flushSweptAbsent = async (batch: PresenceEvent[]) => {
        // Re-run the exact same filter: a device is only genuinely absent if its
        // presence STILL predates our boot. If another processor adopted it, the
        // introduction bumped presenceChangedAt past the cutoff — leave it alone.
        const stillStale = await DeviceModel.loadDevicesPresentBefore(new Date(startedAt))
        const stillStaleSerials = new Set(stillStale.map((d: any) => d.serial))

        for (const {serial} of batch) {
            if (!stillStaleSerials.has(serial)) {
                log.info('Device "%s" was adopted by another processor, leaving it present', serial)
                continue
            }
            log.info('Marking device "%s" absent: no heartbeat since processor start', serial)
            const presenceChangedAt = Date.now()
        // Unlike the live reap path, we persist directly here instead of
        // relying on the broadcast looping back — we already own this write.
            await dbapi.setDeviceAbsent(serial, presenceChangedAt)
            sendToApp(wireutil.pack(DeviceAbsentMessage, {serial, presenceChangedAt}))
        }
    }

    // The dbapi handlers dispatch table.
    //
    // Handlers are async (they await Mongo) and a single processor serves many
    // devices concurrently, so each handler receives an immutable per-message
    // context `ctx` instead of reading shared mutable state:
    //   ctx.sendToDevice(envelope) — reply to THIS message's sender;
    //   ctx.data                   — the raw inbound Envelope, for verbatim
    //                                forwarding to the app side.
    // The dispatch table is built once; ctx is the only per-message value.
    interface DeviceContext {
        sendToDevice: (envelope: Uint8Array) => void
        data: Buffer
        // A reply sequencer scoped to THIS request, bound to the request's own
        // correlationId (Envelope.channel) so the requester's TransactionManager
        // can match it, and to the request's serial as the source. Never share a
        // sequencer across messages — concurrent device requests would interleave
        // their seq counters and mis-address one another.
        reply: ReturnType<typeof wireutil.reply>
    }
    type DeviceHandler<T extends object> = (ctx: DeviceContext, message: T) => void | PromiseLike<void>

    // Handlers that only forward the inbound Envelope verbatim to the app side.
    const forwardToApp: DeviceHandler<any> = (ctx) => sendToApp(ctx.data)

    // Register a handler keyed by its protobuf type url, plus its MessageType so
    // we can decode the payload once per message.
    const handlers = new Map<string, {type: MessageType<any>; handle: DeviceHandler<any>}>()
    const on = <T extends object>(type: MessageType<T>, handle: DeviceHandler<T>) => {
        handlers.set(Any.typeNameToUrl(type.typeName), {type, handle})
    }

    on(UserChangeMessage, forwardToApp)
    on(GroupChangeMessage, forwardToApp)
    on(DeviceGroupChangeMessage, forwardToApp)
    on(GroupUserChangeMessage, forwardToApp)
    on(DeviceLogMessage, forwardToApp)
    on(TransactionProgressMessage, forwardToApp)
    on(TransactionDoneMessage, forwardToApp)
    on(TransactionTreeMessage, forwardToApp)
    on(InstallResultMessage, forwardToApp)
    on(DeviceLogcatEntryMessage, forwardToApp)
    on(TemporarilyUnavailableMessage, forwardToApp)
    on(UpdateRemoteConnectUrl, forwardToApp)
    on(InstalledApplications, forwardToApp)
    on(DeviceHeartbeatMessage, () => {
        // presence bump is handled up front from the routing identity.
    })
    on(DeviceIntroductionMessage, async (ctx, message) => {
        await dbapi.saveDeviceInitialState(message.serial, message)
        ctx.sendToDevice(wireutil.pack(DeviceRegisteredMessage, {serial: message.serial}))
        sendToApp(ctx.data)
    })
    on(DeviceIosIntroductionMessage, async (ctx, message) => {
        await dbapi.saveIosDeviceInitialState(options.publicIp, message)
        ctx.sendToDevice(wireutil.pack(DeviceRegisteredMessage, {serial: message.serial}))
    })
    on(InitializeIosDeviceState, (ctx, message) => {
        dbapi.initializeIosDeviceState(options.publicIp, message)
    })
    on(DevicePresentMessage, async (ctx, message) => {
        await dbapi.setDevicePresent(message.serial, message.presenceChangedAt)
        sendToApp(ctx.data)
    })
    on(DeviceAbsentMessage, async (ctx, message) => {
        await dbapi.setDeviceAbsent(message.serial, message.presenceChangedAt)
        sendToApp(ctx.data)
    })
    on(DeviceStatusMessage, (ctx, message) => {
        dbapi.saveDeviceStatus(message.serial, message.status)
        sendToApp(ctx.data)
    })
    on(DeviceReadyMessage, async (ctx, message) => {
        await dbapi.setDeviceReady(message.serial, message.channel)
        ctx.sendToDevice(wireutil.envelope(new wire.ProbeMessage()))
        sendToApp(ctx.data)
    })
    on(JoinGroupByAdbFingerprintMessage, async (ctx, message) => {
        try {
            const user = await UserModel.lookupUserByAdbFingerprint(message.fingerprint)
            if (user) {
                ctx.sendToDevice(wireutil.envelope(
                    new wire.AutoGroupMessage(
                        new wire.OwnerMessage(user.email, user.name, user.group),
                        message.fingerprint)))
                return
            }
            sendToApp(wireutil.pack(JoinGroupByAdbFingerprintMessage, message))
        } catch (err: any) {
            log.error('Unable to lookup user by ADB fingerprint "%s": %s', message.fingerprint, err?.message)
        }
    })
    on(JoinGroupByVncAuthResponseMessage, async (ctx, message) => {
        try {
            const user = await dbapi.lookupUserByVncAuthResponse(message.response, message.serial)
            if (user) {
                ctx.sendToDevice(wireutil.envelope(
                    new wire.AutoGroupMessage(
                        new wire.OwnerMessage(user.email, user.name, user.group),
                        message.response)))
                return
            }
            sendToApp(wireutil.pack(JoinGroupByVncAuthResponseMessage, message))
        } catch (err: any) {
            log.error('Unable to lookup user by VNC auth response "%s": %s', message.response, err?.message)
        }
    })
    on(ConnectStartedMessage, async (ctx, message) => {
        await dbapi.setDeviceConnectUrl(message.serial, message.url)
        sendToApp(ctx.data)
    })
    on(ConnectStoppedMessage, async (ctx, message) => {
        await dbapi.unsetDeviceConnectUrl(message.serial)
        sendToApp(ctx.data)
    })
    on(JoinGroupMessage, async (ctx, message) => {
        await Promise.all([ // @ts-ignore
            dbapi.setDeviceState(message.serial, message),
            dbapi.sendEvent(`device_${message.usage || 'use'}`
                , {}
                , {deviceSerial: message.serial, userEmail: message.owner!.email, groupId: message.owner!.group}
                , Date.now()
            )
        ])
        sendToApp(ctx.data)
    })
    on(LeaveGroupMessage, async (ctx, message) => {
        await Promise.all([
            dbapi.setDeviceState(message.serial, {owner: null, usage: null, timeout: 0}),
            dbapi.sendEvent('device_leave'
                , {}
                , {deviceSerial: message.serial, userEmail: message.owner!.email, groupId: message.owner!.group}
                , Date.now()
            )
        ])
        sendToApp(ctx.data)
    })
    on(DeviceGetIsInOrigin, async (ctx, message) => {
        const device = await DeviceModel.loadDeviceBySerial(message.serial)
        const isInOrigin = device ? device.group.id === device.group.origin : false
        ctx.sendToDevice(ctx.reply.okay('success', {isInOrigin}))
    })
    on(DeviceIdentityMessage, (ctx, message) => {
        dbapi.saveDeviceIdentity(message.serial, message)
        sendToApp(ctx.data)
    })
    on(AirplaneModeEvent, (ctx, message) => {
        dbapi.setDeviceAirplaneMode(message.serial, message.enabled)
        sendToApp(ctx.data)
    })
    on(BatteryEvent, (ctx, message) => {
        dbapi.setDeviceBattery(message.serial, message)
        sendToApp(ctx.data)
    })
    on(DeviceBrowserMessage, (ctx, message) => {
        dbapi.setDeviceBrowser(message.serial, message)
        sendToApp(ctx.data)
    })
    on(ConnectivityEvent, (ctx, message) => {
        dbapi.setDeviceConnectivity(message.serial, message)
        sendToApp(ctx.data)
    })
    on(PhoneStateEvent, (ctx, message) => {
        dbapi.setDevicePhoneState(message.serial, message)
        sendToApp(ctx.data)
    })
    on(RotationEvent, (ctx, message) => {
        dbapi.setDeviceRotation(message)
        sendToApp(ctx.data)
    })
    on(CapabilitiesMessage, (ctx, message) => {
        dbapi.setDeviceCapabilities(message)
        sendToApp(ctx.data)
    })
    on(UpdateIosDevice, (ctx, message) => {
        dbapi.updateIosDevice(message)
    })
    on(SdkIosVersion, (ctx, message) => {
        dbapi.setDeviceIosVersion(message)
    })
    on(SizeIosDevice, (ctx, message) => {
        dbapi.sizeIosDevice(message.id, message.height, message.width, message.scale, message.url)
        sendToApp(ctx.data)
    })
    on(DeviceTypeMessage, (ctx, message) => {
        dbapi.setDeviceType(message.serial, message.type)
    })
    on(GetServicesAvailabilityMessage, (ctx, message) => {
        dbapi.setDeviceServicesAvailability(message.serial, message)
        sendToApp(ctx.data)
    })
    on(GetPresentDevices, async (ctx) => {
        const devices = await DeviceModel.loadPresentDevices()
            .then(devices => devices.map(d => d.serial))
        ctx.sendToDevice(ctx.reply.okay('success', {devices}))
    })
    on(GetDeadDevices, async (ctx, message) => {
        const deadDevices = await DeviceModel.getDeadDevice(message.time)
        ctx.sendToDevice(ctx.reply.okay('success', {deadDevices}))
    })
    on(DeleteDevice, async (ctx, message) => {
        DeviceModel.deleteDevice(message.serial)
    })

    // Dispatch one already-decoded device Envelope to the matching handler with
    // a context bound to the sending device. Types nobody consumes are
    // forwarded to the app side verbatim.
    const dispatchDeviceMessage = (senderId: Buffer, envelope: Buffer, decoded: Envelope) => {
        const typeUrl = decoded.message?.typeUrl
        if (!typeUrl) {
            return
        }
        // reply is a lazy getter: most handlers never call it, so allocation is
        // deferred to first access. defineProperty caches the result inline.
        const ctx: DeviceContext = {
            sendToDevice: (out) => sendToDevice(senderId, out),
            data: envelope,
            get reply() {
                const r = makeReply(decoded.channel)
                Object.defineProperty(this, 'reply', {value: r, writable: false})
                return r
            },
        }
        const entry = handlers.get(typeUrl)
        if (!entry) {
            // Unknown/unconsumed type: forward to the app side as-is.
            sendToApp(envelope)
            return
        }
        const message = Any.unpack(decoded.message!, entry.type)
        Promise.resolve(entry.handle(ctx, message)).catch((err: any) =>
            log.error('Handler for %s failed: %s', entry.type.typeName, err?.message || err))
    }

    // Type urls of the presence-relevant messages, precomputed once so the hot
    // path compares raw strings without per-message typeUrl->name conversions.
    const INTRO_URL = Any.typeNameToUrl(DeviceIntroductionMessage.typeName)
    const INTRO_IOS_URL = Any.typeNameToUrl(DeviceIosIntroductionMessage.typeName)
    const HEARTBEAT_URL = Any.typeNameToUrl(DeviceHeartbeatMessage.typeName)

    // A device introduced itself or is heartbeating: keep presence fresh. The
    // (providerName, serial) come from the routing identity, not the payload.
    const bumpPresence = (identity: Buffer, kind: 'intro' | 'heartbeat') => {
        const {providerName, serial} = parseDeviceKey(identity)

        // A real message from the device promotes it off the startup sweep list:
        // it is demonstrably alive and talking to US, so from here on its normal
        // TTL governs it and no Mongo re-check is needed on expiry.
        const wasSwept = sweptKeys.delete(deviceKey(providerName, serial))

    // Announce ONLY when the provider is newly learned. learnProvider returns
    // true exactly once per provider, so the proxy's provider->processor table
    // is updated once and not on every heartbeat.
        if (routing.learnProvider(providerName)) {
            announceProvider(providerName)
        }

        if (kind === 'intro' || wasSwept) {
            // introduce() drops-silent then does a non-silent bump, which calls
            // create() and emits 'insert' → DevicePresentMessage. This is also
            // correct for a swept device whose first real message is a heartbeat:
            // TTLSet already contains the silent seed, so plain bump() would
            // just relink the existing item without emitting 'insert'.
            presence.introduce(providerName, serial, Date.now())
        }
        else {
            presence.bump(providerName, serial, Date.now())
        }
    }

    // Send a single [A, providerName] up to the proxy. Idempotent on the proxy.
    const announceProvider = (providerName: string) => {
        proxyDealer.send(encodeAnnounce(providerName))
            .catch((err: any) => log.warn('Announce failed: %s', err?.message))
    }

    // Inbound from devices (ROUTER): routing decisions in ProcessorRouting.
    //   via 'dealer'  -> reply headed up to the proxy, forward as-is;
    //   via 'consume' -> device event, decode + dispatch locally.
    deviceRouter.on('frames', (frames: Buffer[]) => {
        try {
            for (const send of routing.routeFromDevice(frames)) {
                if (send.via === 'dealer') {
                    proxyDealer.send(send.frames).catch((err: any) =>
                        log.warn('Reply to app failed: %s', err?.message))
                }
                else if (send.via === 'consume' && send.sender) {
                    consumeDeviceEvent(send.sender, send.frames[0])
                }
            }
        }
        catch (err: any) {
            log.error('Device routing error: %s', err?.message || err)
        }
    })

    // Handle a device event ([E] body): bump presence from the routing
    // identity, then dispatch by message type.
    const consumeDeviceEvent = (senderId: Buffer, envelope: Buffer) => {
        // The processor consumes some types (dbapi) and forwards the rest to
        // the app side. Decode once and reuse for the presence peek and the
        // dispatch below.
        const decoded = Envelope.fromBinary(envelope)
        const typeUrl = decoded.message?.typeUrl

        // The (providerName, serial) for presence come from the routing
        // identity, not the message body (a heartbeat only carries serial).
        if (typeUrl === INTRO_URL || typeUrl === INTRO_IOS_URL) {
            bumpPresence(senderId, 'intro')
        }
        else if (typeUrl === HEARTBEAT_URL) {
            bumpPresence(senderId, 'heartbeat')
        }

    // Dispatch with a context bound to THIS sender so concurrent devices
    // never cross-address each other's replies.
        dispatchDeviceMessage(senderId, envelope, decoded)
    }

    // Inbound from the proxy (DEALER): [kind, ...] — device-directed commands.
    proxyDealer.on('frames', (frames: Buffer[]) => {
        try {
            for (const send of routing.routeFromProxy(frames)) {
                if (send.via === 'router' && send.target) {
                    deviceRouter.send([send.target, ...send.frames]).catch((err: any) =>
                        log.warn('Undeliverable to %s: %s', send.target!.toString(), err?.message))
                }
                else if (send.via === 'init') {
                    // [I, startedAt] — we are the elected processor for the
                    // startup presence reconciliation sweep.
                    const proxyStartedAt = Number(send.frames[0]?.toString())
                    if (!Number.isFinite(proxyStartedAt)) {
                        log.warn('Ignoring INIT with unparseable timestamp "%s"', send.frames[0]?.toString())
                        continue
                    }
                    runStartupSweep(proxyStartedAt).catch((err: any) =>
                        log.error('Startup presence sweep failed: %s', err?.message || err))
                }
            }
        }
        catch (err: any) {
            log.error('Proxy routing error: %s', err?.message || err)
        }
    })

    // Announce anything we already know (none at startup); from then on each
    // provider is announced once, when it is first learned.
    announce()

    // Identify ourselves as a processor. If we are the first one on this proxy,
    // it answers with an INIT and we take on the startup presence sweep.
    hello()

    // A restarted proxy starts with an empty routing table. Since providers are
    // announced only once (when first learned), reconnect replays both the full
    // provider set and HELLO so the new proxy can elect an INIT recipient.
    proxyDealer.watchReconnect().on('reconnect', () => {
        log.info('Reconnected to the proxy, replaying announcements')
        announce()
        hello()
    })

    const shutdown = () => {
        presence.stop()
        ;[deviceRouter, proxyDealer].forEach((sock) => {
            try {
                sock.close()
            }
            catch (err: any) {
                log.error('Error while closing socket "%s"', err?.message)
            }
        })
    }

    lifecycle.observe(shutdown)

    // Returned so callers/tests can drive teardown explicitly (mirrors the proxy
    // unit). Leaking a processor leaks its presence TTL timers, which keep firing
    // absent reaps long after the caller is done with it.
    return {deviceRouter, proxyDealer, presence, routing, shutdown}
})
