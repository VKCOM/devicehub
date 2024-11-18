import { makeAutoObservable } from 'mobx'

import { socket } from '@/api/socket'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { DeviceState } from '@/types/enums/device-state.enum'
import { getDeviceState } from '@/lib/utils/get-device-state.util'
import { isDeviceUsable } from '@/lib/utils/is-device-usable.util'

import { MobxQuery } from './mobx-query'

import type { AxiosError } from 'axios'
import type { Device } from '@/generated/types'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { DeviceChangeMessage } from '@/types/device-change-message.type'

class DeviceListStore {
  private devicesQuery = new MobxQuery(() => ({ ...queries.devices.all, staleTime: Infinity }), queryClient)

  constructor() {
    makeAutoObservable(this)

    this.addDeviceChangeListener()
  }

  deviceBySerial(serial: string): Device | undefined {
    return this.devicesQuery.data?.find((item) => item.serial === serial)
  }

  addDeviceChangeListener(): void {
    socket.on('device.change', this.onDeviceChange)
  }

  removeDeviceChangeListener(): void {
    socket.off('device.change', this.onDeviceChange)
  }

  get devicesQueryResult(): QueryObserverResult<Device[], AxiosError> {
    return this.devicesQuery.result
  }

  get busyDevicesCount(): number | undefined {
    return this.devicesQuery.data?.reduce(
      (accumulator, item) => (getDeviceState(item) === DeviceState.BUSY ? accumulator + 1 : accumulator),
      0
    )
  }

  get totalNumberDevices(): number | undefined {
    return this.devicesQuery.data?.length
  }

  get usableDevicesCount(): number | undefined {
    return this.devicesQuery.data?.reduce(
      (accumulator, { present, status, ready, using, owner }) =>
        isDeviceUsable({ present, status, ready, using, hasOwner: !!owner }) ? accumulator + 1 : accumulator,
      0
    )
  }

  get usingDevicesCount(): number | undefined {
    return this.devicesQuery.data?.reduce((accumulator, item) => (item.using ? accumulator + 1 : accumulator), 0)
  }

  private onDeviceChange({ data: changedData }: DeviceChangeMessage<Partial<Device>>): void {
    queryClient.setQueryData<Device[]>(queries.devices.all.queryKey, (oldData) => {
      if (!oldData) return []

      return oldData.map((item) => {
        if (item.serial === changedData.serial) {
          return { ...item, ...changedData }
        }

        return item
      })
    })
  }
}

export const deviceListStore = new DeviceListStore()
