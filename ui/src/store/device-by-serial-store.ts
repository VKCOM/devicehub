import { action, makeAutoObservable } from 'mobx'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import { MobxQuery } from './mobx-query'

import type { AxiosError } from 'axios'
import type { Device } from '@/generated/types'
import type { QueryObserverResult } from '@tanstack/react-query'

class DeviceBySerialStore {
  private deviceQuery = new MobxQuery(
    () => ({ ...queries.devices.bySerial(this.serial), enabled: !!this.serial }),
    queryClient
  )

  serial = ''

  constructor() {
    makeAutoObservable(this, {
      setSerial: action,
    })
  }

  setSerial(serial: string): void {
    this.serial = serial
  }

  deviceQueryResult(serial: string): QueryObserverResult<Device, AxiosError> {
    this.setSerial(serial)

    return this.deviceQuery.result
  }

  fetch(serial: string): Promise<Device> {
    this.setSerial(serial)

    return this.deviceQuery.fetch()
  }
}

export const deviceBySerialStore = new DeviceBySerialStore()
