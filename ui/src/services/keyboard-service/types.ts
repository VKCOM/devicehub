export type KeyDownListenerArgs = {
  key: string
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
  value: string
  clearInput: () => void
}

export type PasteListenerArgs = {
  getClipboardData: () => string
}

export type CopyListenerArgs = {
  setClipboardData: (content: string) => void
}

export type MobileInputListenerArgs = {
  value: string
  /* NOTE: Value of the input already sent to the device */
  previousValue: string
  isComposing: boolean
  resetInput: () => void
}

export type MobileKeyListenerArgs = {
  key: string
  preventDefault: () => void
}
