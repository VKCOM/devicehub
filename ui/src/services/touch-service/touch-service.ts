import { makeAutoObservable } from 'mobx'

import { scalingService } from '@/services/scaling-service/scaling-service'
import { controlService } from '@/services/core/control-service/control-service'

import { deviceScreenStore } from '@/store/device-screen-store/device-screen-store'
import { deviceBySerialStore } from '@/store/device-by-serial-store'

import type {
  Finger,
  GetScaledCoordsArgs,
  GetScaledCoordsReturn,
  MouseDownListenerArgs,
  MouseMoveListener,
  MouseUpListener,
  SetFingerArgs,
  TouchMoveListenerArgs,
  TouchStartEndListenerArgs,
} from './types'
import type { MouseEvent as ReactMouseEvent } from 'react'

class TouchService {
  private prevCoords: { x: number; y: number } = { x: 0, y: 0 }
  private slotted: Record<string, number> = {}
  private seq = -1
  private cycle = 100
  private fakePinch = false
  private lastPossiblyBuggyMouseUpEvent: MouseEvent | null = null
  private isMouseDown = false
  private isTouching = false

  /* NOTE: The reverse order is important because slots and fingers are in
    opposite sort order. Anyway don't change anything here unless
    you understand what it does and why.
  */
  slots = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  fingers: Record<number, Finger> = {}

  constructor() {
    makeAutoObservable(this)
  }

  mouseUpBugWorkaroundListener(event: ReactMouseEvent): void {
    this.lastPossiblyBuggyMouseUpEvent = event.nativeEvent
  }

  mouseDownListener({
    serial,
    mousePageX,
    mousePageY,
    eventTimestamp,
    isAltKeyPressed,
    isRightButtonPressed,
    focusInput,
  }: MouseDownListenerArgs): void {
    this.isMouseDown = true

    // NOTE: Skip right button click
    if (isRightButtonPressed) return

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel || !device.display?.width || !device.display?.height || !deviceScreenStore.getCanvasWrapper)
      return

    this.fakePinch = isAltKeyPressed

    const screenBoundingRect = deviceScreenStore.getCanvasWrapper.getBoundingClientRect()

    this.startMousing(device.channel, focusInput)

    const scaled = this.getScaledCoords({
      displayWidth: device.display.width,
      displayHeight: device.display.height,
      isIosDevice: !!device.ios,
      mousePageX,
      mousePageY,
      screenBoundingRect,
    })

    this.prevCoords = {
      x: scaled.coords.xP,
      y: scaled.coords.yP,
    }

    const pressure = 0.5

    controlService.touchDown({
      deviceChannel: device.channel,
      seq: this.nextSeq(),
      contact: 0,
      x: scaled.coords.xP,
      y: scaled.coords.yP,
      pressure,
    })

    if (this.fakePinch) {
      controlService.touchDown({
        deviceChannel: device.channel,
        seq: this.nextSeq(),
        contact: 1,
        x: 1 - scaled.coords.xP,
        y: 1 - scaled.coords.yP,
        pressure,
      })
    }

    controlService.touchCommit(device.channel, this.nextSeq())

    this.setFinger({ index: 0, x: scaled.x, y: scaled.y, pressure })

    if (this.fakePinch) {
      this.setFinger({
        index: 1,
        x: -mousePageX + screenBoundingRect.x + screenBoundingRect.width,
        y: -mousePageY + screenBoundingRect.y + screenBoundingRect.height,
        pressure,
      })
    }

    if (this.lastPossiblyBuggyMouseUpEvent && this.lastPossiblyBuggyMouseUpEvent.timeStamp > eventTimestamp) {
      // NOTE: We got mouseup before mousedown. See mouseUpBugWorkaroundListener for details.
      this.mouseUpListener({
        serial,
        mousePageX: this.lastPossiblyBuggyMouseUpEvent.pageX,
        mousePageY: this.lastPossiblyBuggyMouseUpEvent.pageY,
        isRightButtonPressed: this.lastPossiblyBuggyMouseUpEvent.button === 2,
      })

      return
    }

    this.lastPossiblyBuggyMouseUpEvent = null
  }

  mouseUpListener({ serial, isRightButtonPressed, mousePageX, mousePageY }: MouseUpListener): void {
    if (!this.isMouseDown) return

    this.isMouseDown = false

    // NOTE: Skip right button click
    if (isRightButtonPressed) return

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel || !device.display?.width || !device.display?.height || !deviceScreenStore.getCanvasWrapper)
      return

    const screenBoundingRect = deviceScreenStore.getCanvasWrapper.getBoundingClientRect()

    const scaled = this.getScaledCoords({
      displayWidth: device.display.width,
      displayHeight: device.display.height,
      isIosDevice: !!device.ios,
      mousePageX,
      mousePageY,
      screenBoundingRect,
    })

    const pressure = 0.5

    if (
      (Math.abs(this.prevCoords.x - scaled.coords.xP) >= 0.1 ||
        Math.abs(this.prevCoords.y - scaled.coords.yP) >= 0.1) &&
      !!device.ios
    ) {
      controlService.touchMoveIos({
        deviceChannel: device.channel,
        x: scaled.coords.xP,
        y: scaled.coords.yP,
        pX: this.prevCoords.x,
        pY: this.prevCoords.y,
        pressure,
        seq: this.nextSeq(),
        contact: 0,
      })
    }

    controlService.touchUp(device.channel, this.nextSeq(), 0)

    if (this.fakePinch) {
      controlService.touchUp(device.channel, this.nextSeq(), 1)
    }

    controlService.touchCommit(device.channel, this.nextSeq())

    this.removeFinger(0)

    if (this.fakePinch) {
      this.removeFinger(1)
    }

    this.stopMousing(device.channel)
  }

  mouseMoveListener({
    serial,
    isRightButtonPressed,
    mousePageX,
    mousePageY,
    isAltKeyPressed,
  }: MouseMoveListener): void {
    if (!this.isMouseDown) return

    // NOTE: Skip right button click
    if (isRightButtonPressed) return

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel || !device.display?.width || !device.display?.height || !deviceScreenStore.getCanvasWrapper)
      return

    const screenBoundingRect = deviceScreenStore.getCanvasWrapper.getBoundingClientRect()

    const scaled = this.getScaledCoords({
      displayWidth: device.display.width,
      displayHeight: device.display.height,
      isIosDevice: !!device.ios,
      mousePageX,
      mousePageY,
      screenBoundingRect,
    })

    const addGhostFinger = !this.fakePinch && isAltKeyPressed
    const deleteGhostFinger = this.fakePinch && !isAltKeyPressed

    this.fakePinch = isAltKeyPressed

    const pressure = 0.5

    controlService.touchMove({
      deviceChannel: device.channel,
      seq: this.nextSeq(),
      contact: 0,
      x: scaled.coords.xP,
      y: scaled.coords.yP,
      pressure,
    })

    if (addGhostFinger && !!device.ios) {
      // TODO: implement touchDownIos
      // controlService.touchDownIos(this.nextSeq(), 1, 1 - scaled.coords.xP, 1 - scaled.coords.yP, pressure)
    }

    if (addGhostFinger && !device.ios) {
      controlService.touchDown({
        deviceChannel: device.channel,
        seq: this.nextSeq(),
        contact: 1,
        x: 1 - scaled.coords.xP,
        y: 1 - scaled.coords.yP,
        pressure,
      })
    }

    if (!addGhostFinger && deleteGhostFinger) {
      controlService.touchUp(device.channel, this.nextSeq(), 1)
    }

    if (!addGhostFinger && !deleteGhostFinger && this.fakePinch) {
      controlService.touchMove({
        deviceChannel: device.channel,
        seq: this.nextSeq(),
        contact: 1,
        x: 1 - scaled.coords.xP,
        y: 1 - scaled.coords.yP,
        pressure,
      })
    }

    controlService.touchCommit(device.channel, this.nextSeq())

    this.setFinger({ index: 0, x: scaled.x, y: scaled.y, pressure })

    if (deleteGhostFinger) {
      this.removeFinger(1)
    }

    if (!deleteGhostFinger && this.fakePinch) {
      this.setFinger({
        index: 1,
        x: -mousePageX + screenBoundingRect.x + screenBoundingRect.width,
        y: -mousePageY + screenBoundingRect.y + screenBoundingRect.height,
        pressure,
      })
    }
  }

  touchStartListener({ serial, touches, changedTouches }: TouchStartEndListenerArgs): void {
    this.isTouching = true

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel || !device.display?.width || !device.display?.height || !deviceScreenStore.getCanvasWrapper)
      return

    const screenBoundingRect = deviceScreenStore.getCanvasWrapper.getBoundingClientRect()

    if (touches.length === changedTouches.length) {
      this.startTouching(device.channel)
    }

    const currentTouches: Record<string, number> = {}

    for (let i = 0, l = touches.length; i < l; ++i) {
      currentTouches[touches[i].identifier] = 1
    }

    const maybeLostTouchEnd = (id: string): boolean => !(id in currentTouches)

    /* NOTE: We might have lost a touchend event due to various edge cases
      (literally) such as dragging from the bottom of the screen so that
      the control center appears. If so, let's ask for a reset.
    */
    const slottedKeys = Object.keys(this.slotted)

    if (slottedKeys.some(maybeLostTouchEnd)) {
      slottedKeys.forEach((id) => {
        this.slots.push(this.slotted[id])

        delete this.slotted[id]
      })

      this.slots.sort().reverse()

      controlService.touchReset(device.channel, this.nextSeq())

      this.removeAllFingers()
    }

    if (!this.slots.length) {
      // NOTE: This should never happen but who knows...
      console.error('Ran out of multitouch slots')

      return
    }

    for (let i = 0, l = changedTouches.length; i < l; ++i) {
      const touch = changedTouches[i]
      const slot = this.slots.pop()

      if (!slot) return

      const scaled = this.getScaledCoords({
        displayWidth: device.display.width,
        displayHeight: device.display.height,
        isIosDevice: !!device.ios,
        mousePageX: touch.pageX,
        mousePageY: touch.pageY,
        screenBoundingRect,
      })

      this.slotted[touch.identifier] = slot

      const pressure = touch.force || 0.5

      if (!device.ios) {
        controlService.touchDown({
          deviceChannel: device.channel,
          seq: this.nextSeq(),
          contact: slot,
          x: scaled.coords.xP,
          y: scaled.coords.yP,
          pressure,
        })
      }

      this.setFinger({ index: slot, x: scaled.x, y: scaled.y, pressure })
    }

    controlService.touchCommit(device.channel, this.nextSeq())
  }

  touchMoveListener({ serial, changedTouches }: TouchMoveListenerArgs): void {
    if (!this.isTouching) return

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel || !device.display?.width || !device.display?.height || !deviceScreenStore.getCanvasWrapper)
      return

    const screenBoundingRect = deviceScreenStore.getCanvasWrapper.getBoundingClientRect()

    for (let i = 0, l = changedTouches.length; i < l; ++i) {
      const touch = changedTouches[i]
      const slot = this.slotted[touch.identifier]

      const scaled = this.getScaledCoords({
        displayWidth: device.display.width,
        displayHeight: device.display.height,
        isIosDevice: !!device.ios,
        mousePageX: touch.pageX,
        mousePageY: touch.pageY,
        screenBoundingRect,
      })

      const pressure = touch.force || 0.5

      controlService.touchMove({
        deviceChannel: device.channel,
        seq: this.nextSeq(),
        contact: slot,
        x: scaled.coords.xP,
        y: scaled.coords.yP,
        pressure,
      })

      this.setFinger({ index: slot, x: scaled.x, y: scaled.y, pressure })
    }

    controlService.touchCommit(device.channel, this.nextSeq())
  }

  touchEndListener({ serial, touches, changedTouches }: TouchStartEndListenerArgs): void {
    if (!this.isTouching) return

    this.isTouching = false

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    let foundAny = false

    for (let i = 0, l = changedTouches.length; i < l; ++i) {
      const touch = changedTouches[i]
      const slot = this.slotted[touch.identifier]

      if (typeof slot === 'undefined') {
        /* NOTE: We've already disposed of the contact. We may have gotten a
          touchend event for the same contact twice.
        */
        continue
      }

      delete this.slotted[touch.identifier]

      this.slots.push(slot)

      controlService.touchUp(device.channel, this.nextSeq(), slot)

      this.removeFinger(slot)

      foundAny = true
    }

    if (foundAny) {
      controlService.touchCommit(device.channel, this.nextSeq())

      if (!touches.length) {
        this.stopTouching(device.channel)
      }
    }
  }

  private nextSeq(): number {
    return ++this.seq >= this.cycle ? (this.seq = 0) : this.seq
  }

  private setFinger({ index, x, y, pressure }: SetFingerArgs): void {
    this.fingers[index] = {
      index,
      x,
      y,
      pressure,
    }
  }

  private removeFinger(index: number): void {
    delete this.fingers[index]
  }

  private removeAllFingers(): void {
    this.fingers = {}
  }

  private startMousing(deviceChannel: string, focusInput: () => void): void {
    controlService.gestureStart(deviceChannel, this.nextSeq())

    focusInput()
  }

  private stopMousing(deviceChannel: string): void {
    this.removeAllFingers()

    controlService.gestureStop(deviceChannel, this.nextSeq())
  }

  private getScaledCoords({
    displayWidth,
    displayHeight,
    isIosDevice,
    mousePageX,
    mousePageY,
    screenBoundingRect,
  }: GetScaledCoordsArgs): GetScaledCoordsReturn {
    const x = mousePageX - screenBoundingRect.x
    const y = mousePageY - screenBoundingRect.y

    const scaler = scalingService.coordinator(displayWidth, displayHeight)
    const scaled = scaler.coords({
      boundingWidth: screenBoundingRect.width,
      boundingHeight: screenBoundingRect.height,
      relX: x,
      relY: y,
      rotation: deviceScreenStore.getScreenRotation,
      isIosDevice: !!isIosDevice,
    })

    return {
      x,
      y,
      coords: scaled,
    }
  }

  private startTouching(deviceChannel: string): void {
    controlService.gestureStart(deviceChannel, this.nextSeq())
  }

  private stopTouching(deviceChannel: string): void {
    this.removeAllFingers()

    controlService.gestureStop(deviceChannel, this.nextSeq())
  }
}

export const touchService = new TouchService()
