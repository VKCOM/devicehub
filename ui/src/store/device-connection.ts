import { authStore } from '@/store/auth-store'
import { t } from 'i18next'
import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { GroupService } from '@/services/group-service'
import { SettingsService } from '@/services/settings-service/settings-service'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { DeviceControlStore } from './device-control-store'
import { DeviceBySerialStore } from './device-by-serial-store'
import { deviceErrorModalStore } from './device-error-modal-store'

@injectable()
@deviceConnectionRequired()
export class DeviceConnection {
  debugCommand: string = ''

  constructor(
    @inject(CONTAINER_IDS.deviceSerial) private serial: string,
    @inject(CONTAINER_IDS.groupService) private groupService: GroupService,
    @inject(CONTAINER_IDS.settingsService) private settingsService: SettingsService,
    @inject(CONTAINER_IDS.deviceControlStore) private deviceControlStore: DeviceControlStore,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {
    makeAutoObservable(this)
  }

  async useDevice(): Promise<void> {
    try {
      const device = await this.deviceBySerialStore.fetch()
      const session = this.deviceBySerialStore.session
      if (session.silent) await session.start()
      if (!device?.channel) throw new Error('Device is not cooperating.')

      const startRemoteConnectResult = await this.deviceControlStore.startRemoteConnect()

      startRemoteConnectResult.donePromise
        .then(({ data }) => {
          this.debugCommand =
            device.manufacturer === 'Apple'
              ? session.silent
                ? `curl -H 'Authorization: Bearer ${authStore.jwt}' 'http://${data}/status'`
                : `curl http://${data}/status`
              : device.platform === 'Tizen'
                ? `sdb connect ${data}`
                : device.ready
                  ? `adb connect ${data}`
                  : 'Error'
        })
        .catch((error) => {
          this.debugCommand = error.message
        })

      if (session.silent) return
      await this.groupService.invite(this.serial, device.group)

      this.settingsService.updateLastUsedDevice(this.serial)
    } catch (error) {
      deviceErrorModalStore.setError(t('Connection failed'))

      console.error(error)
    }
  }
}
