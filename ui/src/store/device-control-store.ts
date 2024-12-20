import { makeObservable, observable } from 'mobx'

import { DeviceControlService } from '@/services/core/device-control-service/device-control-service'

import { deviceBySerialStore } from './device-by-serial-store'

import type { EffectiveConnectionType } from '@/vite-env'

export class DeviceControlStore extends DeviceControlService {
  private currentNetworkType: EffectiveConnectionType = '3g'

  currentQuality = 60

  constructor(deviceChannel: string, isDeviceIos: boolean) {
    super(deviceChannel, isDeviceIos)

    makeObservable(this, {
      currentQuality: observable,
    })
  }

  setCurrentQuality(quality: number): void {
    this.currentQuality = quality
  }

  changeToSmallFont(): void {
    this.fontChange(0.85)
  }

  changeToNormalFont(): void {
    this.fontChange(1.0)
  }

  changeToBigFont(): void {
    this.fontChange(1.3)
  }

  tryToRotate(serial: string, rotation: 'portrait' | 'landscape'): void {
    if (rotation === 'portrait') {
      this.rotate(0)

      setTimeout(() => {
        if (serial && this.isLandscape(serial)) {
          console.info('tryToRotate but it still landscape')
        }
      }, 400)
    }

    if (rotation === 'landscape') {
      this.rotate(90)

      setTimeout(() => {
        if (serial && this.isPortrait(serial)) {
          console.info('tryToRotate but it still portrait')
        }
      }, 400)
    }
  }

  rotateLeft(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.display?.rotation) return

    if (device.display.rotation === 0) {
      this.rotate(270)

      return
    }

    this.rotate(device.display.rotation - 90)
  }

  rotateRight(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.display?.rotation) return

    if (device.display.rotation === 270) {
      this.rotate(0)

      return
    }

    this.rotate(device.display.rotation + 90)
  }

  changeDeviceQuality(quality: number): void {
    this.changeQuality(quality)

    this.setCurrentQuality(quality)
  }

  autoQuality(): void {
    // NOTE: Limited browser availability
    const networkType = navigator.connection?.effectiveType || '4g'

    if (this.currentNetworkType === networkType) return

    this.currentNetworkType = networkType

    switch (this.currentNetworkType) {
      case 'slow-2g': {
        this.changeQuality(10)
        this.setCurrentQuality(10)
        break
      }

      case '2g': {
        this.changeQuality(20)
        this.setCurrentQuality(20)
        break
      }

      case '3g': {
        this.changeQuality(60)
        this.setCurrentQuality(60)
        break
      }

      case '4g': {
        this.changeQuality(80)
        this.setCurrentQuality(80)
        break
      }

      default: {
        this.changeQuality(80)
        this.setCurrentQuality(80)
      }
    }
  }

  private isPortrait(serial: string): boolean {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    return device?.display?.rotation === 0 || device?.display?.rotation === 180
  }

  private isLandscape(serial: string): boolean {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    return device?.display?.rotation === 90 || device?.display?.rotation === 270
  }
}
