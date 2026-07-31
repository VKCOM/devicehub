/**
 * Mirror of the reverse-forward allow-list that the user's own adb server keeps
 * for our transport (AOSP `atransport::UpdateReverseConfig`, transport.cpp:1640).
 *
 * The user's server snoops every `reverse:` request before relaying it to us and
 * records `remote -> local`. Later, when we push an A_OPEN back at it, it checks
 * the service name against those `local` specs and calls LOG(FATAL) — killing
 * the user's adb server — for anything it does not recognise. So we must parse
 * with the same grammar and never open a reverse stream for a spec we have not
 * seen registered here.
 */

export type BindCommand     = {action: 'bind',        remote: string, local: string, devicePort: number}
export type UnbindCommand   = {action: 'unbind',      remote: string}
export type UnbindAllCommand= {action: 'unbind-all'}
export type ListCommand     = {action: 'list'}
export type UnknownCommand  = {action: 'unknown', name: string}
/**
 * A `forward:` request whose spec did not parse. AOSP answers this itself rather
 * than falling through to reverse_service's generic message, and quotes the spec
 * back with the `forward:`/`norebind:` prefixes already stripped (adb.cpp:1190).
 */
export type BadForwardCommand = {action: 'bad-forward', spec: string}
/**
 * A `killforward:` request whose spec is empty or has more than one piece. Same
 * split as `forward:`, but AOSP demands exactly one non-empty piece here
 * (adb.cpp:1184), and quotes the spec back without the `killforward:` prefix.
 */
export type BadKillforwardCommand = {action: 'bad-killforward', spec: string}
/** `norebind:` asked for a remote that is already bound (INSTALL_STATUS_CANNOT_REBIND). */
export type RebindRefusedCommand = {action: 'rebind-refused', remote: string}
/** Well-formed request we cannot serve: minirev can only bind a TCP port on the device. */
export type UnsupportedCommand   = {action: 'unsupported', remote: string}
/** `killforward:` named a remote nobody had bound (INSTALL_STATUS_LISTENER_NOT_FOUND). */
export type ListenerNotFoundCommand = {action: 'listener-not-found', remote: string}

export type ReverseCommand =
    | BindCommand
    | UnbindCommand
    | UnbindAllCommand
    | ListCommand
    | UnknownCommand
    | BadForwardCommand
    | BadKillforwardCommand
    | RebindRefusedCommand
    | UnsupportedCommand
    | ListenerNotFoundCommand

/** Parse `reverse:` service name, mirror the map, return the typed command. */
export class ReverseForwards {
    private byRemote = new Map<string, string>()

    /**
     * Parse the ADB service name (the full "reverse:..." string) and update the
     * map in-place.  Returns a discriminated union so callers can act on type.
     */
    exec(name: string): ReverseCommand {
        if (!name.startsWith('reverse:')) {
            return {action: 'unknown', name}
        }
        const rest = name.slice('reverse:'.length)

        if (rest === 'killforward-all') {
            this.byRemote.clear()
            return {action: 'unbind-all'}
        }

        if (rest === 'list-forward') {
            return {action: 'list'}
        }

        if (rest.startsWith('killforward:')) {
            const remote = rest.slice('killforward:'.length)
            // killforward: takes exactly one non-empty piece (adb.cpp:1183).
            // Like a malformed forward:, this is a failure AOSP reports itself,
            // with its own text — not the generic "not a reverse forwarding
            // command" it uses for a prefix it does not recognise at all.
            if (!remote || remote.includes(';')) {
                return {action: 'bad-killforward', spec: remote}
            }
            // remove_listener reports INSTALL_STATUS_LISTENER_NOT_FOUND when
            // nothing was bound; a silent success would hide the user's typo.
            if (!this.byRemote.delete(remote)) {
                return {action: 'listener-not-found', remote}
            }
            return {action: 'unbind', remote}
        }

        if (rest.startsWith('forward:')) {
            let spec = rest.slice('forward:'.length)
            // optional norebind: prefix
            let norebind = false
            if (spec.startsWith('norebind:')) {
                norebind = true
                spec = spec.slice('norebind:'.length)
            }
            // AOSP splits on ";" and demands exactly two non-empty pieces, with
            // the local spec not starting with '*' (adb.cpp:1188). Accepting a
            // third piece would register a local spec the user's own server never
            // snooped — and it LOG(FATAL)s on an A_OPEN it cannot match.
            //
            // This is a `bad-forward`, not an `unknown`: handle_forward_request
            // recognises the command and reports the failure itself, so the user
            // sees "bad forward: <spec>" rather than reverse_service's generic
            // fallback. The spec is quoted with the prefixes already stripped,
            // because AOSP has advanced its own pointer past them by this point.
            const pieces = spec.split(';')
            if (pieces.length !== 2 || !pieces[0] || !pieces[1] || pieces[1].startsWith('*')) {
                return {action: 'bad-forward', spec}
            }
            const [remote, local] = pieces
            if (norebind && this.byRemote.has(remote)) {
                // A locally connected device answers FAIL here
                // (INSTALL_STATUS_CANNOT_REBIND); the old target stays bound.
                return {action: 'rebind-refused', remote}
            }
            // minirev can only bind a TCP port on the device, so a well-formed
            // request for anything else has to be refused explicitly rather than
            // registered against a bogus port.
            const devicePort = portFromSpec(remote)
            if (!devicePort) {
                return {action: 'unsupported', remote}
            }
            this.byRemote.set(remote, local)
            return {action: 'bind', remote, local, devicePort}
        }

        return {action: 'unknown', name}
    }

    /** Return the `local` spec registered for `remote`, or undefined. */
    resolveLocal(remote: string): string | undefined {
        return this.byRemote.get(remote)
    }

    /** Check whether `local` is in the allow-list (used before sending A_OPEN). */
    isLocalConfigured(local: string): boolean {
        for (const v of this.byRemote.values()) {
            if (v === local) return true
        }
        return false
    }

    /** Current size (number of registered forwards). */
    get size(): number {
        return this.byRemote.size
    }

    entries(): IterableIterator<[string, string]> {
        return this.byRemote.entries()
    }
}

/**
 * Extract the numeric port from a `tcp:<port>` spec.
 * Returns 0 for anything we cannot bind on the device: a non-tcp spec, a
 * non-numeric port, or a port outside the valid 1-65535 range.
 */
function portFromSpec(spec: string): number {
    if (!spec.startsWith('tcp:')) {
        return 0
    }
    const digits = spec.slice(4)
    if (!/^\d+$/.test(digits)) {
        return 0
    }
    const port = Number(digits)
    return port >= 1 && port <= 65535 ? port : 0
}
