import { serviceLocator } from '@/services/service-locator'

import { DeviceControlStore } from '@/store/device-control-store'

import type {
  ChangeListenerArgs,
  CopyListenerArgs,
  KeyDownListenerArgs,
  KeyUpListenerArgs,
  PasteListenerArgs,
} from './types'

export class KeyboardService {
  private readonly deviceControlStore: DeviceControlStore

  constructor() {
    this.deviceControlStore = serviceLocator.get<DeviceControlStore>(DeviceControlStore.name)
  }

  isChangeCharsetKey({ code, key, keyCode, charCode }: KeyUpListenerArgs): boolean {
    // NOTE: Add any special key here for changing charset

    // NOTE: Chrome/Safari/Opera
    if (
      // NOTE: Mac | Kinesis keyboard | Karabiner | Latin key, Kana key
      ((code === '' || code === 'Unidentified') && charCode === 0x10) ||
      // NOTE: Mac | MacBook Pro keyboard | Latin key, Kana key
      ((code === '' || code === 'Unidentified') && charCode === 0x20) ||
      // NOTE: Win | Lenovo X230 keyboard | Alt+Latin key
      (keyCode === 246 && charCode === 0xf6) ||
      // NOTE: Win | Lenovo X230 keyboard | Convert key
      (keyCode === 28 && charCode === 0x1c)
    ) {
      return true
    }

    // NOTE: Firefox
    switch (key) {
      case 'Convert': // NOTE: Windows | Convert key
      case 'Alphanumeric': // NOTE: Mac | Latin key
      case 'RomanCharacters': // NOTE: Windows/Mac | Latin key
      case 'KanjiMode': // NOTE: Windows/Mac | Kana key
        return true
    }

    return false
  }

  handleSpecialKeys(args: KeyUpListenerArgs): boolean {
    if (this.isChangeCharsetKey(args)) {
      args.preventDefault()

      this.deviceControlStore.switchCharset()

      return true
    }

    return false
  }

  keyUpListener(args: KeyUpListenerArgs): void {
    if (!this.handleSpecialKeys(args)) {
      this.deviceControlStore.keyUp(args.key)
    }
  }

  keyDownListener({ key, preventDefault }: KeyDownListenerArgs): void {
    // NOTE: Prevent tab from switching focus to the next element, we only want that to happen on the device side.
    if (key === 'Tab') preventDefault()

    this.deviceControlStore.keyDown(key)
  }

  changeListener({ value, clearInput }: ChangeListenerArgs): void {
    this.deviceControlStore.type(value)

    clearInput()
  }

  pasteListener({ getClipboardData }: PasteListenerArgs): void {
    /* NOTE: Prevent value change or the input event sees it. This way we get
      the real value instead of any "\n" -> " " conversions we might see
      in the input value. 
    */
    this.deviceControlStore.paste(getClipboardData())
  }

  copyListener({ setClipboardData }: CopyListenerArgs): void {
    /* NOTE: This is asynchronous and by the time it returns we will no longer
      have access to setData(). In other words it doesn't work. Currently
      what happens is that on the first copy, it will attempt to fetch
      the clipboard contents. Only on the second copy will it actually
      copy that to the clipboard. 
    */
    this.deviceControlStore.copy().then((clipboardContent) => {
      if (clipboardContent && typeof clipboardContent === 'string') {
        setClipboardData(clipboardContent)
      }
    })
  }
}
