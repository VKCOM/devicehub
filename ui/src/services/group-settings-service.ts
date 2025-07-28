import { inject, injectable } from 'inversify'
import { computed, makeObservable, observable } from 'mobx'

import { socket } from '@/api/socket'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { isRootGroup } from '@/lib/utils/is-root-group.util'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { CurrentUserProfileStore } from '@/store/current-user-profile-store'

import { ListManagementService } from './list-management-service'

import type { QueryObserverResult } from '@tanstack/react-query'
import type { GroupListResponseGroupsItem } from '@/generated/types'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { SettingsGroupChangeMessage } from '@/types/settings-group-change-message.type'

@injectable()
export class GroupSettingsService extends ListManagementService<'id', GroupListResponseGroupsItem> {
  private groupsQuery

  @observable currentGroupId = ''

  constructor(
    @inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory,
    @inject(CONTAINER_IDS.currentUserProfileStore) private currentUserProfileStore: CurrentUserProfileStore
  ) {
    super('id')

    makeObservable(this)

    this.groupsQuery = mobxQueryFactory(() => ({ ...queries.groups.all }))

    this.onGroupCreate = this.onGroupCreate.bind(this)
    this.onGroupDelete = this.onGroupDelete.bind(this)
    this.onGroupChange = this.onGroupChange.bind(this)
  }

  @computed
  get groupsQueryResult(): QueryObserverResult<GroupListResponseGroupsItem[]> {
    return this.groupsQuery.result
  }

  @computed
  get items(): GroupListResponseGroupsItem[] {
    return this.groupsQueryResult.data?.filter((item) => this.filterGroup(item)) || []
  }

  @computed
  get isCanCreateGroup(): boolean {
    const { groups } = this.currentUserProfileStore.profileQueryResult?.data || {}

    const groupConsumedQuota = groups?.quotas?.consumed?.number || 0
    const groupAllocatedQuota = groups?.quotas?.allocated?.number || 0

    return groupConsumedQuota < groupAllocatedQuota
  }

  @computed
  get joinedGroupIds(): string {
    return this.selectedItems
      .filter((item) => item.privilege !== 'root')
      .map((item) => item.id)
      .join(',')
  }

  @computed
  get isRemoveGroupsDisabled(): boolean {
    return (
      !this.paginatedItems.length || (this.paginatedItems.length === 1 && isRootGroup(this.paginatedItems[0].privilege))
    )
  }

  addGroupSettingsListeners(): void {
    socket.on('user.settings.groups.created', this.onGroupCreate)
    socket.on('user.view.groups.created', this.onGroupCreate)

    socket.on('user.settings.groups.deleted', this.onGroupDelete)
    socket.on('user.view.groups.deleted', this.onGroupDelete)

    socket.on('user.settings.groups.updated', this.onGroupChange)
    socket.on('user.view.groups.updated', this.onGroupChange)
  }

  removeGroupSettingsListeners(): void {
    socket.off('user.settings.groups.created', this.onGroupCreate)
    socket.off('user.view.groups.created', this.onGroupCreate)

    socket.off('user.settings.groups.deleted', this.onGroupDelete)
    socket.off('user.view.groups.deleted', this.onGroupDelete)

    socket.off('user.settings.groups.updated', this.onGroupChange)
    socket.off('user.view.groups.updated', this.onGroupChange)
  }

  async getGroupOwnerEmails(): Promise<string> {
    const currentUserProfileStore = await this.currentUserProfileStore.fetch()

    const emailSeparator = currentUserProfileStore?.settings?.emailAddressSeparator
    const emails: string[] = this.selectedItems.map((item) => item.owner?.email || '')
    const uniqueEmail = Array.from(new Set(emails))

    return uniqueEmail.join(emailSeparator || ',')
  }

  private filterGroup(item: GroupListResponseGroupsItem): boolean {
    if (!this.globalFilter) return true

    if (
      this.startsWithFilter(item.id) ||
      this.startsWithFilter(item.name) ||
      this.startsWithFilter(item.class) ||
      this.startsWithFilter(item.owner?.name) ||
      this.startsWithFilter(String(item.users?.length)) ||
      this.startsWithFilter(String(item.devices?.length))
    ) {
      return true
    }

    return false
  }

  private onGroupChange({ group }: SettingsGroupChangeMessage): void {
    queryClient.setQueryData<GroupListResponseGroupsItem[]>(queries.groups.all.queryKey, (oldData) => {
      if (!oldData) return []

      return oldData.map((item): GroupListResponseGroupsItem => {
        if (item.id === group.id) {
          return { ...item, ...group }
        }

        return item
      })
    })
  }

  private onGroupCreate({ group }: SettingsGroupChangeMessage): void {
    queryClient.setQueryData<GroupListResponseGroupsItem[]>(queries.groups.all.queryKey, (oldData) => {
      if (!oldData) return []

      const isGroupAlreadyExist = oldData.findIndex((item) => item.id === group.id) !== -1

      if (isGroupAlreadyExist) return oldData

      return [...oldData, group]
    })
  }

  private onGroupDelete({ group }: SettingsGroupChangeMessage): void {
    queryClient.setQueryData<GroupListResponseGroupsItem[]>(queries.groups.all.queryKey, (oldData) => {
      if (!oldData) return []

      return oldData.filter((item) => item.id !== group.id)
    })
  }
}
