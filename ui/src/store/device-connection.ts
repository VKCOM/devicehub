import { makeAutoObservable } from 'mobx'

import { controlService } from '@/services/core/control-service'
import { groupService } from '@/services/group-service'
import { settingsService } from '@/services/settings-service'

import { deviceListStore } from './device-list-store'

class DeviceConnection {
  constructor() {
    makeAutoObservable(this)
  }

  async useDevice(serial: string): Promise<void> {
    const device = deviceListStore.deviceBySerial(serial)

    if (!device) return

    try {
      const connectToDevice = await Promise.all([
        controlService.startRemoteConnect(device),
        groupService.invite(device),
      ])

      console.info(`adb connect ${connectToDevice[0]}`)

      settingsService.setLastUsedDevice(serial)
    } catch (error) {
      // TODO: Обработать ошибку, показать toast
      console.error(error)
    }
  }

  stopUsingDevice(serial: string): void {
    const device = deviceListStore.deviceBySerial(serial)

    if (!device) return

    groupService.kick(device)
  }
}

export const deviceConnection = new DeviceConnection()
