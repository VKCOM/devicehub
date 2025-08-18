import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { TeamUsersColumnIds } from '@/components/ui/settings-tabs/teams-tab/team-item/tabs/team-users-table/types'

import { TeamSettingsService } from '@/services/team-settings-service'
import { DataWithTeamStatus } from '@/types/data-with-team-status.type'
import { TeamGroup } from '@/types/team-group.type'

import { queries } from '@/config/queries/query-key-store'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { Row } from '@tanstack/react-table'
import type { TeamUser } from '@/types/team-user.type'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { Team } from '@/generated/types'
import type { CurrentUserProfileStore } from '@/store/current-user-profile-store'

@injectable()
export class TeamItemService {
  private usersQuery
  private groupsQuery

  constructor(
    @inject(CONTAINER_IDS.teamId) public currentTeamId: string,
    @inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory,
    @inject(CONTAINER_IDS.teamSettingsService) private teamSettingsService: TeamSettingsService,
    @inject(CONTAINER_IDS.currentUserProfileStore) private currentUserProfileStore: CurrentUserProfileStore
  ) {
    makeAutoObservable(this)

    this.usersQuery = mobxQueryFactory(() => ({ ...queries.teams.users }))
    this.groupsQuery = mobxQueryFactory(() => ({ ...queries.teams.groups }))
  }

  get usersQueryResult(): QueryObserverResult<TeamUser[]> {
    return this.usersQuery.result
  }

  get groupsQueryResult(): QueryObserverResult<TeamGroup[]> {
    return this.groupsQuery.result
  }

  get currentTeam(): Team {
    return this.teamSettingsService.teamsQueryResult.data?.find((item) => item.id === this.currentTeamId) || {}
  }

  get teamUsersData(): DataWithTeamStatus<TeamUser>[] {
    const users = this.usersQuery.data || []

    return users.map((item) => {
      if (item.email && this.currentTeam?.users?.includes(item.email)) {
        return {
          ...item,
          isInTeam: true,
        }
      }

      return {
        ...item,
        isInTeam: false,
      }
    })
  }

  async getTeamUsersEmails(users: Row<DataWithTeamStatus<TeamUser>>[]): Promise<string> {
    const currentUserProfileStore = await this.currentUserProfileStore.fetch()

    const emailSeparator = currentUserProfileStore?.settings?.emailAddressSeparator
    const emails: string[] = users.map((item) => item.getValue(TeamUsersColumnIds.EMAIL))
    const uniqueEmail = Array.from(new Set(emails))

    return uniqueEmail.join(emailSeparator || ',')
  }
}
