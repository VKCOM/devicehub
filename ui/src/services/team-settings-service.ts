import { inject, injectable } from 'inversify'
import { computed, makeObservable, observable } from 'mobx'

import { Team } from '@/generated/types'

import { queries } from '@/config/queries/query-key-store'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ListManagementService } from './list-management-service'

import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'

@injectable()
export class TeamSettingsService extends ListManagementService<'id', Team> {
  private teamsQuery

  @observable currentTeamId = ''

  constructor(@inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory) {
    super('id')

    makeObservable(this)

    this.teamsQuery = mobxQueryFactory(() => ({ ...queries.teams.all }))
  }

  @computed
  get teamsQueryResult(): QueryObserverResult<Team[]> {
    return this.teamsQuery.result
  }

  @computed
  get items(): Team[] {
    return this.teamsQueryResult.data || []
  }
}
