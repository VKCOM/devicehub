import { inject, injectable } from 'inversify'

import { socket } from '@/api/socket'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { DeviceGroup } from '@/generated/types'
import type { TransactionFactory } from '@/types/transaction-factory.type'

const MILLISECONDS_IN_MINUTE = 1000 * 60

@injectable()
export class GroupService {
  constructor(@inject(CONTAINER_IDS.factoryTransactionService) private transactionServiceFactory: TransactionFactory) {}

  invite(serial: string, channel: string, deviceGroup?: DeviceGroup): Promise<unknown> {
    /* NOTE: 1 for Infinity */
    let timeout = 1

    if (deviceGroup?.id === deviceGroup?.origin) {
      timeout = MILLISECONDS_IN_MINUTE * 15
    }

    if (deviceGroup?.class === 'once') {
      timeout = MILLISECONDS_IN_MINUTE * 40
    }

    const transaction = this.transactionServiceFactory()
    const { channel: transactionChannel, donePromise: transactionEndPromise } = transaction.initializeTransaction()
    const invite = (): void =>
      socket.emit('group.invite', channel, transactionChannel, {
        requirements: {
          serial: {
            value: serial,
            match: 'exact',
          },
        },
        timeout,
      }) as never

    if (!socket.connected) {
      socket.on('connect', invite)
    } else {
      invite()
    }

    return transactionEndPromise
  }

  kick(serial: string, channel: string): Promise<unknown> {
    const transaction = this.transactionServiceFactory()
    const { channel: transactionChannel, donePromise: transactionEndPromise } = transaction.initializeTransaction()

    socket.emit('group.kick', channel, transactionChannel, {
      requirements: {
        serial: {
          value: serial,
          match: 'exact',
        },
      },
    })

    return transactionEndPromise
  }
}
