export type TransactionDoneListenerMessage = {
  body: unknown | null
  data: string
  seq: number
  source: string
  success: boolean
}

export type InitializeTransactionReturn = {
  channel: string
  promise: Promise<unknown>
  abort: (reason?: string) => void
}
