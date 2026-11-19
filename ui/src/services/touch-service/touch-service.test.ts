import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'

import { ScalingService } from '../scaling-service/scaling-service'

import { TouchService } from './touch-service'

import type { DeviceControlStore } from '@/store/device-control-store'
import type { DeviceBySerialStore } from '@/store/device-by-serial-store'
import type { DeviceScreenStore } from '@/store/device-screen-store/device-screen-store'

type FakeTouch = { identifier: number; clientX: number; clientY: number; force: number }

const list = (...touches: FakeTouch[]) => touches as unknown as TouchList
const touch = (identifier: number, clientX = 100, clientY = 200): FakeTouch => ({
  identifier,
  clientX,
  clientY,
  force: 0,
})

const createService = (manufacturer = 'Google') => {
  const control = {
    touchDown: vi.fn(),
    touchMove: vi.fn(),
    touchUp: vi.fn(),
    touchCommit: vi.fn(),
    touchReset: vi.fn(),
    gestureStart: vi.fn(),
    gestureStop: vi.fn(),
  }
  const device = { manufacturer, display: { width: 1080, height: 2400 }, capabilities: { hasCursor: false } }
  const wrapper = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 360, height: 800 }) }
  const screenStore = { getCanvasWrapper: wrapper, getScreenRotation: 0, getStreamAspectRatio: 1080 / 2400 }
  const bySerialStore = { deviceQueryResult: () => ({ data: device }) }

  const service = new TouchService(
    new ScalingService(),
    screenStore as unknown as DeviceScreenStore,
    control as unknown as DeviceControlStore,
    bySerialStore as unknown as DeviceBySerialStore
  )

  return { service, control }
}

describe('TouchService multi-touch', () => {
  it('keeps the gesture alive until the last finger is up', () => {
    const { service, control } = createService()
    const first = touch(1, 100, 200)
    const second = touch(2, 200, 400)

    service.touchStartListener({ touches: list(first), changedTouches: list(first) })
    service.touchStartListener({ touches: list(first, second), changedTouches: list(second) })

    expect(control.touchDown).toHaveBeenCalledTimes(2)
    expect(control.gestureStart).toHaveBeenCalledTimes(1)

    service.touchEndListener({ touches: list(second), changedTouches: list(first) })

    expect(control.touchUp).toHaveBeenCalledTimes(1)
    expect(control.gestureStop).not.toHaveBeenCalled()

    service.touchMoveListener({ changedTouches: list(touch(2, 210, 410)) })

    expect(control.touchMove).toHaveBeenCalledTimes(1)

    service.touchEndListener({ touches: list(), changedTouches: list(second) })

    expect(control.touchUp).toHaveBeenCalledTimes(2)
    expect(control.gestureStop).toHaveBeenCalledTimes(1)
    expect(service.fingers).toEqual({})
  })

  it('sends every finger to the device with its own contact', () => {
    const { service, control } = createService()
    const fingers = [touch(1), touch(2), touch(3)]

    service.touchStartListener({ touches: list(...fingers), changedTouches: list(...fingers) })

    const contacts = control.touchDown.mock.calls.map(([args]) => args.contact)

    expect(new Set(contacts).size).toBe(3)
    expect(contacts).toContain(0)
  })

  it('sends only the first finger to an iOS device', () => {
    const { service, control } = createService('Apple')
    const first = touch(1)
    const second = touch(2)

    service.touchStartListener({ touches: list(first, second), changedTouches: list(first, second) })
    service.touchMoveListener({ changedTouches: list(touch(1, 120, 220), touch(2, 220, 420)) })
    service.touchEndListener({ touches: list(), changedTouches: list(first, second) })

    expect(control.touchDown).toHaveBeenCalledOnce()
    expect(control.touchDown.mock.calls[0][0].contact).toBe(0)
    expect(control.touchMove).toHaveBeenCalledOnce()
    expect(control.touchUp).toHaveBeenCalledExactlyOnceWith(expect.any(Number), 0)
  })

  it('projects a touch starting at an edge onto the exact device edge when edge zones are on', () => {
    const { service, control } = createService()
    service.setEdgeZonesEnabled(true)

    const start = touch(1, 6, 400)

    service.touchStartListener({ touches: list(start), changedTouches: list(start) })

    expect(control.touchDown.mock.calls[0][0].x).toBe(0)
    expect(service.activeEdges).toEqual(['left'])

    service.touchMoveListener({ changedTouches: list(touch(1, 60, 400)) })

    expect(control.touchMove.mock.calls[0][0].x).toBeGreaterThan(0)

    service.touchEndListener({ touches: list(), changedTouches: list(start) })

    expect(service.activeEdges).toEqual([])
  })

  it('keeps touches on the client while input is blocked', () => {
    const { service, control } = createService()
    service.setTouchInputBlocked(true)

    service.touchStartListener({ touches: list(touch(1)), changedTouches: list(touch(1)) })

    expect(control.touchDown).not.toHaveBeenCalled()
  })
})
