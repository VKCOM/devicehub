import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { LogcatService } from '@/services/logcat-service'

import { saveFile } from '@/lib/utils/save-file.util'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'
import { LogPriority } from '@/types/enums/log-priority.enum'

import type { LogsFileExtension } from './types'
import type { LogcatEntryMessage } from '@/types/logcat-entry-message.type'

@injectable()
@deviceConnectionRequired()
export class SaveLogsService {
  logsFileName = ''
  selectedExtension: LogsFileExtension = 'json'

  constructor(
    @inject(CONTAINER_IDS.deviceSerial) private serial: string,
    @inject(CONTAINER_IDS.logcatService) private logcatService: LogcatService,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {
    makeAutoObservable(this)

    this.logsFileName = `${this.serial}_logs`
  }

  setLogsFileName(fileName: string): void {
    this.logsFileName = fileName
  }

  setSelectedExtension(extension: LogsFileExtension): void {
    this.selectedExtension = extension
  }

  saveLogs(): void {
    const { data: device } = this.deviceBySerialStore.deviceQueryResult()

    const parsedLogs = this.parseLogsToDefinedExtension(
      this.logcatService.deviceLogs,
      this.selectedExtension,
      device?.manufacturer === 'Apple' ? 'Apple' : 'Android'
    )
    const mimeType = this.selectedExtension === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'

    const blob = new Blob([parsedLogs], { type: mimeType })

    if (this.logsFileName) {
      saveFile(blob, `${this.logsFileName}.${this.selectedExtension}`)

      return
    }

    saveFile(blob, `${this.serial}_logs.${this.selectedExtension}`)
  }

  private parseLogsToDefinedExtension(
    logs: LogcatEntryMessage[],
    logExtension: LogsFileExtension,
    deviceOS: string
  ): string {
    if (logExtension === 'log') {
      return logs
        .map(({ date, pid, tag, priority: priorityLabel, message }) =>
          [date, pid, tag, priorityLabel, message].join('\t')
        )
        .join('\n')
    }

    return JSON.stringify({
      deviceOS,
      serial: logs[0].serial,
      logs: logs.map(({ date, pid, tag, priority: priorityLabel, message }) => ({
        date,
        pid,
        tag,
        priorityLabel: LogPriority[priorityLabel],
        message,
      })),
    })
  }
}
