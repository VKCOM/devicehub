import { injectable, unmanaged } from 'inversify'
import { makeAutoObservable, runInAction } from 'mobx'

import { socket } from '@/api/socket'

import { throttle } from '@/lib/utils/throttle.util'
import { filterLogs } from '@/lib/utils/filter-logs.util'
import { logsTableState } from '@/store/logs-table-state'

import type { DeviceLogs } from './types'
import type { LogcatEntryMessage } from '@/types/logcat-entry-message.type'

@injectable()
export class LogsTrackerService {
  private batchLogsSize = 25
  private batchedLogs: LogcatEntryMessage[] = []
  private throttleDelay = 100

  /* NOTE: Do not mutate this object to ensure stable references for React Table.
    For more details, see: https://tanstack.com/table/latest/docs/guide/data#give-data-a-stable-reference
  */
  logsByDeviceSerial: Record<string, DeviceLogs> = {}
  maxLogsBuffer = 3000

  private throttledFlushLogs = throttle(this.flushLogs, this.throttleDelay)

  constructor(@unmanaged() private connection = socket) {
    makeAutoObservable<this, 'connection'>(this, { connection: false })

    this.flushLogs = this.flushLogs.bind(this)
    this.onLogcatEntry = this.onLogcatEntry.bind(this)
  }

  initializeLogcatTracker(serial: string): void {
    if (this.logsByDeviceSerial[serial]) {
      this.setLogcatStarted(serial, true)
    }

    if (!this.logsByDeviceSerial[serial]) {
      this.logsByDeviceSerial = {
        ...this.logsByDeviceSerial,
        [serial]: {
          logs: [],
          isLogcatStarted: true,
        },
      }
    }

    this.connection.on('logcat.entry', this.onLogcatEntry)
  }

  stopLogcatTracker(serial: string): void {
    this.setLogcatStarted(serial, false)

    this.connection.off('logcat.entry', this.onLogcatEntry)
  }

  clearDeviceLogs(serial: string): void {
    this.logsByDeviceSerial = {
      ...this.logsByDeviceSerial,
      [serial]: {
        ...this.logsByDeviceSerial[serial],
        logs: [],
      },
    }
  }

  private onLogcatEntry(data: LogcatEntryMessage): void {
    this.batchedLogs.push(data)

    if (this.batchedLogs.length >= this.batchLogsSize) {
      this.flushLogs(data.serial)
    }

    this.throttledFlushLogs(data.serial)
  }

  private flushLogs(serial: string): void {
    const filteredLogs = filterLogs(this.batchedLogs, logsTableState.columnFilters)

    runInAction(() => {
      this.logsByDeviceSerial = {
        ...this.logsByDeviceSerial,
        [serial]: {
          ...this.logsByDeviceSerial[serial],
          logs: [...this.logsByDeviceSerial[serial].logs, ...filteredLogs],
        },
      }
    })

    this.batchedLogs = []

    if (this.logsByDeviceSerial[serial].logs.length > this.maxLogsBuffer) {
      this.logsByDeviceSerial[serial].logs = this.logsByDeviceSerial[serial].logs.slice(-this.maxLogsBuffer)
    }
  }

  private setLogcatStarted(serial: string, isStarted: boolean): void {
    this.logsByDeviceSerial = {
      ...this.logsByDeviceSerial,
      [serial]: {
        ...this.logsByDeviceSerial[serial],
        isLogcatStarted: isStarted,
      },
    }
  }
}
