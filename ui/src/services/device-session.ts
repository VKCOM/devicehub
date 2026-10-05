import { makeAutoObservable, runInAction } from 'mobx'
import { io, type Socket } from 'socket.io-client'

import { socket as globalSocket } from '@/api/socket'
import { TransactionService } from '@/services/core/transaction-service/transaction-service'

import { openstfApiClient } from '@/api/openstf-api/openstf-api-client'
import { variablesConfig } from '@/config/variables.config'
import { queryClient } from '@/config/queries/query-client'
import { authStore } from '@/store/auth-store'
import { deviceErrorModalStore } from '@/store/device-error-modal-store'

import type { Device, SilentDevice } from '@/generated/types'

export const silentDeviceQueryKey = (provider: string, serial: string) => ['silentDevice', provider, serial] as const

/** One control page, one target, one connection and one acquisition barrier. */
export class DeviceSession {
  readonly socket: Socket
  readonly queryKey: readonly string[]
  ready = false
  private snapshot?: SilentDevice
  private description?: Promise<SilentDevice>
  private starting?: Promise<void>
  private disposed = false
  private revoked = false
  private generation = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempts = 0
  private disposeTimer?: ReturnType<typeof setTimeout>

  constructor(
    readonly serial: string,
    readonly provider?: string
  ) {
    this.queryKey = silentDeviceQueryKey(provider || '', serial)
    this.socket =
      provider === undefined
        ? globalSocket
        : io(`${variablesConfig[import.meta.env.MODE].websocketUrl.replace(/\/$/, '')}/silent`, {
            autoConnect: false,
            reconnection: false,
            forceNew: true,
            transports: ['websocket'],
            auth: (cb) => cb({ token: authStore.jwt, provider, serial }),
          })
    this.ready = !this.silent
    makeAutoObservable(this, { socket: false, queryKey: false }, { autoBind: true })

    if (this.silent) {
      this.socket.on('device.change', ({ data }: { data: SilentDevice }) => this.applySnapshot(data))
      this.socket.on('silent.unavailable', (reason: string) => {
        this.ready = false
        deviceErrorModalStore.setError(reason)
      })
      this.socket.on('disconnect', () => {
        this.ready = false
        this.generation++
        this.starting = undefined

        if (this.disposed || this.revoked) return

        if (this.snapshot) this.applySnapshot({ ...this.snapshot, present: false, using: false }, false)
        this.scheduleReconnect()
      })
    }
  }

  get silent() {
    return this.provider !== undefined
  }

  describe(): Promise<SilentDevice> {
    if (!this.description) {
      this.description = openstfApiClient
        .get<{ device: SilentDevice }>(`/silent-devices/${encodeURIComponent(this.provider!)}/${encodeURIComponent(this.serial)}`)
        .then(({ data }) => {
          this.snapshot = data.device

          return data.device
        })
    }

    return this.description
  }

  applySnapshot(device: SilentDevice, checkOwnership = true) {
    if (this.disposed || device.serial !== this.serial || device.provider?.name !== this.provider) return

    if (checkOwnership && this.ready && !device.using) {
      this.ready = false
      this.revoked = true
      deviceErrorModalStore.setError(device.likelyLeaveReason || 'Device session ended')
    }

    this.snapshot = device
    queryClient.setQueryData<Device>(this.queryKey, device)
  }

  start(): Promise<void> {
    if (!this.silent) return Promise.resolve()

    if (this.disposed || this.revoked) return Promise.reject(new Error('Device session ended'))

    if (this.starting) return this.starting
    const generation = this.generation
    this.starting = (async () => {
      const device = await this.describe()

      if (this.disposed || generation !== this.generation) throw new Error('Device session ended')
      this.applySnapshot(device, false)
      await this.connect()
      const { content } = await this.transact<{ device: SilentDevice }>('group.invite')

      if (this.disposed || generation !== this.generation) throw new Error('Device session ended')
      runInAction(() => {
        this.applySnapshot(content!.device, false)
        this.ready = true
        this.reconnectAttempts = 0
        deviceErrorModalStore.clearError()
      })
    })()

    return this.starting
  }

  waitUntilReady(): Promise<void> {
    return this.start()
  }

  activate() {
    clearTimeout(this.disposeTimer)
  }
  scheduleDispose() {
    this.disposeTimer = setTimeout(() => this.dispose(), 0)
  }

  private connect(): Promise<void> {
    if (this.socket.connected) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        this.socket.off('connect', connected)
        this.socket.off('connect_error', failed)
        this.socket.off('disconnect', disconnected)
      }

      const connected = () => {
        cleanup()
        resolve()
      }

      const failed = (err: Error) => {
        cleanup()
        reject(err)
      }

      const disconnected = () => failed(new Error('Device connection closed'))
      const timer = setTimeout(() => failed(new Error('Device connection timed out')), 15_000)
      this.socket.once('connect', connected)
      this.socket.once('connect_error', failed)
      this.socket.once('disconnect', disconnected)
      this.socket.connect()
    })
  }

  private transact<T>(event: string) {
    const transaction = new TransactionService<T>(this.socket).initializeTransaction()
    this.socket.emit(event, this.serial, transaction.channel, {})

    return transaction.donePromise
  }

  async release() {
    if (!this.ready) return
    this.revoked = true

    try {
      await this.transact('group.kick')
    } finally {
      runInAction(() => {
        this.ready = false
      })
    }
  }

  private scheduleReconnect() {
    if (this.disposed || this.revoked || this.reconnectTimer || this.reconnectAttempts >= 10) return
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = undefined
        this.description = undefined
        this.starting = undefined
        void this.start().catch((error) => {
          const reason = typeof error.cause === 'string' ? error.cause : error.message
          deviceErrorModalStore.setError(reason || 'Device connection failed')
          // ACL/auth failures require user action; retry only transient transport failures.
          const status = error.status ?? error.response?.status

          if (
            ![401, 403, 404].includes(status) &&
            ![
              'forbidden',
              'unauthorized',
              'not_silent',
              'busy',
              'Invalid user',
              'Missing authorization token',
            ].includes(reason)
          )
            this.scheduleReconnect()
        })
      },
      Math.min(1000 * 2 ** this.reconnectAttempts++, 30_000)
    )
  }

  dispose() {
    if (!this.silent) return
    this.disposed = true
    this.ready = false
    this.generation++
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.disposeTimer)
    this.socket.disconnect()
    this.socket.removeAllListeners()
    queryClient.removeQueries({ queryKey: this.queryKey, exact: true })
    this.snapshot = undefined
    this.description = undefined
  }
}
