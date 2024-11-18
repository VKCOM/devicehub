import { makeAutoObservable } from 'mobx'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import { MobxQuery } from './mobx-query'

import type { AxiosError } from 'axios'
import type { UserResponseUser } from '@/generated/types'
import type { QueryObserverResult } from '@tanstack/react-query'

class CurrentUserProfileStore {
  private profileQuery = new MobxQuery(() => ({ ...queries.user.profile, staleTime: Infinity }), queryClient)

  constructor() {
    makeAutoObservable(this)
  }

  get profileQueryResult(): QueryObserverResult<UserResponseUser, AxiosError> {
    return this.profileQuery.result
  }
}

export const currentUserProfileStore = new CurrentUserProfileStore()
