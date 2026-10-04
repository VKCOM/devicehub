import type {
    BatteryEvent,
    CapabilitiesMessage,
    ConnectivityEvent,
    DeviceBrowserMessage,
    DeviceDisplayMessage,
    DeviceIdentityMessage,
    DeviceStatus,
    GetServicesAvailabilityMessage,
    OwnerMessage,
    PhoneStateEvent
} from './wire.js'

/** Public snapshot shared by worker and websocket; lease credentials are deliberately separate. */
export interface SilentDeviceState extends Partial<Omit<DeviceIdentityMessage, 'display'>> {
    serial: string
    provider: {name: string; channel?: string}
    silent: true
    instanceId: string
    present: boolean
    ready: boolean
    status: DeviceStatus
    channel?: string
    owner: OwnerMessage | null
    using: boolean
    usage: string | null
    remoteConnect: boolean
    remoteConnectUrl: string | null
    reverseForwards: unknown[]
    likelyLeaveReason?: string | null
    display?: Partial<DeviceDisplayMessage>
    battery?: Omit<BatteryEvent, 'serial'>
    capabilities?: Omit<CapabilitiesMessage, 'serial'>
    browser?: Omit<DeviceBrowserMessage, 'serial'>
    network?: Partial<Omit<ConnectivityEvent & PhoneStateEvent, 'serial'>>
    service?: Partial<Omit<GetServicesAvailabilityMessage, 'serial'>> & {hasAPNS?: boolean}
    airplaneMode?: boolean
}
