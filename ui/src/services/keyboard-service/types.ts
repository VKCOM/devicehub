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
