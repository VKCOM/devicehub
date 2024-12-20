import { makeAutoObservable } from 'mobx'

import { deviceBySerialStore } from '@/store/device-by-serial-store'

import { groupService } from './group-service'

export class BookingService {
  bookedBeforeTime: string | undefined

  constructor(serial: string) {
    makeAutoObservable(this)

    this.init(serial)
  }

  async init(serial: string): Promise<void> {
    const { data: device } = deviceBySerialStore.deviceQueryResult(serial)

    if (device?.statusChangedAt && device.bookedBefore) {
      this.setTime(device.statusChangedAt, device.bookedBefore)
    }
  }

  async reBookDevice(serial: string): Promise<void> {
    const device = await deviceBySerialStore.fetch(serial)

    groupService.invite(device).then(() => {
      if (device.statusChangedAt && device.bookedBefore) {
        this.setTime(device.statusChangedAt, device.bookedBefore)
      }
    })
  }

  async setTime(statusChangedAt: string, bookedBefore: number): Promise<void> {
    const expireTime = new Date(new Date(statusChangedAt).getTime() + bookedBefore)

    this.bookedBeforeTime = expireTime.toISOString()
  }
}
