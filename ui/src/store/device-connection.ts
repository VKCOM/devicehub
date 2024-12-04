import { makeAutoObservable } from 'mobx'

import { controlService } from '@/services/core/control-service/control-service'
import { groupService } from '@/services/group-service'
import { settingsService } from '@/services/settings-service'

import { deviceListStore } from './device-list-store'
import { deviceBySerialStore } from './device-by-serial-store'

class DeviceConnection {
  constructor() {
    makeAutoObservable(this)
  }

  async useDevice(serial: string): Promise<void> {
    const device = await deviceBySerialStore.fetch(serial)

    if (!device?.channel) return

    try {
      const connectToDevice = await Promise.all([
        controlService.startRemoteConnect(device.channel, !!device?.ios),
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
