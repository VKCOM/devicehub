import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { downloadFile } from '@/api/openstf'
import { FSListMessage } from '@/types/fs-list-message.type'

import { saveFile } from '@/lib/utils/save-file.util'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceControlStore } from '@/store/device-control-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { S_IFDIR, S_IFLNK, S_IFMT } from '@/constants/file-bit-masks'

@injectable()
@deviceConnectionRequired()
export class FileExplorerService {
  currentPath = '/'
  fsList: FSListMessage[] = []
  isDirectoryLoading = true
  /* NOTE: The listing of the current path failed, e.g. a folder the shell user may not read */
  isDirectoryError = false

  private listRequestId = 0

  constructor(@inject(CONTAINER_IDS.deviceControlStore) private deviceControlStore: DeviceControlStore) {
    makeAutoObservable(this)

    this.listDirectory()
  }

  get sortedFsList(): FSListMessage[] {
    return this.fsList.slice().sort((prev, next) => {
      const isPrevDirectory = this.isDirectory(prev.mode)
      const isNextDirectory = this.isDirectory(next.mode)

      if (isPrevDirectory !== isNextDirectory) {
        return isPrevDirectory ? -1 : 1
      }

      return prev.name.localeCompare(next.name)
    })
  }

  get isFsListEmpty(): boolean {
    return this.fsList.length === 0
  }

  setCurrentPath(value: string): void {
    this.currentPath = value

    if (!this.currentPath.startsWith('/')) {
      this.currentPath = `/${this.currentPath}`
    }
  }

  enterDirectoryLocation(): void {
    if (!this.currentPath) return

    this.currentPath = this.currentPath.replace(/\/\/+/g, '/')

    this.listDirectory()
  }

  addSegment(value: string): void {
    this.currentPath = this.appendPathSegment(value)

    this.listDirectory()
  }

  async getFile(fileName: string): Promise<void> {
    try {
      const path = this.appendPathSegment(fileName)

      const fsRetrieveResult = await this.deviceControlStore.fsRetrieve(path)
      const { content } = await fsRetrieveResult.donePromise

      if (!content) return

      const blob = await downloadFile(content.href)

      saveFile(blob, fileName)
    } catch (error) {
      console.error(error)
    }
  }

  goHome(): void {
    this.currentPath = '/'

    this.listDirectory()
  }

  upDirectory(): void {
    if (!this.currentPath) return

    const lastSlashIndex = this.currentPath.lastIndexOf('/')

    if (lastSlashIndex !== -1) {
      this.currentPath = this.currentPath.slice(0, lastSlashIndex)
    }

    if (this.currentPath === '') this.currentPath = '/'

    this.listDirectory()
  }

  isDirectory(value: number): boolean {
    return (value & S_IFMT) === S_IFDIR || (value & S_IFMT) === S_IFLNK
  }

  private appendPathSegment(segment: string): string {
    return this.currentPath === '/' ? `/${segment}` : `${this.currentPath}/${segment}`
  }

  /*
   * NOTE: The list always shows the current path: it is cleared while loading, an unreadable
   * folder ends up empty, and a late answer for a path left behind is dropped
   */
  private async listDirectory(): Promise<void> {
    const requestId = ++this.listRequestId

    this.fsList = []
    this.isDirectoryLoading = true
    this.isDirectoryError = false

    try {
      const fsListResult = await this.deviceControlStore.fsList(this.currentPath)
      const { content } = await fsListResult.donePromise

      if (requestId !== this.listRequestId) return

      this.setListing(content ?? [], !content)
    } catch (error) {
      console.error(error)

      if (requestId === this.listRequestId) this.setListing([], true)
    }
  }

  private setListing(content: FSListMessage[], isError: boolean): void {
    this.fsList = content
    this.isDirectoryError = isError
    this.isDirectoryLoading = false
  }
}
