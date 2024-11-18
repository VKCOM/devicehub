import { socket } from '@/api/socket'

import { generateTransactionSocketChannel } from '@/lib/utils/generate-transaction-socket-channel'

import type { InitializeTransactionReturn, TransactionDoneListenerMessage } from './types'

export class TransactionService {
  private channel = ''
  private abortController
  private promise

  constructor() {
    this.promise = Promise.withResolvers()
    this.abortController = new AbortController()
    this.transactionDoneListener = this.transactionDoneListener.bind(this)
  }

  createChannel(): void {
    this.channel = generateTransactionSocketChannel()
  }

  initializeTransaction(): InitializeTransactionReturn {
    this.addTransactionAbortListener()
    this.createChannel()

    socket.on('tx.done', this.transactionDoneListener)

    return {
      channel: this.channel,
      promise: this.promise.promise,
      abort: (reason) => this.abortController.abort(reason),
    }
  }

  cleanUpTransaction(): void {
    socket.off('tx.done', this.transactionDoneListener)
    socket.emit('tx.cleanup', this.channel)
  }

  private addTransactionAbortListener(): void {
    this.abortController.signal.addEventListener(
      'abort',
      () => {
        this.cleanUpTransaction()
        this.promise.reject(new Error('Transaction aborted', { cause: this.abortController.signal.reason }))
      },
      { once: true }
    )
  }

  private transactionDoneListener(incomingChannel: string, message: TransactionDoneListenerMessage): void {
    if (incomingChannel !== this.channel) return

    if (message.success && message.data) {
      this.promise.resolve(message.data)
    }

    if (!message.success) {
      this.promise.reject(new Error('Failed to complete transaction', { cause: message.data }))
    }

    this.cleanUpTransaction()
  }
}
