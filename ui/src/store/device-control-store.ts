import { makeAutoObservable } from 'mobx'

import { controlService } from '@/services/core/control-service/control-service'

import { deviceBySerialStore } from './device-by-serial-store'

import type { EffectiveConnectionType } from '@/vite-env'

class DeviceControlStore {
  private currentNetworkType: EffectiveConnectionType = '3g'

  currentQuality = 60

  constructor() {
    makeAutoObservable(this)
  }

  setCurrentQuality(quality: number): void {
    this.currentQuality = quality
  }

  goHome(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    controlService.home(device.channel)
  }

  openMenu(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    controlService.menu(device.channel)
  }

  openAppSwitch(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    controlService.appSwitch(device.channel)
  }

  goBack(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    controlService.back(device.channel)
  }

  tryToRotate(serial: string, rotation: 'portrait' | 'landscape'): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    if (rotation === 'portrait') {
      controlService.rotate(device.channel, 0)

      setTimeout(() => {
        if (device.serial && this.isLandscape(device.serial)) {
          console.info('tryToRotate but it still landscape')
        }
      }, 400)
    }

    if (rotation === 'landscape') {
      controlService.rotate(device.channel, 90)

      setTimeout(() => {
        if (device.serial && this.isPortrait(device.serial)) {
          console.info('tryToRotate but it still portrait')
        }
      }, 400)
    }
  }

  rotateLeft(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.display?.rotation || !device.channel) return

    if (device.display.rotation === 0) {
      controlService.rotate(device.channel, 270)

      return
    }

    controlService.rotate(device.channel, device.display.rotation - 90)
  }

  rotateRight(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.display?.rotation || !device.channel) return

    if (device.display.rotation === 270) {
      controlService.rotate(device.channel, 0)

      return
    }

    controlService.rotate(device.channel, device.display.rotation + 90)
  }

  changeDeviceQuality(serial: string, quality: number): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    controlService.changeQuality(device.channel, quality)

    this.setCurrentQuality(quality)
  }

  autoQuality(serial: string): void {
    // NOTE: Limited browser availability
    const networkType = navigator.connection?.effectiveType || '4g'

    if (this.currentNetworkType === networkType) return

    this.currentNetworkType = networkType

    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.channel) return

    switch (this.currentNetworkType) {
      case 'slow-2g': {
        controlService.changeQuality(device.channel, 10)
        this.setCurrentQuality(10)
        break
      }

      case '2g': {
        controlService.changeQuality(device.channel, 20)
        this.setCurrentQuality(20)
        break
      }

      case '3g': {
        controlService.changeQuality(device.channel, 60)
        this.setCurrentQuality(60)
        break
      }

      case '4g': {
        controlService.changeQuality(device.channel, 80)
        this.setCurrentQuality(80)
        break
      }

      default: {
        controlService.changeQuality(device.channel, 80)
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

export const deviceControlStore = new DeviceControlStore()
