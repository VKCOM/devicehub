import { QueryObserver } from '@tanstack/react-query'
import { createAtom, makeAutoObservable, reaction } from 'mobx'

import type {
  DefaultedQueryObserverOptions,
  DefaultError,
  QueryClient,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/react-query'

export class MobxQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> {
  private queryObserver
  private unsubscribe: () => void = () => {}
  private atom = createAtom(
    'MobxQuery',
    () => this.startTracking(),
    () => this.stopTracking()
  )

  constructor(
    private getOptions: () => QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
    private queryClient: QueryClient
  ) {
    this.queryObserver = new QueryObserver(this.queryClient, this.defaultQueryOptions)

    makeAutoObservable(this)
  }

  get result(): QueryObserverResult<TData, TError> {
    this.atom.reportObserved()
    this.queryObserver.setOptions(this.defaultQueryOptions)

    return this.queryObserver.getOptimisticResult(this.defaultQueryOptions)
  }

  get data(): TData | undefined {
    return this.result.data
  }

  private get defaultQueryOptions(): DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
    return this.queryClient.defaultQueryOptions(this.getOptions())
  }

  private startTracking(): void {
    const unsubscribeReaction = reaction(
      () => this.defaultQueryOptions,
      () => {
        this.queryObserver.setOptions(this.defaultQueryOptions)
      }
    )

    const unsubscribeQueryObserver = this.queryObserver.subscribe(() => {
      this.atom.reportChanged()
    })

    this.unsubscribe = (): void => {
      unsubscribeReaction()
      unsubscribeQueryObserver()
    }
  }

  private stopTracking(): void {
    this.unsubscribe()
  }
}
