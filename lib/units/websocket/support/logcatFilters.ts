export interface LogcatFilter {
    tag: string
    priority: number
}

const isLogcatFilter = (value: unknown): value is LogcatFilter => {
    if (!value || typeof value !== 'object') {
        return false
    }
    const filter = value as Partial<LogcatFilter>
    return typeof filter.tag === 'string' &&
        typeof filter.priority === 'number' &&
        Number.isInteger(filter.priority) &&
        filter.priority >= 0 &&
        filter.priority <= 0xffffffff
}

// The UI sends one {tag, priority} filter, while the protobuf field is repeated.
// Keep accepting arrays for older clients, and reject malformed payloads before
// protobuf-ts tries to merge them into the repeated field.
export const parseLogcatFilters = (value: unknown): LogcatFilter[] | null => {
    if (isLogcatFilter(value)) {
        return [value]
    }
    if (Array.isArray(value) && value.every(isLogcatFilter)) {
        return value
    }
    return null
}
