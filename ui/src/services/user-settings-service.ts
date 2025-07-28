import { inject, injectable } from 'inversify'
import { computed, makeObservable } from 'mobx'

import { socket } from '@/api/socket'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { CurrentUserProfileStore } from '@/store/current-user-profile-store'

import { ListManagementService } from './list-management-service'

import type { SettingsUser } from '@/types/settings-user.type'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { SettingsUserChangeMessage } from '@/types/settings-user-change-message.type'

@injectable()
export class UserSettingsService extends ListManagementService<'email', SettingsUser> {
  private usersQuery

  constructor(
    @inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory,
    @inject(CONTAINER_IDS.currentUserProfileStore) private currentUserProfileStore: CurrentUserProfileStore
  ) {
    super('email')

    makeObservable(this)

    this.usersQuery = mobxQueryFactory(() => ({ ...queries.users.settings }))

    this.onUserCreate = this.onUserCreate.bind(this)
    this.onUserDelete = this.onUserDelete.bind(this)
    this.onUserChange = this.onUserChange.bind(this)
  }

  @computed
  get usersQueryResult(): QueryObserverResult<SettingsUser[]> {
    return this.usersQuery.result
  }

  @computed
  get items(): SettingsUser[] {
    return this.usersQueryResult.data?.filter((item) => this.filterUser(item)) || []
  }

  @computed
  get joinedUsersEmails(): string {
    return this.selectedItems
      .filter((item) => item.privilege !== 'admin')
      .map((item) => item.email)
      .join(',')
  }

  @computed
  get isRemoveUsersButtonDisabled(): boolean {
    return (
      !this.paginatedItems.length || (this.paginatedItems.length === 1 && this.paginatedItems[0].privilege === 'admin')
    )
  }

  async getUserEmails(): Promise<string> {
    const currentUserProfileStore = await this.currentUserProfileStore.fetch()

    const emailSeparator = currentUserProfileStore?.settings?.emailAddressSeparator
    const emails: string[] = this.selectedItems.map((item) => item.email || '')
    const uniqueEmail = Array.from(new Set(emails))

    return uniqueEmail.join(emailSeparator || ',')
  }

  addUserSettingsListeners(): void {
    socket.on('user.settings.users.created', this.onUserCreate)
    socket.on('user.settings.users.deleted', this.onUserDelete)
    socket.on('user.settings.users.updated', this.onUserChange)
  }

  removeUserSettingsListeners(): void {
    socket.off('user.settings.users.created', this.onUserCreate)
    socket.off('user.settings.users.deleted', this.onUserDelete)
    socket.off('user.settings.users.updated', this.onUserChange)
  }

  private filterUser(item: SettingsUser): boolean {
    if (!this.globalFilter) return true

    if (
      this.startsWithFilter(item.name) ||
      this.startsWithFilter(item.email) ||
      this.startsWithFilter(item.privilege)
    ) {
      return true
    }

    return false
  }

  private onUserChange({ user }: SettingsUserChangeMessage): void {
    queryClient.setQueryData<SettingsUser[]>(queries.users.settings.queryKey, (oldData) => {
      if (!oldData) return []

      return oldData.map((item): SettingsUser => {
        if (item.email === user.email) {
          return { ...item, ...user }
        }

        return item
      })
    })
  }

  private onUserCreate({ user }: SettingsUserChangeMessage): void {
    queryClient.setQueryData<SettingsUser[]>(queries.users.settings.queryKey, (oldData) => {
      if (!oldData) return []

      const isUserAlreadyExist = oldData.findIndex((item) => item.email === user.email) !== -1

      if (isUserAlreadyExist) return oldData

      return [...oldData, user]
    })
  }

  private onUserDelete({ user }: SettingsUserChangeMessage): void {
    queryClient.setQueryData<SettingsUser[]>(queries.users.settings.queryKey, (oldData) => {
      if (!oldData) return []

      return oldData.filter((item) => item.email !== user.email)
    })
  }
}
