import { inject, injectable } from 'inversify'

import { DeviceConnection } from '@/store/device-connection'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceErrorModalStore } from '@/store/device-error-modal-store'

import { LogcatService } from './logcat-service'

@injectable()
export class DeviceLifecycleService {
  constructor(
    @inject(CONTAINER_IDS.logcatService) private logcatService: LogcatService,
    @inject(CONTAINER_IDS.deviceConnection) private deviceConnection: DeviceConnection,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {}

  prepareDevice(): void {
    this.deviceBySerialStore.session.activate()
    this.deviceConnection.useDevice()
    this.deviceBySerialStore.addDeviceChangeListener()
  }

  cleanupDevice(): void {
    this.deviceBySerialStore.removeDeviceChangeListener()
    this.logcatService.terminateLogcat()
    this.deviceBySerialStore.session.scheduleDispose()

    deviceErrorModalStore.clearError()
  }
}
