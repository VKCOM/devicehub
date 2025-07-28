import { t } from 'i18next'
import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'
import { addMinutes, formatDuration, intervalToDuration } from 'date-fns'

import { ScheduleFormFields } from '@/components/ui/settings-tabs/groups-tab/group-item/tabs/schedule/types'
import { GroupUsersColumnIds } from '@/components/ui/settings-tabs/groups-tab/group-item/tabs/group-users-table/types'

import { GroupSettingsService } from '@/services/group-settings-service'
import { DataWithGroupStatus } from '@/types/data-with-group-status.type'

import { queries } from '@/config/queries/query-key-store'
import { isRootGroup } from '@/lib/utils/is-root-group.util'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { isOriginGroup } from '@/lib/utils/is-origin-group.util'
import { isRepetitionsGroup } from '@/lib/utils/is-repetitions-group.util'

import { CLASS_CONFIGURATIONS } from '@/constants/schedule-class-configuration'

import type { Row } from '@tanstack/react-table'
import type { GroupUser } from '@/types/group-user.type'
import type { GroupDevice } from '@/types/group-device.type'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { ConflictTableRow } from '@/types/conflict-table-row.type'
import type { Conflict, GroupListResponseGroupsItem, GroupPayloadClass } from '@/generated/types'
import type { CurrentUserProfileStore } from '@/store/current-user-profile-store'
import type { ScheduleData, ScheduleFormErrors, SetScheduleDataArgs } from './types'

@injectable()
export class GroupItemService {
  private usersQuery
  private devicesQuery

  scheduleData!: ScheduleData
  scheduleFormErrors: ScheduleFormErrors = {}
  conflicts: ConflictTableRow[] = []

  constructor(
    @inject(CONTAINER_IDS.groupId) public currentGroupId: string,
    @inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory,
    @inject(CONTAINER_IDS.groupSettingsService) private groupSettingsService: GroupSettingsService,
    @inject(CONTAINER_IDS.currentUserProfileStore) private currentUserProfileStore: CurrentUserProfileStore
  ) {
    makeAutoObservable(this)

    this.usersQuery = mobxQueryFactory(() => ({ ...queries.users.group }))
    this.devicesQuery = mobxQueryFactory(() => ({ ...queries.devices.group({ target: 'origin' }) }))

    this.setEntireScheduleData(
      this.currentGroup || {
        dates: [
          {
            start: new Date().toISOString(),
            stop: addMinutes(new Date(), 5).toISOString(),
          },
        ],
        repetitions: 0,
        class: 'once',
      }
    )
  }

  get usersQueryResult(): QueryObserverResult<GroupUser[]> {
    return this.usersQuery.result
  }

  get devicesQueryResult(): QueryObserverResult<GroupDevice[]> {
    return this.devicesQuery.result
  }

  get currentGroup(): GroupListResponseGroupsItem {
    return this.groupSettingsService.groupsQueryResult.data?.find((item) => item.id === this.currentGroupId) || {}
  }

  get isSomeUsersNotInGroup(): boolean {
    return this.groupUsersData.some((item) => !item.isInGroup)
  }

  get isSomeDevicesNotInGroup(): boolean {
    return this.groupDevicesData.some((item) => !item.isInGroup)
  }

  get isScheduleFormErrorsEmpty(): boolean {
    return Object.keys(this.scheduleFormErrors).length === 0
  }

  get isCanRemoveAllUsers(): boolean {
    const users = this.usersQuery.data || []

    const ownerEmail = this.currentGroup?.owner?.email
    const usersCount = users?.length

    if (usersCount === 0) return false

    if (isRootGroup(this.currentGroup?.privilege) && usersCount === 1 && users[0].privilege === 'admin') return false

    if (
      this.currentGroup?.privilege !== 'root' &&
      usersCount === 2 &&
      users[0].privilege === 'admin' &&
      users[1].email === ownerEmail
    ) {
      return false
    }

    if (
      this.currentGroup?.privilege !== 'root' &&
      usersCount === 2 &&
      users[0].email === ownerEmail &&
      users[1].privilege === 'admin'
    ) {
      return false
    }

    if (
      this.currentGroup?.privilege !== 'root' &&
      usersCount === 1 &&
      (users[0].email === ownerEmail || users[0].privilege === 'admin')
    ) {
      return false
    }

    return true
  }

  get groupUsersData(): DataWithGroupStatus<GroupUser>[] {
    const users = this.usersQuery.data || []

    return users.map((item) => {
      if (item.email && this.currentGroup?.users?.includes(item.email)) {
        return {
          ...item,
          isInGroup: true,
        }
      }

      return {
        ...item,
        isInGroup: false,
      }
    })
  }

  get groupDevicesData(): DataWithGroupStatus<GroupDevice>[] {
    const devices = this.devicesQuery.data || []

    return devices.flatMap((item) => {
      const isInGroup = !!this.currentGroup?.devices?.includes(item.serial)

      /*
       * TODO: check by each group instead device.group [device one-to-many groups].
       *  Mb a common store for all group-item instead fetch by each service(group.id).
       *  If this check does not prevent an attempt to add busy device,
       *  backend will return the required error.
       *  Alternative: GET endpoint to devices available for adding for a specific group. */
      if (!isOriginGroup(item.group?.class as GroupPayloadClass)) {
        const stop = new Date(item.group?.lifeTime?.stop || '')
        const start = new Date(item.group?.lifeTime?.start || '')

        // find intersections
        if (
          (start < this.scheduleData.dateRange[0] && stop > this.scheduleData.dateRange[0]) ||
          (start > this.scheduleData.dateRange[0] && start < this.scheduleData.dateRange[1])
        ) {
          return []
        }
      }

      return [
        {
          ...item,
          isInGroup,
        },
      ]
    })
  }

  get conflictsCount(): number {
    return this.conflicts.length
  }

  setConflicts(conflicts: Conflict[]): void {
    for (const conflict of conflicts) {
      for (const serial of conflict.devices || []) {
        this.conflicts.push({
          serial,
          startDate: conflict.date?.start || '',
          stopDate: conflict.date?.stop || '',
          group: conflict.group || '',
          ownerName: conflict.owner?.name || '',
          ownerEmail: conflict.owner?.email || '',
        })
      }
    }
  }

  clearConflicts(): void {
    this.conflicts = []
  }

  setEntireScheduleData(data: SetScheduleDataArgs): void {
    const { start, stop } = data.dates?.[0] || {}

    const updatedData: ScheduleData = {
      dateRange: [start ? new Date(start) : new Date(), stop ? new Date(stop) : new Date()],
      repetitions: data?.repetitions || 0,
      groupClass: data?.class || 'once',
    }

    this.scheduleData = updatedData
  }

  setScheduleData<T extends keyof ScheduleData>(key: T, data: ScheduleData[T]): void {
    this.scheduleData[key] = data

    this.validateScheduleForm()
  }

  checkDurationQuota(deviceNumber: number): boolean {
    if (isOriginGroup(this.scheduleData.groupClass)) return true

    const [startDate, expireDate] = this.scheduleData.dateRange

    if (!startDate || !expireDate) return false

    const devicesLength = this.currentGroup.devices?.length || 0
    const duration =
      (devicesLength + deviceNumber) *
      (expireDate.getTime() - startDate.getTime()) *
      (this.scheduleData.repetitions + 1)

    const groupOwnerEmail = this.currentGroup.owner?.email
    const users = this.usersQuery.data || []

    const userOwner = users.find((item) => item.email === groupOwnerEmail)

    if (!userOwner?.groups?.quotas?.allocated?.duration) return false

    if (duration <= userOwner.groups.quotas.allocated.duration) return true

    return false
  }

  validateScheduleForm(): void {
    const errors: ScheduleFormErrors = {}

    if (isRepetitionsGroup(this.scheduleData.groupClass) && this.scheduleData.repetitions < 1) {
      errors.repetitions = {
        field: ScheduleFormFields.REPETITIONS,
        message: t('Repetitions must exceed 0 for this class'),
      }
    }

    const [startDate, expireDate] = this.scheduleData.dateRange

    if (startDate >= expireDate) {
      errors.startDate = {
        field: ScheduleFormFields.START_DATE,
        message: t('Start date must be before expiration date'),
      }
    }

    const classConfiguration = CLASS_CONFIGURATIONS.find((item) => item.value === this.scheduleData.groupClass)

    if (classConfiguration?.duration && expireDate.getTime() - startDate.getTime() > classConfiguration.duration) {
      const duration = intervalToDuration({ start: 0, end: classConfiguration.duration })

      errors.expireDate = {
        field: ScheduleFormFields.EXPIRE_DATE,
        message: `${t('The difference between expiration date and starting date')} (${formatDuration(duration)})`,
      }
    }

    if (
      (this.currentUserProfileStore.isAdmin &&
        this.currentGroup?.devices?.length &&
        isOriginGroup(this.scheduleData.groupClass) &&
        !isOriginGroup(this.currentGroup.class)) ||
      (!isOriginGroup(this.scheduleData.groupClass) && isOriginGroup(this.currentGroup?.class))
    ) {
      errors.groupClass = {
        field: ScheduleFormFields.GROUP_CLASS,
        message: t('Unauthorized class while device list is not empty'),
      }
    }

    if (!this.checkDurationQuota(0)) {
      errors.groupClass = {
        message: t('Group duration quotas is reached'),
      }
    }

    this.scheduleFormErrors = errors
  }

  async getGroupUsersEmails(users: Row<DataWithGroupStatus<GroupUser>>[]): Promise<string> {
    const currentUserProfileStore = await this.currentUserProfileStore.fetch()

    const emailSeparator = currentUserProfileStore?.settings?.emailAddressSeparator
    const emails: string[] = users.map((item) => item.getValue(GroupUsersColumnIds.EMAIL))
    const uniqueEmail = Array.from(new Set(emails))

    return uniqueEmail.join(emailSeparator || ',')
  }
}
