import { socket } from '@/api/socket'
import { TransactionService } from '@/services/core/transaction-service/transaction-service'

import type { Device } from '@/generated/types'

const MILLISECONDS_IN_MINUTE = 1000 * 60

class GroupService {
  invite(device: Device): Promise<unknown> {
    /* NOTE: 1 for Infinity */
    let timeout = 1

    if (device.group?.id === device.group?.origin) {
      timeout = MILLISECONDS_IN_MINUTE * 15
    }

    if (device.group?.class === 'once') {
      timeout = MILLISECONDS_IN_MINUTE * 40
    }

    const transaction = new TransactionService()
    const { channel: transactionChannel, promise: transactionEndPromise } = transaction.initializeTransaction()

    socket.emit('group.invite', device.channel, transactionChannel, {
      requirements: {
        serial: {
          value: device.serial,
          match: 'exact',
        },
      },
      timeout,
    })

    return transactionEndPromise
  }

  kick(device: Device): Promise<unknown> {
    const transaction = new TransactionService()
    const { channel: transactionChannel, promise: transactionEndPromise } = transaction.initializeTransaction()

    socket.emit('group.kick', device.channel, transactionChannel, {
      requirements: {
        serial: {
          value: device.serial,
          match: 'exact',
        },
      },
    })

    return transactionEndPromise
  }
}

export const groupService = new GroupService()
