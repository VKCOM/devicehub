import type {MessageType} from '@protobuf-ts/runtime'
import {Any} from '../../../wire/google/protobuf/any.js'
import type {SilentDeviceState} from '../../../wire/silent-device-state.js'
import * as wire from '../../../wire/wire.js'

interface SnapshotUpdate {
    patch: Partial<SilentDeviceState>
    reportedReady?: boolean
    forward?: boolean
}

type Reducer = (event: Any, state: Readonly<SilentDeviceState>) => SnapshotUpdate
const reducers = new Map<string, Reducer>()

const on = <T extends object>(type: MessageType<T>, reduce: (message: T, state: Readonly<SilentDeviceState>) => SnapshotUpdate) => {
    reducers.set(Any.typeNameToUrl(type.typeName), (event, state) => reduce(Any.unpack(event, type), state))
}

const withoutIdentity = <T extends object>(message: T) => {
    const {serial, id, ...value} = message as T & {serial?: string; id?: number}
    return value
}

on(wire.DeviceIntroductionMessage, (m, state) => ({
    patch: {provider: {...m.provider, name: state.provider.name}, status: m.status}, forward: true
}))
on(wire.DeviceIosIntroductionMessage, (m, state) => ({
    patch: {provider: {...m.provider, name: state.provider.name}, status: m.status}, forward: true
}))
on(wire.DeviceIdentityMessage, m => ({patch: withoutIdentity(m)}))
on(wire.InitializeIosDeviceState, m => ({patch: m.options ? {
    manufacturer: 'Apple', model: m.options.name, product: m.options.name,
    marketName: m.options.marketName, platform: m.options.platform, sdk: m.options.sdk,
    abi: m.options.architecture, service: m.options.service, status: m.status,
    capabilities: {hasTouch: true, hasCursor: false}
} : {status: m.status}}))
on(wire.SdkIosVersion, m => ({patch: {sdk: m.sdkVersion}}))
on(wire.SizeIosDevice, (m, state) => ({patch: {display: {...state.display, rotation: 0, ...withoutIdentity(m)}}}))
on(wire.DeviceReadyMessage, m => ({patch: {channel: m.channel}, reportedReady: true, forward: true}))
on(wire.DeviceStatusMessage, m => ({patch: {status: m.status}}))
on(wire.DeviceAbsentMessage, () => ({patch: {present: false}, reportedReady: false, forward: true}))
on(wire.BatteryEvent, m => ({patch: {battery: withoutIdentity(m)}}))
on(wire.DeviceBrowserMessage, m => ({patch: {browser: withoutIdentity(m)}}))
on(wire.GetServicesAvailabilityMessage, (m, state) => ({patch: {service: {...state.service, ...withoutIdentity(m)}}}))
on(wire.ConnectivityEvent, m => ({patch: {network: withoutIdentity(m)}}))
on(wire.PhoneStateEvent, (m, state) => ({patch: {network: {...state.network, ...withoutIdentity(m)}}}))
on(wire.CapabilitiesMessage, m => ({patch: {capabilities: withoutIdentity(m)}}))
on(wire.AirplaneModeEvent, m => ({patch: {airplaneMode: m.enabled}}))
on(wire.RotationEvent, (m, state) => ({patch: {display: {...state.display, ...withoutIdentity(m)}}}))
on(wire.ConnectStartedMessage, m => ({patch: {remoteConnect: true, remoteConnectUrl: m.url}}))
on(wire.ConnectStoppedMessage, () => ({patch: {remoteConnect: false, remoteConnectUrl: null}}))

/** Unrelated events (notably logs and transaction results) are never unpacked. */
export function reduceSilentSnapshot(event: Any, state: Readonly<SilentDeviceState>): SnapshotUpdate | undefined {
    return reducers.get(event.typeUrl)?.(event, state)
}
