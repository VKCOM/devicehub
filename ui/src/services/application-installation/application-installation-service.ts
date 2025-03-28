import { makeAutoObservable, runInAction } from 'mobx'
import { inject, injectable } from 'inversify'

import { uploadFile } from '@/api/openstf'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceControlStore } from '@/store/device-control-store'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { InitializeTransactionReturn } from '../core/transaction-service/types'

import type { Manifest } from '@/types/manifest.type'
import type { Device, ErrorResponse } from '@/generated/types'
import type { ActivityOptions, ActivityOptionsSet, RunActivityArgs, SelectOption } from './types'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { MobxMutationFactory } from '@/types/mobx-mutation-factory.type'
import type { GetManifestResponse, UploadFileArgs, UploadFileResponse } from '@/api/openstf/types'

@injectable()
@deviceConnectionRequired()
export class ApplicationInstallationService {
  private manifestQuery
  private uploadFileMutate

  href = ''
  status = 'Initialization'
  progress = 0
  isError = false
  isInstalling = false
  isInstalled = false
  device: Device | undefined = undefined

  constructor(
    @inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory,
    @inject(CONTAINER_IDS.factoryMobxMutation) mobxMutationFactory: MobxMutationFactory,
    @inject(CONTAINER_IDS.deviceControlStore) private deviceControlStore: DeviceControlStore,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {
    makeAutoObservable(this)

    this.manifestQuery = mobxQueryFactory(() => ({ ...queries.s.apk(this.href), enabled: !!this.href }))
    this.uploadFileMutate = mobxMutationFactory<UploadFileResponse, ErrorResponse, UploadFileArgs>({
      mutationFn: (data): Promise<UploadFileResponse> => uploadFile(data),
    })

    this.init()
  }

  async init(): Promise<void> {
    const device = await this.deviceBySerialStore.fetch()

    runInAction(() => {
      this.device = device
    })
  }

  get manifestQueryResult(): QueryObserverResult<GetManifestResponse> {
    return this.manifestQuery.result
  }

  get activityOptions(): ActivityOptions {
    const options = this.manifestQuery.data?.manifest.application.activities.reduce<ActivityOptionsSet>(
      (acc, activity) => {
        if (activity.name && !acc.activityNames.has(activity.name)) {
          acc.activityNames.add(activity.name)
        }

        activity.intentFilters.forEach((filter) => {
          filter.actions.forEach((action) => {
            if (action.name && !acc.activityActions.has(action.name)) {
              acc.activityActions.add(action.name)
            }
          })

          filter.categories.forEach((category) => {
            if (category.name && !acc.activityCategories.has(category.name)) {
              acc.activityCategories.add(category.name)
            }
          })

          filter.data.forEach(({ scheme, host, port, path, pathPrefix, pathPattern, mimeType }) => {
            if (scheme) {
              let uri = scheme + '://'

              if (host) {
                uri += host
              }

              if (port) {
                uri += port
              }

              if (path || pathPrefix || pathPattern) {
                uri += '/' + (path || pathPrefix || pathPattern)
              }

              if (!acc.activityData.has(uri)) {
                acc.activityData.add(uri)
              }
            }

            if (mimeType && !acc.activityData.has(mimeType)) {
              acc.activityData.add(mimeType)
            }
          })
        })

        return acc
      },
      {
        activityNames: new Set(),
        activityActions: new Set(),
        activityCategories: new Set(),
        activityData: new Set(),
      }
    )

    return {
      activityNames: Array.from(options?.activityNames || [], (item) => ({ value: item, label: item })),
      activityActions: Array.from(options?.activityActions || [], (item) => ({ value: item, label: item })),
      activityCategories: Array.from(options?.activityCategories || [], (item) => ({ value: item, label: item })),
      activityData: Array.from(options?.activityData || [], (item) => ({ value: item, label: item })),
    }
  }

  get packageOptions(): SelectOption[] {
    const manifestPackage = this.manifestQuery.data?.manifest.package

    return manifestPackage ? [{ value: manifestPackage, label: manifestPackage }] : []
  }

  runActivity({
    selectedData,
    selectedAction,
    selectedCategory,
    selectedPackageName,
    selectedActivityName,
  }: RunActivityArgs): void {
    let command = 'am start'

    if (selectedAction) {
      command += ' -a ' + selectedAction
    }

    if (selectedCategory) {
      command += ' -c ' + selectedCategory
    }

    if (selectedData) {
      command += ' -d ' + selectedData
    }

    if (selectedPackageName && selectedActivityName) {
      command += ' -n ' + selectedPackageName + '/' + selectedActivityName
    }

    this.deviceControlStore.shell(command)
  }

  clear(): void {
    queryClient.resetQueries({ queryKey: queries.s.apk(this.href).queryKey, exact: true })

    this.progress = 0
    this.isInstalling = false
    this.isInstalled = false
    this.isError = false
    this.status = 'Initialization'
    this.href = ''
  }

  allowedFileExtensions(): string[] {
    if (this.device?.ios) {
      return ['.ipa', 'application/octet-stream']
    }

    return ['.apk', '.aab', 'application/x-authorware-bin', 'application/vnd.android.package-archive']
  }

  async installFile(file: File): Promise<void> {
    this.isInstalling = true

    const type = file.name.split('.').pop() === 'apk' ? 'apk' : 'blob'

    const data = await this.uploadFileMutate.mutate({ type, file })

    this.progress = 25

    if (!data.success) {
      throw new Error('Failed to upload file')
    }

    this.href = data.resources.file.href

    const install = await (async (): Promise<InitializeTransactionReturn> => {
      if (this.device?.ios === true) {
        return await this.deviceControlStore.install({
          href: this.href,
          manifest: { application: { activities: {} } } as unknown as Manifest,
          launch: true,
        })
      }

      const manifestResponse = await this.manifestQuery.fetch()

      if (!manifestResponse.success) {
        throw new Error('Failed to get manifest')
      }

      return await this.deviceControlStore.install({
        href: this.href,
        manifest: manifestResponse.manifest,
        launch: true,
      })
    })()

    const unsubscribeToProgress = install.subscribeToProgress((progress, status) => {
      this.progress = 50 + progress / 2

      switch (status) {
        case 'uploading': {
          this.status = 'Uploading'
          break
        }

        case 'processing': {
          this.status = 'Processing'
          break
        }

        case 'pushing_app': {
          this.status = 'Pushing app'
          break
        }

        case 'installing_app': {
          this.status = 'Installing app'
          break
        }

        case 'launching_app': {
          this.status = 'Launching activity'
          break
        }

        default: {
          this.status = 'Working'
        }
      }
    })

    install.donePromise
      .then((message) => {
        if (typeof message === 'string') {
          this.status = message
        }

        this.progress = 100
        this.isInstalling = false
        this.isInstalled = true

        unsubscribeToProgress()
      })
      .catch((error) => {
        this.status = 'Error while installing'
        console.error('Error while installing: ', error)

        if (error instanceof Error) {
          this.status += `: ${error.cause}`
        }

        this.isInstalling = false
        this.isInstalled = false
        this.isError = true

        unsubscribeToProgress()
      })
  }

  async uninstall(packageName: string): Promise<void> {
    const uninstallResult = await this.deviceControlStore.uninstall(packageName)
    await uninstallResult.donePromise

    this.clear()
  }
}
