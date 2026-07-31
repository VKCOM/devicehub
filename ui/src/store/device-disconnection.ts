import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { GroupService } from '@/services/group-service'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

@injectable()
export class DeviceDisconnection {
  constructor(@inject(CONTAINER_IDS.groupService) private groupService: GroupService) {
    makeAutoObservable(this)
  }

  async stopUsingDevice(serial: string): Promise<unknown> {
    return this.groupService.kick(serial)
  }
}
