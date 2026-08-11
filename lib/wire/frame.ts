//
// Frame protocol for the ROUTER/DEALER transport.
//
// A message is a multipart ZMQ frame array. On transit, only the header frames
// are read; the Envelope body (last frame) is never decoded.
//
// Routing kind (frame 0):
//   "D" device-directed:  ["D", providerName, serial, ...replyPath, envelope]
//   "B" broadcast-to-app: ["B", selector, envelope]
//   "R" reply:            ["R", ...replyPath, envelope]
//
// reply-path is a LIFO stack: intermediate nodes push their incoming routingId
// onto the tail when forwarding UP, and pop from the tail when forwarding a
// reply DOWN. When the path is empty on an "R" message, the current node is the
// final recipient and the remaining frame is the body.
//

// The composite routing key. Device serials are NOT globally unique (emulators
// share e.g. "emulator-5554"), but (providerName, serial) is unique
// cluster-wide because a provider and all its devices are pinned to one
// processor and serials are unique within a single provider/host.
//
// NUL is used as the separator because it cannot appear in a providerName or
// serial.
const KEY_SEPARATOR = '\u0000'

export const deviceKey = (providerName: string, serial: string): string =>
    providerName + KEY_SEPARATOR + serial

export const KIND = {
    DEVICE: 'D',
    BROADCAST: 'B',
    REPLY: 'R',
    // EVENT: a device-originated message headed for its processor. A device
    // only ever speaks to its processor — intros, heartbeats, status updates
    // and group events all travel up as a single "E" kind. The processor
    // decides (by message type) whether to consume it (dbapi) or forward it to
    // the app side as a broadcast. Devices know nothing about the app-side
    // broadcast/proxy topology.
    EVENT: 'E',
    // Control plane (unit <-> proxy), no Envelope body:
    // ANNOUNCE: processor tells the proxy it owns a providerName.
    ANNOUNCE: 'A',
    // SUBSCRIBE_BROADCAST: a unit (websocket, log) registers to receive
    // broadcast-to-app events.
    SUBSCRIBE_BROADCAST: 'S',
    // HELLO: a processor identifies itself to the proxy exactly once, right
    // after its DEALER connects. Its ONLY purpose is to let the proxy tell a
    // processor apart from an app-side unit (api, websocket) so it can pick the
    // first processor to connect and hand it the startup INIT below. It is not
    // a heartbeat and is never repeated — the provider table is still built
    // from ANNOUNCE.
    HELLO: 'H',
    // INIT: the proxy's reply to the FIRST HELLO of its lifetime, carrying the
    // proxy's own start timestamp. The receiving processor compares it against
    // its own start time to decide whether it outlived the proxy and therefore
    // owns the startup presence reconciliation sweep. Sent to exactly one
    // processor, exactly once per proxy lifetime.
    INIT: 'I',
} as const

// Correlation ids are minted as `txn_<uuid>` by the transaction manager and
// carried in the Envelope.channel slot. This prefix is the single source of
// truth shared between the sender (transmanager) and the device wire logic.
export const CORRELATION_PREFIX = 'txn_'

// The broadcast selector meaning "all app-side receivers". Empty because the
// proxy fans a broadcast out to every registered receiver regardless.
export const BROADCAST_ALL = ''

export type Frames = Buffer[]

// Pre-allocated single-byte Buffers for each kind constant. Buffer.from()
// allocates a new object on every call; on the hot path (every heartbeat, every
// device event) that adds up to measurable GC pressure in the minor heap.
// These are module-level singletons — they are never mutated, only read by ZMQ.
const KIND_D = Buffer.from(KIND.DEVICE)
const KIND_E = Buffer.from(KIND.EVENT)
const KIND_R = Buffer.from(KIND.REPLY)
const KIND_B = Buffer.from(KIND.BROADCAST)
const KIND_A = Buffer.from(KIND.ANNOUNCE)
const KIND_H = Buffer.from(KIND.HELLO)
const KIND_I = Buffer.from(KIND.INIT)
// Reusable empty selector buffer for the common BROADCAST_ALL case.
const SELECTOR_ALL = Buffer.from(BROADCAST_ALL)

// Built by app-side (api) when addressing a command to a device. The reply-path
// starts empty; each intermediate node (proxy, processor) pushes its incoming
// routingId as it forwards up.
export const encodeDeviceFrame = (
    providerName: string,
    serial: string,
    envelope: Buffer
): Frames => [
    KIND_D,
    Buffer.from(providerName),
    Buffer.from(serial),
    envelope,
]

// A device-originated event for its processor: ["E", envelope]. The device
// never addresses the app directly; the processor consumes or forwards.
export const encodeEvent = (envelope: Buffer): Frames => [
    KIND_E,
    envelope,
]

// A reply travelling back down a reply-path: ["R", ...replyPath, envelope].
export const encodeReply = (replyPath: Frames, envelope: Buffer): Frames => [
    KIND_R,
    ...replyPath,
    envelope,
]

// A control-plane announce (processor -> proxy): ["A", providerName].
export const encodeAnnounce = (providerName: string): Frames => [
    KIND_A,
    Buffer.from(providerName),
]

// A one-shot processor->proxy identification frame: ["H"]. Sent once per
// processor lifetime, immediately after the DEALER connects.
export const encodeHello = (): Frames => [
    KIND_H,
]

// The proxy's one-shot startup handoff: ["I", startedAt]. startedAt is the
// proxy's process start time as decimal epoch-millis — a plain string frame,
// because the proxy/processor control plane carries no Envelope body.
export const encodeInit = (startedAt: number): Frames => [
    KIND_I,
    Buffer.from(String(startedAt)),
]

// A broadcast-to-app message: ["B", selector, envelope]. The selector defaults
// to BROADCAST_ALL (fan out to every registered receiver).
export const encodeBroadcast = (
    envelope: Buffer,
    selector: string = BROADCAST_ALL
): Frames => [
    KIND_B,
    selector === BROADCAST_ALL ? SELECTOR_ALL : Buffer.from(selector),
    envelope,
]

export interface ClassifiedFrames {
    // The sender routing identity when the frames came off a ROUTER (which
    // prepends it), else null (a DEALER strips it).
    sender: Buffer | null
    // The protocol kind (frame 0 of the message).
    kind: string
    // The protocol message WITHOUT the ROUTER-added identity, i.e. starting at
    // the kind frame: [kind, ...rest, body]. This is what every route*()
    // function consumes.
    message: Frames
}

// Classify one inbound multipart. The single axis that differs between call
// sites is whether a ROUTER prepended the sender identity as frame 0. Unifying
// it here removes the off-by-one slice differences that recur across the proxy,
// processor and device routing code.
export const classifyFrames = (
    frames: Frames,
    {routerPrepended}: {routerPrepended: boolean}
): ClassifiedFrames => {
    const sender = routerPrepended ? frames[0] : null
    const message = routerPrepended ? frames.slice(1) : frames
    return {sender, kind: message[0].toString(), message}
}

// Push the caller's incoming routingId onto the tail of the reply-path stack.
// The body is always the last frame, so the new id is inserted just before it.
// This is kind-agnostic: it only touches the tail of the array.
export const pushReplyPath = (frames: Frames, routingId: Buffer): Frames => {
    const out = frames.slice()
    out.splice(out.length - 1, 0, routingId)
    return out
}

export interface PoppedReply {
    // The routingId to send the reply to next, or null when this node is the
    // final recipient (reply-path exhausted).
    routingId: Buffer | null
    // The reply frames to forward on, with the popped id removed.
    frames: Frames
    // The Envelope body (always the last frame).
    body: Buffer
    // True when the reply-path was empty: this node is the final recipient.
    final: boolean
}

// Pop the tail routingId off a reply ("R") message. Reply layout is
// ["R", ...replyPath, body]; the tail id (frame before the body) is the newest
// pushed, so it comes off first (LIFO). When only ["R", body] remains the path
// is exhausted and the current node is the final recipient.
export const popReplyPath = (frames: Frames): PoppedReply => {
    const body = frames[frames.length - 1]
    // frame 0 is the "R" kind; a reply-path frame exists only when there are
    // more than 2 frames (kind + at least one id + body).
    if (frames.length <= 2) {
        return {routingId: null, frames, body, final: true}
    }
    const routingId = frames[frames.length - 2]
    const out = frames.slice(0, -2)
    out.push(body)
    return {
        routingId,
        frames: out,
        body,
        final: false,
    }
}
