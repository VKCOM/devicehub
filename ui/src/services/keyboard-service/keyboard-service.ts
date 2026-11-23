import { inject, injectable } from 'inversify'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceControlStore } from '@/store/device-control-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { KEYBOARD_KEYS_MAP } from '@/constants/keyboard-keys-map'

import type {
  MobileInputListenerArgs,
  MobileKeyListenerArgs,
  ChangeListenerArgs,
  CopyListenerArgs,
  KeyDownListenerArgs,
  KeyUpListenerArgs,
  PasteListenerArgs,
} from './types'

/*
 * NOTE: The phone input keeps a margin of spaces before the cursor, so Backspace always has
 * something to delete. It is refilled only when the margin runs low or the text grows long:
 * a value set by script makes on-screen keyboards lose track of the field, and resetting it after
 * every character let only the first Backspace through.
 */
export const MOBILE_INPUT_SENTINEL = ' '.repeat(32)
const MOBILE_INPUT_MIN_LENGTH = 8
const MOBILE_INPUT_MAX_LENGTH = 256

export const shouldResetMobileInput = (value: string): boolean =>
  value.length < MOBILE_INPUT_MIN_LENGTH || value.length > MOBILE_INPUT_MAX_LENGTH

/* How many characters were removed from the end of the common prefix, and what came after it */
export const diffMobileInput = (previous: string, next: string): { deleted: number; inserted: string } => {
  let prefix = 0

  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++

  return { deleted: previous.length - prefix, inserted: next.slice(prefix) }
}

@injectable()
@deviceConnectionRequired()
export class KeyboardService {
  constructor(@inject(CONTAINER_IDS.deviceControlStore) private deviceControlStore: DeviceControlStore) {}

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

  /*
   * NOTE: On-screen keyboards report text through input events, their key events are mostly
   * "Unidentified". Android keyboards keep the current word in a composition and rewrite it
   * (predictive text, autocorrect), so every change is sent as a diff right away: deletions as
   * Backspace presses, then the inserted text. Waiting for the composition to end would show
   * nothing on the device until the word is finished.
   */
  mobileInputListener({ value, previousValue, isComposing, resetInput }: MobileInputListenerArgs): void {
    const { deleted, inserted } = diffMobileInput(previousValue, value)

    for (let i = 0; i < deleted; i++) {
      this.deviceControlStore.del()
    }

    // NOTE: Keyboards that send Enter as a line break instead of a key event, the device gets Enter
    inserted.split('\n').forEach((line, index) => {
      if (index > 0) this.deviceControlStore.enter()

      if (line) this.deviceControlStore.type(line)
    })

    // Resetting the value in the middle of a composition breaks it on Android
    if (!isComposing && shouldResetMobileInput(value)) resetInput()
  }

  /* NOTE: Keys of a hardware keyboard attached to the phone, and Enter of the on-screen one */
  mobileKeyDownListener({ key, preventDefault }: MobileKeyListenerArgs): void {
    if (key === 'Enter') {
      preventDefault()
      this.deviceControlStore.enter()

      return
    }

    // Backspace arrives as an input event, which also covers on-screen keyboards
    if (key === 'Backspace' || !KEYBOARD_KEYS_MAP[key]) return

    preventDefault()
    this.deviceControlStore.keyDown(key)
  }

  mobileKeyUpListener({ key }: MobileKeyListenerArgs): void {
    if (key === 'Enter' || key === 'Backspace' || !KEYBOARD_KEYS_MAP[key]) return

    this.deviceControlStore.keyUp(key)
  }

  pasteListener({ getClipboardData }: PasteListenerArgs): void {
    /* NOTE: Prevent value change or the input event sees it. This way we get
      the real value instead of any "\n" -> " " conversions we might see
      in the input value. 
    */
    this.deviceControlStore.paste(getClipboardData())
  }

  async copyListener({ setClipboardData }: CopyListenerArgs): Promise<void> {
    /* NOTE: This is asynchronous and by the time it returns we will no longer
      have access to setData(). In other words it doesn't work. Currently
      what happens is that on the first copy, it will attempt to fetch
      the clipboard contents. Only on the second copy will it actually
      copy that to the clipboard. 
    */

    const copyResult = await this.deviceControlStore.copy()
    const { data } = await copyResult.donePromise

    if (data) {
      setClipboardData(data)
    }
  }
}
