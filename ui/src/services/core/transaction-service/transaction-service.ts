import { injectable, unmanaged } from 'inversify'
import { makeAutoObservable } from 'mobx'

import { socket } from '@/api/socket'

import { generateTransactionSocketChannel } from '@/lib/utils/generate-transaction-socket-channel'

import type {
  ProgressFn,
  TransactionDoneResult,
  InitializeTransactionReturn,
  TransactionDoneListenerMessage,
  TransactionProgressListenerMessage,
} from './types'

@injectable()
export class TransactionService<T = unknown> {
  private channel = ''
  private abortController
  private donePromise: PromiseWithResolvers<TransactionDoneResult<T>>
  private progressFn: ProgressFn | null = null
  private timeoutId: ReturnType<typeof setTimeout> | undefined = undefined
  private timeoutDelay = 60000

  constructor(@unmanaged() private connection = socket) {
    makeAutoObservable<this, 'connection'>(this, { connection: false })

    this.donePromise = Promise.withResolvers()
    this.abortController = new AbortController()
    this.transactionDoneListener = this.transactionDoneListener.bind(this)
    this.transactionProgressListener = this.transactionProgressListener.bind(this)
  }

  subscribeToProgress(progressFn: ProgressFn) {
    this.progressFn = progressFn

    return (): void => {
      this.progressFn = null
    }
  }

  createChannel(): void {
    this.channel = generateTransactionSocketChannel()
  }

  initializeTransaction(): InitializeTransactionReturn<T> {
    this.addTransactionAbortListener()
    this.createChannel()

    this.connection.once('disconnect', this.onDisconnect)
    this.connection.on('tx.done', this.transactionDoneListener)
    this.connection.on('tx.progress', this.transactionProgressListener)

    /* NOTE: The transaction will be automatically cleaned up if the tx.done message
      is not received after a certain period of time
     */
    this.timeoutId = setTimeout(() => {
      this.abortController.abort('Transaction timed out')
    }, this.timeoutDelay)

    return {
      channel: this.channel,
      donePromise: this.donePromise.promise,
      subscribeToProgress: this.subscribeToProgress.bind(this),
      abort: (reason) => this.abortController.abort(reason),
    }
  }

  private onDisconnect = (): void => {
    this.abortController.abort('Device connection closed')
  }

  cleanUpTransaction(): void {
    this.progressFn = null

    clearTimeout(this.timeoutId)

    this.connection.off('disconnect', this.onDisconnect)
    this.connection.off('tx.done', this.transactionDoneListener)
    this.connection.off('tx.progress', this.transactionProgressListener)
    this.connection.emit('tx.cleanup', this.channel)
  }

  private addTransactionAbortListener(): void {
    this.abortController.signal.addEventListener(
      'abort',
      () => {
        this.cleanUpTransaction()
        this.donePromise.reject(new Error('Transaction aborted', { cause: this.abortController.signal.reason }))
      },
      { once: true }
    )
  }

  private transactionProgressListener(incomingChannel: string, message: TransactionProgressListenerMessage): void {
    if (incomingChannel !== this.channel) return

    this.progressFn?.(message.progress, message.data, message.seq)
  }

  private transactionDoneListener(
    incomingChannel: string,
    { success, body, data, source }: TransactionDoneListenerMessage
  ): void {
    if (incomingChannel !== this.channel) return

    if (success) {
      this.donePromise.resolve({
        source,
        data,
        content: body && JSON.parse(body),
      })
    }

    if (!success) {
      this.donePromise.reject(new Error('Failed to complete transaction', { cause: data }))
    }

    this.cleanUpTransaction()
  }
}
