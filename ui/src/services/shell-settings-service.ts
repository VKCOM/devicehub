import { inject, injectable } from 'inversify'
import { action, computed, makeObservable, observable, runInAction } from 'mobx'

import { socket } from '@/api/socket'

import { queries } from '@/config/queries/query-key-store'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ListManagementService } from './list-management-service'
import { TransactionService } from './core/transaction-service/transaction-service'

import type { ShellDevice } from '@/types/shell-device.type'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'

@injectable()
export class ShellSettingsService extends ListManagementService<'serial', ShellDevice> {
  private devicesQuery
  private shellOutputBuffer: Record<string, string[]> = {}

  @observable command = ''
  @observable shellResults: Record<string, string> = {}

  constructor(@inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory) {
    super('serial')

    makeObservable(this)

    this.devicesQuery = mobxQueryFactory(() => ({ ...queries.devices.shell }))
  }

  @computed
  get devicesQueryResult(): QueryObserverResult<ShellDevice[]> {
    return this.devicesQuery.result
  }

  @computed
  get items(): ShellDevice[] {
    return this.devicesQueryResult.data?.filter((item) => this.filterDevice(item)) || []
  }

  fetchDevices(): Promise<ShellDevice[]> {
    return this.devicesQuery.fetch()
  }

  @action
  setCommand(command: string): void {
    this.command = command
  }

  @action
  clear(): void {
    this.command = ''
    this.shellResults = {}
  }

  @action
  async runShellCommand(): Promise<void> {
    try {
      const devices = await this.fetchDevices()

      const shellPromises = devices.map((device) => {
        const transaction = new TransactionService()
        const initializeTransaction = transaction.initializeTransaction()

        socket.emit('shell.command', device.serial, initializeTransaction.channel, {
          command: this.command,
          timeout: 60000,
        })

        this.shellOutputBuffer[device.serial] = []

        initializeTransaction.subscribeToProgress((_, result, seq) => {
          if (result) {
            runInAction(() => {
              this.shellOutputBuffer[device.serial][seq] = result
            })
          }

          if (!result) {
            this.shellOutputBuffer[device.serial][seq] = ''
          }
        })

        return {
          promise: initializeTransaction.donePromise,
          serial: device.serial,
        }
      })

      shellPromises.forEach(({ promise, serial }) => {
        promise
          .then((result) => {
            runInAction(() => {
              this.shellResults[result.source] = this.shellOutputBuffer[result.source].join('')
            })
          })
          .catch((error) => {
            if (error instanceof Error) {
              runInAction(() => {
                this.shellResults[serial] = error.message
              })
            }
          })
      })

      runInAction(() => {
        this.command = ''
      })
    } catch (error) {
      console.error(error)
    }
  }

  private filterDevice(item: ShellDevice): boolean {
    if (!this.globalFilter) return true

    if (
      this.startsWithFilter(item.sdk) ||
      this.startsWithFilter(item.place) ||
      this.startsWithFilter(item.model) ||
      this.startsWithFilter(item.serial) ||
      this.startsWithFilter(item.version) ||
      this.startsWithFilter(item.storageId) ||
      this.startsWithFilter(item.marketName) ||
      this.startsWithFilter(item.manufacturer) ||
      this.startsWithFilter(item.provider?.name) ||
      this.startsWithFilter(item.group?.originName)
    ) {
      return true
    }

    return false
  }
}
