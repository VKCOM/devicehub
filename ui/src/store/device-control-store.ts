import { makeAutoObservable } from 'mobx'

import { DeviceControlService } from '@/services/core/device-control-service/device-control-service'
import { serviceLocator } from '@/services/service-locator'

import { deviceBySerialStore } from './device-by-serial-store'

import type { EffectiveConnectionType } from '@/vite-env'

export class DeviceControlStore {
  private currentNetworkType: EffectiveConnectionType = '3g'
  private readonly deviceControlService: DeviceControlService

  currentQuality = 60

  constructor() {
    makeAutoObservable(this)
    this.deviceControlService = serviceLocator.get<DeviceControlService>(DeviceControlService.name)
  }

  setCurrentQuality(quality: number): void {
    this.currentQuality = quality
  }

  goHome(): void {
    this.deviceControlService.home()
  }

  openMenu(): void {
    this.deviceControlService.menu()
  }

  openAppSwitch(): void {
    this.deviceControlService.appSwitch()
  }

  goBack(): void {
    this.deviceControlService.back()
  }

  pressPower(): void {
    this.deviceControlService.power()
  }

  unlockDevice(): void {
    this.deviceControlService.unlockDevice()
  }

  useCamera(): void {
    this.deviceControlService.camera()
  }

  switchCharset(): void {
    this.deviceControlService.switchCharset()
  }

  openSearch(): void {
    this.deviceControlService.search()
  }

  mute(): void {
    this.deviceControlService.mute()
  }

  volumeDown(): void {
    this.deviceControlService.volumeDown()
  }

  volumeUp(): void {
    this.deviceControlService.volumeUp()
  }

  setLightTheme(): void {
    this.deviceControlService.setLightTheme()
  }

  setDarkTheme(): void {
    this.deviceControlService.setDarkTheme()
  }

  enableDKA(): void {
    this.deviceControlService.enableDKA()
  }

  disableDKA(): void {
    this.deviceControlService.disableDKA()
  }

  enableGoogleServices(): void {
    this.deviceControlService.enableGoogleServices()
  }

  disableGoogleServices(): void {
    this.deviceControlService.disableGoogleServices()
  }

  changeLanguage(): void {
    this.deviceControlService.openLanguageChange()
  }

  changeToSmallFont(): void {
    this.deviceControlService.fontChange(0.85)
  }

  changeToNormalFont(): void {
    this.deviceControlService.fontChange(1.0)
  }

  changeToBigFont(): void {
    this.deviceControlService.fontChange(1.3)
  }

  mediaRewind(): void {
    this.deviceControlService.mediaRewind()
  }

  mediaPrevious(): void {
    this.deviceControlService.mediaPrevious()
  }

  mediaPlayPause(): void {
    this.deviceControlService.mediaPlayPause()
  }

  mediaStop(): void {
    this.deviceControlService.mediaStop()
  }

  mediaNext(): void {
    this.deviceControlService.mediaNext()
  }

  mediaFastForward(): void {
    this.deviceControlService.mediaFastForward()
  }

  tryToRotate(serial: string, rotation: 'portrait' | 'landscape'): void {
    if (rotation === 'portrait') {
      this.deviceControlService.rotate(0)

      setTimeout(() => {
        if (serial && this.isLandscape(serial)) {
          console.info('tryToRotate but it still landscape')
        }
      }, 400)
    }

    if (rotation === 'landscape') {
      this.deviceControlService.rotate(90)

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
      this.deviceControlService.rotate(270)

      return
    }

    this.deviceControlService.rotate(device.display.rotation - 90)
  }

  rotateRight(serial: string): void {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (!device?.display?.rotation) return

    if (device.display.rotation === 270) {
      this.deviceControlService.rotate(0)

      return
    }

    this.deviceControlService.rotate(device.display.rotation + 90)
  }

  changeDeviceQuality(quality: number): void {
    this.deviceControlService.changeQuality(quality)

    this.setCurrentQuality(quality)
  }

  autoQuality(): void {
    // NOTE: Limited browser availability
    const networkType = navigator.connection?.effectiveType || '4g'

    if (this.currentNetworkType === networkType) return

    this.currentNetworkType = networkType

    switch (this.currentNetworkType) {
      case 'slow-2g': {
        this.deviceControlService.changeQuality(10)
        this.setCurrentQuality(10)
        break
      }

      case '2g': {
        this.deviceControlService.changeQuality(20)
        this.setCurrentQuality(20)
        break
      }

      case '3g': {
        this.deviceControlService.changeQuality(60)
        this.setCurrentQuality(60)
        break
      }

      case '4g': {
        this.deviceControlService.changeQuality(80)
        this.setCurrentQuality(80)
        break
      }

      default: {
        this.deviceControlService.changeQuality(80)
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
