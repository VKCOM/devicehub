import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { queries } from '@/config/queries/query-key-store'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { User } from '@/generated/types'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'

@injectable()
export class CurrentUserProfileStore {
  private profileQuery

  constructor(@inject(CONTAINER_IDS.factoryMobxQuery) mobxQueryFactory: MobxQueryFactory) {
    makeAutoObservable(this)

    this.profileQuery = mobxQueryFactory(() => ({ ...queries.user.profile, staleTime: Infinity }))
  }

  get profileQueryResult(): QueryObserverResult<User | undefined> {
    return this.profileQuery.result
  }

  get isAdmin(): boolean {
    return this.profileQueryResult.data?.privilege === 'admin'
  }

  fetch(): Promise<User | undefined> {
    return this.profileQuery.fetch()
  }
}
