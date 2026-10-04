import type {Server} from 'socket.io'
import type {IncomingMessage} from 'node:http'
import type {SilentDeviceState} from '../../../wire/silent-device-state.js'
import type {SilentDeviceDispatcher} from './silent-device-dispatcher.js'
import type {AppTransport} from '../../../wire/app-transport.js'
import type {TransactionManager} from '../../../wire/transmanager.js'
import {Any} from '../../../wire/google/protobuf/any.js'
import auth from '../middleware/auth.js'
import UserModel from '../../../db/models/user/index.js'
import {registerDeviceCommands, type DeviceCommands} from './device-command-handlers.js'
import {
    Envelope,
    DescribeSilentDevice,
    AcquireSilentDevice,
    ReleaseSilentDevice,
    type SilentCommandContext
} from '../../../wire/wire.js'

interface AuthenticatedRequest extends IncomingMessage {
    user: {email: string; name: string; group: string}
    internalJwt: string
}

export function registerSilentNamespace(
    io: Server,
    transport: AppTransport,
    txmanager: TransactionManager,
    events: SilentDeviceDispatcher,
    options: {secret: string}
) {
    const namespace = io.of('/silent')

    namespace.use(auth({secret: options.secret}))
    namespace.use(async (socket, next) => {
        const {provider, serial} = socket.handshake.auth

        if (
            typeof provider !== 'string' || typeof serial !== 'string'
            || !provider || !serial
            || provider.includes('\0') || serial.includes('\0')
        ) {
            return next(new Error('Invalid device address'))
        }

        const user = (socket.request as AuthenticatedRequest).user

        try {
            const result = await txmanager.runTransaction(provider, serial, DescribeSilentDevice, {
                actor: {email: user.email, name: user.name, group: user.group, adbKeys: []}
            }, {timeout: 10_000})

            socket.data.device = result.body.device
            next()
        }
        catch (err: any) {
            next(new Error(err?.data || 'Device did not respond'))
        }
    })

    namespace.on('connection', socket => {
        const req = socket.request as AuthenticatedRequest
        const user = req.user
        const {provider, serial} = socket.handshake.auth
        const device: SilentDeviceState = socket.data.device
        const instanceId = device.instanceId
        let lease: SilentCommandContext | undefined
        let sequence = -1
        let latestLeaseId: string | undefined

        const sendSnapshot = (snapshot: SilentDeviceState) => {
            const using = !!lease && snapshot.owner?.email === user.email
            socket.emit('device.change', {
                important: true,
                data: {
                    ...snapshot,
                    using,
                    remoteConnectUrl: using ? snapshot.remoteConnectUrl : null
                }
            })
        }

        sendSnapshot(device)

        const done = (rc: string, result: any) => socket.emit('tx.done', rc, {
            source: serial,
            success: result.success !== false,
            data: result.data || 'success',
            body: result.body ? JSON.stringify(result.body) : undefined
        })

        const fail = (rc: string, err: any) =>
            done(rc, {success: false, data: err?.data || err?.message || 'fail'})

        const check = (target: string) => {
            if (target !== serial || !lease) {
                throw new Error('not_owner')
            }

            return lease
        }

        const runTx: DeviceCommands['run'] = async (target, rc, type, message, opts = {}) => {
            try {
                const silentCommand = check(target)
                const result = await txmanager.runTransaction(provider, serial, type, message, {
                    timeout: opts.timeout, silentCommand,
                    onProgress: (data, progress, seq) =>
                        socket.emit('tx.progress', rc, {source: serial, data, progress, seq})
                })

                // A response from a released session cannot become a success for a new one.
                if (lease !== silentCommand) {
                    throw new Error('session_ended')
                }

                done(rc, result)
            }
            catch (err) {
                fail(rc, err)
            }
        }

        const sendOwned: DeviceCommands['send'] = async (target, type, message) => {
            const silentCommand = check(target)
            transport.sendCommand(provider, serial, Envelope.toBinary({message: Any.pack(message, type), silentCommand}))
        }

        const invite = async (target: string, rc: string) => {
            try {
                if (target !== serial) {
                    throw new Error('Invalid device address')
                }

                const keys = await UserModel.getUserAdbKeys(user.email)
                const result = await txmanager.runTransaction(provider, serial, AcquireSilentDevice, {
                    instanceId,
                    actor: {
                        email: user.email,
                        name: user.name,
                        group: user.group,
                        adbKeys: keys.map((key: any) => key.fingerprint)
                    }
                }, {timeout: 60_000})

                if (sequence > result.body.sequence && latestLeaseId !== result.body.leaseId) {
                    throw new Error('session_ended')
                }

                lease = {instanceId, leaseId: result.body.leaseId}

                // Replies and broadcasts can arrive through different sockets. Ignore older state.
                sequence = Math.max(sequence, result.body.sequence ?? -1)
                sendSnapshot(result.body.device)

                // Lease credentials stay on the server.
                done(rc, {body: {device: {...result.body.device, using: true}}})
            }
            catch (err) {
                fail(rc, err)
            }
        }
        const kick = async (target: string, rc: string) => {
            try {
                const silentCommand = check(target)
                await txmanager.runTransaction(provider, serial, ReleaseSilentDevice, {}, {silentCommand})
                lease = undefined
                done(rc, {})
            }
            catch (err) {
                fail(rc, err)
            }
        }

        registerDeviceCommands(socket, {send: sendOwned, run: runTx, acquire: invite, release: kick}, req.internalJwt)

        // Unimplemented platform commands must fail promptly instead of hanging a UI transaction.
        socket.onAny((event, _target, rc) => {
            if (socket.listenerCount(event) === 0 && typeof rc === 'string') {
                fail(rc, new Error('unsupported_operation'))
            }
        })

        const unsubscribe = events.subscribe(provider, serial, event => {
            if (event.context.instanceId !== instanceId) {
                lease = undefined
                socket.emit('silent.unavailable', 'device_restarted')
                socket.disconnect()
                return
            }

            if (event.context.sequence <= sequence) {
                return
            }

            sequence = event.context.sequence
            latestLeaseId = event.context.leaseId

            if (event.type === 'absent') {
                lease = undefined
                socket.emit('silent.unavailable', 'device_absent')
                socket.disconnect()
            }
            else if (event.type === 'snapshot') {
                if (lease && event.context.leaseId !== lease.leaseId) {
                    lease = undefined
                }

                sendSnapshot(event.snapshot)
            }
            else if (lease && event.context.leaseId === lease.leaseId) {
                socket.emit('logcat.entry', event.entry)
            }
        })

        socket.once('disconnect', () => {
            unsubscribe(); lease = undefined
        })
    })
}
