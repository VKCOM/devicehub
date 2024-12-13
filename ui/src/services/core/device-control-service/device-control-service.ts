import { socket } from '@/api/socket'
import { TransactionService } from '@/services/core/transaction-service/transaction-service'

import { KEYBOARD_KEYS_MAP } from '@/constants/keyboard-keys-map'

import type { TouchDownArgs, TouchMoveArgs, TouchMoveIosArgs } from './types'

export class DeviceControlService {
  constructor(
    private deviceChannel: string,
    private isDeviceIos: boolean
  ) {}

  gestureStart(seq: number): void {
    this.sendOneWay('input.gestureStart', {
      seq,
    })
  }

  gestureStop(seq: number): void {
    this.sendOneWay('input.gestureStop', {
      seq,
    })
  }

  touchDown({ seq, contact, x, y, pressure }: TouchDownArgs): void {
    this.sendOneWay('input.touchDown', {
      seq,
      contact,
      x,
      y,
      pressure,
    })
  }

  tapDeviceTreeElement(label: string): void {
    this.sendOneWay('tapDeviceTreeElement', {
      label,
    })
  }

  // NOTE: I have no idea where this method used
  touchMoveIos({ x, y, pX, pY, pressure, contact, seq }: TouchMoveIosArgs): void {
    this.sendOneWay('input.touchMoveIos', {
      seq,
      contact,
      toX: x,
      toY: y,
      fromX: pX,
      fromY: pY,
      pressure,
    })
  }

  touchMove({ seq, contact, x, y, pressure }: TouchMoveArgs): void {
    this.sendOneWay('input.touchMove', {
      seq,
      contact,
      x,
      y,
      pressure,
    })
  }

  touchUp(seq: number, contact: number): void {
    this.sendOneWay('input.touchUp', {
      seq,
      contact,
    })
  }

  touchCommit(seq: number): void {
    this.sendOneWay('input.touchCommit', {
      seq,
    })
  }

  touchReset(seq: number): void {
    this.sendOneWay('input.touchReset', {
      seq,
    })
  }

  type(text: string): void {
    this.sendOneWay('input.type', {
      text,
    })
  }

  paste(text: string): void {
    this.sendTwoWay('clipboard.paste', {
      text,
    })
  }

  copy(): Promise<unknown> {
    return this.sendTwoWay('clipboard.copy')
  }

  keyDown(key: string): void {
    return this.keySender('input.keyDown', key)
  }

  keyUp(key: string): void {
    return this.keySender('input.keyUp', key)
  }

  changeQuality(quality: number): void {
    return this.sendOneWay('quality.change', {
      quality,
    })
  }

  rotate(rotation: number, lock?: boolean): void {
    return this.sendOneWay('display.rotate', {
      rotation,
      lock,
    })
  }

  startRemoteConnect(): Promise<unknown> {
    return this.sendTwoWay('connect.start')
  }

  home = this.keyPress('home')
  menu = this.keyPress('menu')
  back = this.keyPress('back')
  appSwitch = this.keyPress('app_switch')
  switchCharset = this.keyPress('switch_charset')
  power = this.keyPress('power')
  camera = this.keyPress('camera')
  search = this.keyPress('search')
  mute = this.keyPress('mute')
  volumeDown = this.keyPress('volume_down')
  volumeUp = this.keyPress('volume_up')
  mediaRewind = this.keyPress('media_rewind')
  mediaPrevious = this.keyPress('media_previous')
  mediaPlayPause = this.keyPress('media_play_pause')
  mediaStop = this.keyPress('media_stop')
  mediaNext = this.keyPress('media_next')
  mediaFastForward = this.keyPress('media_fast_forward')

  async unlockDevice(): Promise<void> {
    await this.shell('input text 1452')
    await this.shell('input keyevent 66')
  }

  setLightTheme(): void {
    this.shell('cmd uimode night no')
  }

  setDarkTheme(): void {
    this.shell('cmd uimode night yes')
  }

  enableDKA(): void {
    this.shell('settings put global always_finish_activities 1')
  }

  disableDKA(): void {
    this.shell('settings put global always_finish_activities 0')
  }

  enableGoogleServices(): void {
    this.shell('pm enable com.google.android.gms')
    this.shell('pm enable-user com.google.android.gms')
  }

  disableGoogleServices(): void {
    this.shell('pm disable-user com.google.android.gms')
  }

  openLanguageChange(): void {
    this.shell('am start -a android.settings.LOCALE_SETTINGS')
  }

  fontChange(value: number): void {
    this.shell(`settings put system font_scale ${value}`)
  }

  private shell(command: string): Promise<unknown> {
    return this.sendTwoWay('shell.command', {
      command,
      timeout: 10000,
    })
  }

  private sendOneWay<T>(action: string, data?: T): void {
    socket.emit(action, this.deviceChannel, data)
  }

  private sendTwoWay<T>(action: string, data?: T): Promise<unknown> {
    const transaction = new TransactionService()
    const { channel: transactionChannel, promise: transactionEndPromise } = transaction.initializeTransaction()

    const platformSpecificAction = this.isDeviceIos ? `${action}Ios` : action

    socket.emit(platformSpecificAction, this.deviceChannel, transactionChannel, data)

    return transactionEndPromise
  }

  private keySender(type: string, key: string): void {
    if (KEYBOARD_KEYS_MAP[key]) {
      this.sendOneWay(type, {
        key: KEYBOARD_KEYS_MAP[key],
      })
    }
  }

  private keyPress(key: string): () => void {
    return () => {
      this.sendOneWay('input.keyPress', {
        key,
      })
    }
  }
}
