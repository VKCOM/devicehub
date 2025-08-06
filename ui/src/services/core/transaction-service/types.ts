import type { Manifest } from '@/types/manifest.type'

export type TransactionDoneListenerMessage = {
  body: string | null
  data: string | null
  seq: number
  source: string
  success: boolean
}

export type TransactionProgressListenerMessage = {
  data: string
  progress: number
  seq: number
  source: string
}

export type ProgressFn = (progress: number, data: string, seq: number) => void

export type TransactionDoneResult<T = unknown> = {
  source: string
  data: TransactionDoneListenerMessage['data']
  content: T | null
}

export type InitializeTransactionReturn<T = unknown> = {
  channel: string
  donePromise: Promise<TransactionDoneResult<T>>
  abort: (reason?: string) => void
  subscribeToProgress: (progressFn: ProgressFn) => () => void
}

export type InstallOptions = {
  href: string
  manifest: Manifest
  launch: boolean
  pkg?: string
}
