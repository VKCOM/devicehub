import 'reflect-metadata'
import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getControlFileExplorerRoute } from '@/constants/route-paths'

import { DeviceSession } from './device-session'
import { DeviceControlService } from './core/device-control-service/device-control-service'
import { TransactionService } from './core/transaction-service/transaction-service'


import type { DeviceBySerialStore } from '@/store/device-by-serial-store'
import type { SilentDevice } from '@/generated/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), io: vi.fn(), set: vi.fn(), remove: vi.fn(), error: vi.fn() }))
vi.mock('@/api/socket', () => ({ socket: {} }))
vi.mock('socket.io-client', () => ({ io: mocks.io }))
vi.mock('@/api/openstf-api/openstf-api-client', () => ({ openstfApiClient: { get: mocks.get } }))
vi.mock('@/config/variables.config', () => ({
  variablesConfig: new Proxy({}, { get: () => ({ websocketUrl: 'http://localhost:7110' }) }),
}))
vi.mock('@/config/queries/query-client', () => ({
  queryClient: { setQueryData: mocks.set, removeQueries: mocks.remove },
}))
vi.mock('@/store/auth-store', () => ({ authStore: { jwt: 'jwt' } }))
vi.mock('@/store/device-error-modal-store', () => ({
  deviceErrorModalStore: { setError: mocks.error, clearError: vi.fn() },
}))

class Socket extends EventEmitter {
  connected = false
  sent: unknown[][] = []
  emit(event: string, ...args: unknown[]) {
    this.sent.push([event, ...args])

    return true
  }
  receive(event: string, ...args: unknown[]) {
    return super.emit(event, ...args)
  }
  connect() {
    this.connected = true
    this.receive('connect')

    return this
  }
  disconnect() {
    this.connected = false
    this.receive('disconnect')

    return this
  }
  done(event: string, content?: unknown) {
     
    const call = this.sent.find((callArr) => callArr[0] === event)!
    this.receive('tx.done', call[2], {
      source: 'same',
      success: true,
      body: content ? JSON.stringify(content) : null,
      data: 'success',
    })
  }
}

const pending = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve()
}

const snapshot = (provider = 'provider'): SilentDevice => ({
  serial: 'same',
  provider: { name: provider },
  silent: true,
  instanceId: 'launch',
  ready: true,
  manufacturer: 'Google',
  platform: 'Android',
  channel: 'channel',
})
let sessions: DeviceSession[] = []

beforeEach(() => {
  vi.clearAllMocks()

  // Node 20/jsdom lacks the browser API already used by TransactionService.
  if (!Promise.withResolvers) Promise.withResolvers = pending
  mocks.io.mockImplementation(() => new Socket())
  mocks.get.mockResolvedValue({ data: { device: snapshot() } })
})
afterEach(() => {
  sessions.forEach((s) => s.dispose())
  sessions = []
})
const session = (provider = 'provider') => {
  const s = new DeviceSession('same', provider)
  sessions.push(s)

  return s
}

describe('silent control page startup', () => {
  it('holds startup service requests and touch until GET, socket attach and acquire finish', async () => {
    const description = pending<{ data: { device: SilentDevice } }>()
    mocks.get.mockReturnValue(description.promise)
    const s = session()
    const socket = s.socket as unknown as Socket
    const store = {
      session: s,
      fetch: async () => snapshot(),
      deviceQueryResult: () => ({ data: snapshot() }),
    } as unknown as DeviceBySerialStore
    const control = new DeviceControlService(store, <T>() => new TransactionService<T>(s.socket))
    // These are the requests made by InfoService and FileExplorerService during initialization.
    const sd = control.getSdStatus()
    const files = control.fsList('/')
    const boot = s.start()
    control.touchDown({ seq: 1, contact: 0, x: 0, y: 0, pressure: 1 })
    expect(socket.sent).toEqual([])
    expect(mocks.get).toHaveBeenCalledTimes(1)
    description.resolve({ data: { device: snapshot() } })
    await flush()
    expect(socket.sent.map((call) => call[0])).toEqual(['group.invite'])
    expect(s.ready).toBe(false)
    socket.done('group.invite', { device: { ...snapshot(), using: true } })
    await boot
    const [sdTx, fileTx] = await Promise.all([sd, files])
    expect(s.ready).toBe(true)
    expect(socket.sent.map((call) => call[0])).toContain('sd.status')
    expect(socket.sent.map((call) => call[0])).toContain('fs.list')
    control.touchDown({ seq: 2, contact: 0, x: 1, y: 1, pressure: 1 })
    expect(socket.sent.at(-1)![0]).toBe('input.touchDown')
    socket.done('sd.status')
    socket.done('fs.list')
    await Promise.all([sdTx.donePromise, fileTx.donePromise])
    await s.start()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(socket.sent.filter((call) => call[0] === 'group.invite')).toHaveLength(1)
  })

  it('rejects pending startup commands after an ACL failure without sending them', async () => {
    mocks.get.mockRejectedValue(new Error('forbidden'))
    const s = session()
    const store = { session: s, fetch: vi.fn() } as unknown as DeviceBySerialStore
    const control = new DeviceControlService(store, () => {
      throw new Error('must not create transaction')
    })
    await expect(control.fsList('/')).rejects.toThrow('forbidden')
    expect((s.socket as unknown as Socket).sent).toEqual([])
    expect(s.ready).toBe(false)
  })

  it('partitions equal serials by provider and encodes every control tab URL', async () => {
    const first = session('p/one'),
      second = session('p two')
    await Promise.all([first.describe(), second.describe()])
    expect(first.queryKey).not.toEqual(second.queryKey)
    expect(first.socket).not.toBe(second.socket)
    expect(mocks.get.mock.calls.map((call) => call[0])).toEqual([
      '/silent-devices/p%2Fone/same',
      '/silent-devices/p%20two/same',
    ])
    expect(getControlFileExplorerRoute('emulator:5554/%', 'p/one')).toBe(
      '/silent-control/p%2Fone/emulator%3A5554%2F%25/file-explorer'
    )
  })

  it('settles transactions on disconnect and rejects commands after the owner is revoked', async () => {
    const s = session(),
      socket = s.socket as unknown as Socket
    const boot = s.start()
    await flush()
    socket.done('group.invite', { device: { ...snapshot(), using: true } })
    await boot
    s.applySnapshot({ ...snapshot(), using: false, likelyLeaveReason: 'timeout' })
    expect(s.ready).toBe(false)
    await expect(s.waitUntilReady()).rejects.toThrow('ended')
    const tx = new TransactionService(s.socket).initializeTransaction()
    const assertion = expect(tx.donePromise).rejects.toThrow('aborted')
    socket.disconnect()
    await assertion
  })

  it('cancels deferred cleanup when React immediately remounts the page', async () => {
    vi.useFakeTimers()
    const s = session()
    s.scheduleDispose()
    s.activate()
    await vi.runOnlyPendingTimersAsync()
    expect(mocks.remove).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
  it.each(['Google', 'Apple'])(
    'resolves actual page services and gates their constructor requests for %s',
    async (manufacturer) => {
      const { Container } = await import('inversify')
      const { createDeviceContainer } = await import('@/config/inversify/create-device-container')
      const { CONTAINER_IDS } = await import('@/config/inversify/container-ids')
      const parent = new Container()
      const container = createDeviceContainer('same', 'provider')
      container.parent = parent
      const s = container.get<DeviceSession>(CONTAINER_IDS.deviceSession)
      sessions.push(s)
      const socket = s.socket as unknown as Socket
      const device = { ...snapshot(), manufacturer, platform: manufacturer === 'Apple' ? 'iOS' : 'Android' }
      mocks.get.mockResolvedValue({ data: { device } })
      parent.bind<unknown>(CONTAINER_IDS.factoryMobxQuery).toConstantValue((options: () => { queryFn: () => unknown }) => ({
        fetch: () => options().queryFn(),
        result: { data: device },
      }))
      parent.bind<unknown>(CONTAINER_IDS.factoryMobxMutation).toConstantValue(() => ({}))
      container.get(CONTAINER_IDS.infoService)
      container.get(CONTAINER_IDS.fileExplorerService)
      container.get(CONTAINER_IDS.applicationInstallationService)
      container.get(CONTAINER_IDS.deviceDisconnection)
      await flush()
      expect(socket.sent.map((call) => call[0])).toEqual(['group.invite'])
      socket.done('group.invite', { device: { ...device, using: true } })
      await s.start()
      await flush()
      expect(mocks.get).toHaveBeenCalledTimes(1)
      const fsAction = manufacturer === 'Apple' ? 'fs.listIos' : 'fs.list'
      expect(socket.sent.map((call) => call[0])).toContain(fsAction)
      socket.done(fsAction)

      if (manufacturer === 'Apple') expect(socket.sent.map((call) => call[0])).not.toContain('sd.statusIos')
      else socket.done('sd.status')
      await flush()
    }
  )
})
