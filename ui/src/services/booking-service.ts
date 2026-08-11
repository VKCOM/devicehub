import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { GroupService } from './group-service'

@injectable()
@deviceConnectionRequired()
export class BookingService {
  bookedBeforeTime = ''

  constructor(
    @inject(CONTAINER_IDS.groupService) private groupService: GroupService,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {
    makeAutoObservable(this)

    this.init()
  }

  async init(): Promise<void> {
    const device = await this.deviceBySerialStore.fetch()

    if (device.statusChangedAt) {
      this.setTime(device.statusChangedAt, device.bookedBefore || 0)
    }
  }

  async reBookDevice(): Promise<void> {
    const { data: device } = await this.deviceBySerialStore.refetch()

    if (!device || !device.serial) return

    await this.groupService.invite(device.serial, device.group)

    if (device.statusChangedAt) {
      this.setTime(device.statusChangedAt, device?.bookedBefore || 0)
    }
  }

  setTime(statusChangedAt: string, bookedBefore: number): void {
    const expireTime = new Date(new Date(statusChangedAt).getTime() + bookedBefore)

    this.bookedBeforeTime = expireTime.toISOString()
  }
}
