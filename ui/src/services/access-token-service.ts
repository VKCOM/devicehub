import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'
import { QueryObserverResult } from '@tanstack/react-query'

import { socket } from '@/api/socket'
import { AccessTokenGeneratedMessage } from '@/types/access-token-generated-message.type'
import { getAccessTokenByTitle } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { Token } from '@/generated/types'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'

@injectable()
export class AccessTokenService {
  private accessTokensQuery
  private tokenToRemove = ''
  private userTokenQueries = new Map()

  generatedToken = ''

  constructor(@inject(CONTAINER_IDS.factoryMobxQuery) private mobxQueryFactory: MobxQueryFactory) {
    makeAutoObservable(this)

    this.onAccessTokenGenerated = this.onAccessTokenGenerated.bind(this)

    this.accessTokensQuery = mobxQueryFactory(() => ({ ...queries.user.accessTokens }))
  }

  get accessTokensQueryResult(): QueryObserverResult<string[]> {
    return this.accessTokensQuery.result
  }

  getUserAccessTokens(email: string): QueryObserverResult<string[]> {
    if (!this.userTokenQueries.has(email)) {
      const query = this.mobxQueryFactory(() => ({
        ...queries.users.accessTokens(email),
      }))

      this.userTokenQueries.set(email, query)
    }

    return this.userTokenQueries.get(email)?.result
  }

  getAccessTokenByTitle(title: string): Promise<Token | null> {
    return getAccessTokenByTitle(title)
  }

  setTokenToRemove(token: string): void {
    this.tokenToRemove = token
  }

  resetGeneratedTokenId(accessTokenLabel: string): void {
    queryClient.setQueryData<string[]>(queries.user.accessTokens.queryKey, (oldData) => {
      if (!oldData) return []

      return [accessTokenLabel, ...oldData]
    })

    this.generatedToken = ''
  }

  addAccessTokenGeneratedListener(): void {
    socket.on('user.keys.accessToken.generated', this.onAccessTokenGenerated)
  }

  removeAccessTokenGeneratedListener(): void {
    socket.off('user.keys.accessToken.generated', this.onAccessTokenGenerated)
  }

  generateAccessToken(title: string): void {
    socket.emit('user.keys.accessToken.generate', {
      title,
    })
  }

  removeAccessToken(email?: string): void {
    socket.emit('user.keys.accessToken.remove', { title: this.tokenToRemove, ...(!!email && { email }) })

    const queryKey = email ? queries.users.accessTokens(email).queryKey : queries.user.accessTokens.queryKey

    queryClient.setQueryData<string[]>(queryKey, (oldData) => {
      if (!oldData) return []

      return oldData.filter((item) => item !== this.tokenToRemove)
    })
  }

  private onAccessTokenGenerated({ token }: AccessTokenGeneratedMessage): void {
    this.generatedToken = token
  }
}
