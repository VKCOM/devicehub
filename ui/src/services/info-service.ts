import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceControlStore } from '@/store/device-control-store'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

@injectable()
@deviceConnectionRequired()
export class InfoService {
  sdCardMounted: boolean | undefined

  constructor(
    @inject(CONTAINER_IDS.deviceControlStore) private deviceControlStore: DeviceControlStore,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {
    makeAutoObservable(this)

    this.getSdStatus()
  }

  findDevice(): void {
    const { data: device } = this.deviceBySerialStore.deviceQueryResult()

    if (device?.manufacturer === 'Apple') {
      this.deviceControlStore.finder()
    }

    if (device?.manufacturer !== 'Apple') {
      this.deviceControlStore.identify()
    }
  }

  async getSdStatus(): Promise<void> {
    const sdStatusResult = await this.deviceControlStore.getSdStatus()
    const { data } = await sdStatusResult.donePromise

    if (data === 'sd_mounted') {
      this.sdCardMounted = true
    }

    if (data === 'sd_unmounted') {
      this.sdCardMounted = false
    }
  }
}
