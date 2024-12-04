export type TouchDownArgs = {
  deviceChannel: string
  seq: number
  contact: number
  x: number
  y: number
  pressure: number
}

export type TouchMoveIosArgs = {
  deviceChannel: string
  x: number
  y: number
  pX: number
  pY: number
  pressure: number
  contact: number
  seq: number
}

export type TouchMoveArgs = {
  deviceChannel: string
  seq: number
  contact: number
  x: number
  y: number
  pressure: number
}

export type SendTwoWayArgs<T> = {
  deviceChannel: string
  isDeviceIos: boolean
  action: string
  data?: T
}
