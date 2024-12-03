import { socket } from '@/api/socket'
import { TransactionService } from '@/services/core/transaction-service/transaction-service'

import { KEYBOARD_KEYS_MAP } from '@/constants/keyboard-keys-map'

import type { SendTwoWayArgs, TouchDownArgs, TouchMoveArgs, TouchMoveIosArgs } from './types'

class ControlService {
  gestureStart(deviceChannel: string, seq: number): void {
    this.sendOneWay(deviceChannel, 'input.gestureStart', {
      seq,
    })
  }

  gestureStop(deviceChannel: string, seq: number): void {
    this.sendOneWay(deviceChannel, 'input.gestureStop', {
      seq,
    })
  }

  touchDown({ deviceChannel, seq, contact, x, y, pressure }: TouchDownArgs): void {
    this.sendOneWay(deviceChannel, 'input.touchDown', {
      seq,
      contact,
      x,
      y,
      pressure,
    })
  }

  tapDeviceTreeElement(deviceChannel: string, label: string): void {
    this.sendOneWay(deviceChannel, 'tapDeviceTreeElement', {
      label,
    })
  }

  // NOTE: I have no idea where this method used
  touchMoveIos({ deviceChannel, x, y, pX, pY, pressure, contact, seq }: TouchMoveIosArgs): void {
    this.sendOneWay(deviceChannel, 'input.touchMoveIos', {
      seq,
      contact,
      toX: x,
      toY: y,
      fromX: pX,
      fromY: pY,
      pressure,
    })
  }

  touchMove({ deviceChannel, seq, contact, x, y, pressure }: TouchMoveArgs): void {
    this.sendOneWay(deviceChannel, 'input.touchMove', {
      seq,
      contact,
      x,
      y,
      pressure,
    })
  }

  touchUp(deviceChannel: string, seq: number, contact: number): void {
    this.sendOneWay(deviceChannel, 'input.touchUp', {
      seq,
      contact,
    })
  }

  touchCommit(deviceChannel: string, seq: number): void {
    this.sendOneWay(deviceChannel, 'input.touchCommit', {
      seq,
    })
  }

  touchReset(deviceChannel: string, seq: number): void {
    this.sendOneWay(deviceChannel, 'input.touchReset', {
      seq,
    })
  }

  type(deviceChannel: string, text: string): void {
    this.sendOneWay(deviceChannel, 'input.type', {
      text,
    })
  }

  paste(deviceChannel: string, isDeviceIos: boolean, text: string): void {
    this.sendTwoWay({
      deviceChannel,
      isDeviceIos,
      action: 'clipboard.paste',
      data: {
        text,
      },
    })
  }

  copy(deviceChannel: string, isDeviceIos: boolean): Promise<unknown> {
    return this.sendTwoWay({ deviceChannel, isDeviceIos, action: 'clipboard.copy' })
  }

  keyDown(deviceChannel: string): (key: string) => void {
    return this.keySender(deviceChannel, 'input.keyDown')
  }

  keyUp(deviceChannel: string): (key: string) => void {
    return this.keySender(deviceChannel, 'input.keyUp')
  }

  keyPress(deviceChannel: string): (key: string) => void {
    return this.keySender(deviceChannel, 'input.keyPress')
  }

  home(deviceChannel: string): void {
    return this.fixedKeySender(deviceChannel, 'input.keyPress', 'home')
  }

  menu(deviceChannel: string): void {
    return this.fixedKeySender(deviceChannel, 'input.keyPress', 'menu')
  }

  back(deviceChannel: string): void {
    return this.fixedKeySender(deviceChannel, 'input.keyPress', 'back')
  }

  appSwitch(deviceChannel: string): void {
    return this.fixedKeySender(deviceChannel, 'input.keyPress', 'app_switch')
  }

  changeQuality(deviceChannel: string, quality: number): void {
    return this.sendOneWay(deviceChannel, 'quality.change', {
      quality,
    })
  }

  rotate(deviceChannel: string, rotation: number, lock?: boolean): void {
    return this.sendOneWay(deviceChannel, 'display.rotate', {
      rotation,
      lock,
    })
  }

  startRemoteConnect(deviceChannel: string, isDeviceIos: boolean): Promise<unknown> {
    return this.sendTwoWay({ deviceChannel, isDeviceIos, action: 'connect.start' })
  }

  private sendOneWay<T>(deviceChannel: string, action: string, data?: T): void {
    socket.emit(action, deviceChannel, data)
  }

  private sendTwoWay<T>({ deviceChannel, isDeviceIos, action, data }: SendTwoWayArgs<T>): Promise<unknown> {
    const transaction = new TransactionService()
    const { channel: transactionChannel, promise: transactionEndPromise } = transaction.initializeTransaction()

    const platformSpecificAction = isDeviceIos ? `${action}Ios` : action

    socket.emit(platformSpecificAction, deviceChannel, transactionChannel, data)

    return transactionEndPromise
  }

  private keySender(deviceChannel: string, type: string): (key: string) => void {
    return (key: string): void => {
      if (KEYBOARD_KEYS_MAP[key]) {
        this.sendOneWay(deviceChannel, type, {
          key: KEYBOARD_KEYS_MAP[key],
        })
      }
    }
  }

  private fixedKeySender(deviceChannel: string, type: string, fixedKey: string): void {
    this.sendOneWay(deviceChannel, type, {
      key: fixedKey,
    })
  }
}

export const controlService = new ControlService()
