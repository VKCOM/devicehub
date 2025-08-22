import { Container } from 'inversify'

import { GroupService } from '@/services/group-service'
import { AdbKeyService } from '@/services/adb-key-service'
import { AccessTokenService } from '@/services/access-token-service'
import { UserSettingsService } from '@/services/user-settings-service'
import { GroupSettingsService } from '@/services/group-settings-service'
import { ShellSettingsService } from '@/services/shell-settings-service'
import { DeviceSettingsService } from '@/services/device-settings-service'
import { TeamSettingsService } from '@/services/team-settings-service'
import { SettingsService } from '@/services/settings-service/settings-service'
import { LogsTrackerService } from '@/services/logs-tracker-service/logs-tracker-service'
import { TransactionService } from '@/services/core/transaction-service/transaction-service'

import { MobxQuery } from '@/store/mobx-query'
import { MobxMutation } from '@/store/mobx-mutation'
import { DeviceListStore } from '@/store/device-list-store'
import { queryClient } from '@/config/queries/query-client'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceDisconnection } from '@/store/device-disconnection'
import { CurrentUserProfileStore } from '@/store/current-user-profile-store'

import type { interfaces } from 'inversify'
import type { MutationObserverOptions, QueryObserverOptions } from '@tanstack/react-query'

export const globalContainer = new Container({ defaultScope: 'Singleton' })

globalContainer.bind(CONTAINER_IDS.groupService).to(GroupService)
globalContainer.bind(CONTAINER_IDS.adbKeyService).to(AdbKeyService)
globalContainer.bind(CONTAINER_IDS.deviceListStore).to(DeviceListStore)
globalContainer.bind(CONTAINER_IDS.settingsService).to(SettingsService)
globalContainer.bind(CONTAINER_IDS.accessTokenService).to(AccessTokenService)
globalContainer.bind(CONTAINER_IDS.logsTrackerService).to(LogsTrackerService)
globalContainer.bind(CONTAINER_IDS.deviceDisconnection).to(DeviceDisconnection)
globalContainer.bind(CONTAINER_IDS.userSettingsService).to(UserSettingsService)
globalContainer.bind(CONTAINER_IDS.groupSettingsService).to(GroupSettingsService)
globalContainer.bind(CONTAINER_IDS.teamSettingsService).to(TeamSettingsService)
globalContainer.bind(CONTAINER_IDS.shellSettingsService).to(ShellSettingsService)
globalContainer.bind(CONTAINER_IDS.deviceSettingsService).to(DeviceSettingsService)
globalContainer.bind(CONTAINER_IDS.currentUserProfileStore).to(CurrentUserProfileStore)

globalContainer
  .bind<interfaces.Factory<MobxQuery>>(CONTAINER_IDS.factoryMobxQuery)
  .toFactory<MobxQuery, [() => QueryObserverOptions]>(
    () =>
      (getOptions): MobxQuery =>
        new MobxQuery(getOptions, queryClient)
  )
globalContainer
  .bind<interfaces.Factory<MobxMutation>>(CONTAINER_IDS.factoryMobxMutation)
  .toFactory<MobxMutation, [MutationObserverOptions]>(
    () =>
      (options): MobxMutation =>
        new MobxMutation(options, queryClient)
  )
globalContainer
  .bind<interfaces.Factory<TransactionService>>(CONTAINER_IDS.factoryTransactionService)
  .toFactory<TransactionService>(
    () =>
      <T = unknown>(): TransactionService<T> =>
        new TransactionService()
  )
