import { controlService } from '@/services/core/control-service/control-service'

import type {
  ChangeListenerArgs,
  CopyListenerArgs,
  KeyDownListenerArgs,
  KeyUpListenerArgs,
  PasteListenerArgs,
} from './types'

class KeyboardService {
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

  handleSpecialKeys(deviceChannel: string, args: KeyUpListenerArgs): boolean {
    if (this.isChangeCharsetKey(args)) {
      args.preventDefault()

      controlService.switchCharset(deviceChannel)

      return true
    }

    return false
  }

  keyUpListener(deviceChannel: string, args: KeyUpListenerArgs): void {
    if (!this.handleSpecialKeys(deviceChannel, args)) {
      controlService.keyUp(deviceChannel)(args.key)
    }
  }

  keyDownListener({ deviceChannel, key, preventDefault }: KeyDownListenerArgs): void {
    // NOTE: Prevent tab from switching focus to the next element, we only want that to happen on the device side.
    if (key === 'Tab') preventDefault()

    controlService.keyDown(deviceChannel)(key)
  }

  changeListener({ deviceChannel, value, clearInput }: ChangeListenerArgs): void {
    controlService.type(deviceChannel, value)

    clearInput()
  }

  pasteListener({ deviceChannel, isDeviceIos, getClipboardData, preventDefault }: PasteListenerArgs): void {
    /* NOTE: Prevent value change or the input event sees it. This way we get
      the real value instead of any "\n" -> " " conversions we might see
      in the input value. 
    */
    preventDefault()

    controlService.paste(deviceChannel, isDeviceIos, getClipboardData())
  }

  copyListener({ deviceChannel, isDeviceIos, setClipboardData, preventDefault }: CopyListenerArgs): void {
    /* NOTE: This is asynchronous and by the time it returns we will no longer
      have access to setData(). In other words it doesn't work. Currently
      what happens is that on the first copy, it will attempt to fetch
      the clipboard contents. Only on the second copy will it actually
      copy that to the clipboard. 
    */
    preventDefault()

    controlService.copy(deviceChannel, isDeviceIos).then((clipboardContent) => {
      if (clipboardContent && typeof clipboardContent === 'string') {
        setClipboardData(clipboardContent)
      }
    })
  }
}

export const keyboardService = new KeyboardService()
