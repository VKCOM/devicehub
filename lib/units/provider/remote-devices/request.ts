/*
 * Body of `POST /api/v1/remote-devices`. Only `host` and `port` are required;
 * every other field may be omitted, null or empty.
 */

export interface ConnectRequest {
    host: string
    port: number
    /* Shown to the user as `adb connect <connectUrl>` instead of the provider's own URL */
    connectUrl?: string
    /* Shown to the user as is, replacing the whole `adb connect ...` command */
    connectCommand?: string
    silent: boolean
    /* Hides the site header on the silent control page, e.g. to embed it in an iframe. Silent devices only */
    hideHeader: boolean
    /* Users allowed to take a silent device; empty allows everyone */
    emails: string[]
    /* Origin group the device is placed into. Makes the device non-silent */
    groupId?: string
    /* Seconds of inactivity before an owned device is released */
    idleTtl?: number
    webhook?: string
}

export class ValidationError extends Error {}

const isAbsent = (value: unknown) => value === undefined || value === null || value === ''

const optionalString = (value: unknown) => isAbsent(value) ? undefined : String(value).trim() || undefined

const isTrue = (value: unknown) => value === true || value === 'true'

const parsePort = (value: unknown) => {
    const port = Number(value)
    if (isAbsent(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ValidationError('"port" is required: an integer between 1 and 65535')
    }
    return port
}

const parseIdleTtl = (value: unknown) => {
    if (isAbsent(value)) {
        return undefined
    }

    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds < 0) {
        throw new ValidationError('"idleTtl" must be a non-negative number of seconds')
    }
    return seconds
}

/* A single email or a list of them */
const parseEmails = (value: unknown) => {
    if (isAbsent(value)) {
        return []
    }

    const emails = (Array.isArray(value) ? value : [value])
        .filter((email): email is string => typeof email === 'string')
        .map(email => email.trim())
        .filter(Boolean)

    return [...new Set(emails)]
}

export const parseConnectRequest = (body: any): ConnectRequest => {
    const host = optionalString(body?.host)
    if (!host) {
        throw new ValidationError('"host" is required')
    }

    const port = parsePort(body.port)
    const groupId = optionalString(body.groupId)

    // A grouped device is controlled by the group system: never silent, emails and hideHeader do not apply
    const silent = !groupId && isTrue(body.silent)

    const connectUrl = optionalString(body.connectUrl)
    const connectCommand = optionalString(body.connectCommand)
    if (connectUrl && connectCommand) {
        throw new ValidationError('"connectUrl" and "connectCommand" are mutually exclusive')
    }
    // The UI tells them apart by whitespace: a command is shown as is, a URL after `adb connect`
    if (connectUrl && /\s/.test(connectUrl)) {
        throw new ValidationError('"connectUrl" must not contain whitespace, use "connectCommand" for a full command')
    }
    if (connectCommand && !/\s/.test(connectCommand)) {
        throw new ValidationError('"connectCommand" must be a full command, e.g. "adb connect 10.0.0.5:5555"')
    }

    return {
        host,
        port,
        connectUrl,
        connectCommand,
        silent,
        hideHeader: silent && isTrue(body.hideHeader),
        emails: silent ? parseEmails(body.emails) : [],
        groupId,
        idleTtl: parseIdleTtl(body.idleTtl),
        webhook: optionalString(body.webhook)
    }
}
