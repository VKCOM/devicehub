import type { Coords } from '@/services/scaling-service/types'

export type Finger = {
  index: number
  x: number
  y: number
  pressure: number
}

export type SetFingerArgs = {
  index: number
  x: number
  y: number
  pressure: number
}

export type MouseDownListenerArgs = {
  serial: string
  mousePageX: number
  mousePageY: number
  eventTimestamp: number
  isRightButtonPressed: boolean
  isAltKeyPressed: boolean
  focusInput: () => void
}

export type MouseUpListener = {
  serial: string
  mousePageX: number
  mousePageY: number
  isRightButtonPressed: boolean
}

export type MouseMoveListener = {
  serial: string
  mousePageX: number
  mousePageY: number
  isRightButtonPressed: boolean
  isAltKeyPressed: boolean
}

export type TouchStartEndListenerArgs = {
  serial: string
  touches: TouchList
  changedTouches: TouchList
}

export type TouchMoveListenerArgs = {
  serial: string
  changedTouches: TouchList
}

export type GetScaledCoordsArgs = {
  displayWidth: number
  displayHeight: number
  isIosDevice: boolean
  mousePageX: number
  mousePageY: number
  screenBoundingRect: DOMRect
}

export type GetScaledCoordsReturn = {
  coords: Coords
  x: number
  y: number
}
