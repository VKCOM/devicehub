import { socket } from '@/api/socket'
import { TransactionService } from '@/services/core/transaction-service/transaction-service'

import type { Device } from '@/generated/types'

class ControlService {
  startRemoteConnect(device: Device): Promise<unknown> {
    return this.sendTwoWay(device, 'connect.start')
  }

  private sendTwoWay<T>(device: Device, action: string, data?: T): Promise<unknown> {
    const transaction = new TransactionService()
    const { channel: transactionChannel, promise: transactionEndPromise } = transaction.initializeTransaction()

    const platformSpecificAction = device?.ios ? `${action}Ios` : action

    socket.emit(platformSpecificAction, device?.channel, transactionChannel, data)

    return transactionEndPromise
  }
}

export const controlService = new ControlService()
