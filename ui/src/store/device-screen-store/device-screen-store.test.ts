import 'reflect-metadata'
import { observable, runInAction } from 'mobx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DeviceScreenStore } from './device-screen-store'

import type { DeviceBySerialStore } from '@/store/device-by-serial-store'

const mocks = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/store/device-by-serial-store', () => ({ ['DeviceBySerialStore']: class {} }))
vi.mock('@/store/auth-store', () => ({ authStore: { jwt: 'token' } }))
vi.mock('@/store/device-error-modal-store', () => ({ deviceErrorModalStore: { setError: mocks.error } }))
vi.mock('i18next', () => ({ t: (message: string) => message }))

class FakeWebSocket {
  static ['OPEN'] = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  binaryType = ''
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn()
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
  finish(code: number, wasClean = true) {
    this.readyState = 3
    this.onclose?.({ code, wasClean })
  }
  close() {
    this.finish(1000)
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const stores: DeviceScreenStore[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
})
afterEach(() => {
  stores.splice(0).forEach((store) => store.stopScreenStreaming())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function setup() {
  const state = observable({
    session: { silent: false, ready: true },
    data: { using: true, present: true, ready: true, display: { url: 'ws://device/screen' } },
  })
  const store = new DeviceScreenStore({
    session: state.session,
    deviceQueryResult: () => ({ data: state.data }),
  } as unknown as DeviceBySerialStore)
  stores.push(store)
  await store.startScreenStreaming(
    { getContext: () => ({}) } as unknown as HTMLCanvasElement,
    {} as HTMLDivElement
  )
  await flush()

  return { store, state }
}

describe('screen connection recovery', () => {
  it('does not reconnect after the worker rejects screen access after the WS opened', async () => {
    const { state } = await setup()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await flush()
    ws.finish(1008)
    await flush()
    // Further device updates in the open control tab must not reset the denial.
    runInAction(() => { state.data.display.url = 'ws://device/restarted-screen' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(mocks.error).toHaveBeenCalledWith('Unauthorized')
  })

  it('does not restart the entire retry budget after eight transport failures', async () => {
    await setup()

    for (let attempt = 0; attempt < 8; attempt++) {
      FakeWebSocket.instances.at(-1)!.finish(1006, false)
      await vi.advanceTimersByTimeAsync(20_000)
    }

    expect(FakeWebSocket.instances).toHaveLength(8)
    expect(mocks.error).toHaveBeenCalledWith('Service is currently unavailable')
  })

  it('cancels a connection still opening when the screen unmounts', async () => {
    const { store } = await setup()
    const ws = FakeWebSocket.instances[0]
    store.stopScreenStreaming()
    expect(ws.readyState).toBe(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
