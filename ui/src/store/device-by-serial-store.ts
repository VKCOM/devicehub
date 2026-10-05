import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'
import { merge } from 'lodash'

import { DeviceSession } from '@/services/device-session'
import { socket } from '@/api/socket'
import { getDeviceBySerial } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { getDeviceState } from '@/lib/utils/get-device-state.util'
import { DeviceState } from '@/types/enums/device-state.enum'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { DEVICE_LIKELY_LEAVE_REASON } from '@/constants/device-likely-leave-reason-map'

import { deviceErrorModalStore } from './device-error-modal-store'

import type { Device } from '@/generated/types'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { DeviceChangeMessage } from '@/types/device-change-message.type'

@injectable()
@deviceConnectionRequired()
export class DeviceBySerialStore {
  private deviceQuery

  constructor(
    @inject(CONTAINER_IDS.deviceSession) readonly session: DeviceSession,
    @inject(CONTAINER_IDS.deviceSerial) private serial: string,
    @inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory
  ) {
    makeAutoObservable(this)

    this.deviceQuery = mobxQueryFactory<Device>(() => ({
      ...(session.silent
        ? {
            queryKey: session.queryKey,
            queryFn: () => session.describe(),
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          }
        : { queryKey: queries.devices.bySerial(serial).queryKey, queryFn: () => getDeviceBySerial(serial) }),
      staleTime: session.silent ? Infinity : 3 * (60 * 1000),
      enabled: !!serial,
    }))

    this.onDeviceChange = this.onDeviceChange.bind(this)
  }

  addDeviceChangeListener(): void {
    if (!this.session.silent) socket.on('device.change', this.onDeviceChange)
  }

  removeDeviceChangeListener(): void {
    if (!this.session.silent) socket.off('device.change', this.onDeviceChange)
  }

  private async onDeviceChange({ data: changedData }: DeviceChangeMessage<Partial<Device>>): Promise<void> {
    if (changedData.serial !== this.serial) return

    queryClient.setQueryData<Device>(queries.devices.bySerial(this.serial).queryKey, (oldData) => {
      if (!oldData) return undefined

      const newData = merge({}, oldData, changedData)

      const prevDeviceState = getDeviceState(oldData)
      const nextDeviceState = getDeviceState(newData)

      if (
        (prevDeviceState === DeviceState.USING && prevDeviceState !== nextDeviceState) ||
        (prevDeviceState === DeviceState.AUTOMATION && prevDeviceState !== nextDeviceState)
      ) {
        const leaveReason = newData.likelyLeaveReason
          ? DEVICE_LIKELY_LEAVE_REASON[newData.likelyLeaveReason]
          : 'Unknown reason'

        deviceErrorModalStore.setError(leaveReason)

        return newData
      }

      if (
        (nextDeviceState === DeviceState.USING && nextDeviceState !== prevDeviceState) ||
        (nextDeviceState === DeviceState.AUTOMATION && nextDeviceState !== prevDeviceState)
      ) {
        deviceErrorModalStore.clearError()
      }

      return newData
    })
  }

  deviceQueryResult(): QueryObserverResult<Device> {
    return this.deviceQuery.result
  }

  fetch(): Promise<Device> {
    return this.deviceQuery.fetch()
  }

  refetch(): Promise<QueryObserverResult<Device>> {
    return this.deviceQuery.refetch()
  }
}
