export type KeyDownListenerArgs = {
  key: string
  deviceChannel: string
  preventDefault: () => void
}

export type KeyUpListenerArgs = {
  code: string
  key: string
  keyCode: number
  charCode: number
  preventDefault: () => void
}

export type ChangeListenerArgs = {
  deviceChannel: string
  value: string
  clearInput: () => void
}

export type PasteListenerArgs = {
  deviceChannel: string
  isDeviceIos: boolean
  getClipboardData: () => string
  preventDefault: () => void
}

export type CopyListenerArgs = {
  deviceChannel: string
  isDeviceIos: boolean
  setClipboardData: (content: string) => void
  preventDefault: () => void
}
