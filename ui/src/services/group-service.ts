import { inject, injectable, optional } from 'inversify'

import { socket } from '@/api/socket'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { DeviceSession } from './device-session'

import type { DeviceGroup } from '@/generated/types'
import type { TransactionFactory } from '@/types/transaction-factory.type'

const MILLISECONDS_IN_MINUTE = 1000 * 60

@injectable()
export class GroupService {
  constructor(
    @inject(CONTAINER_IDS.factoryTransactionService) private transactionServiceFactory: TransactionFactory,
    @inject(CONTAINER_IDS.deviceSession) @optional() private session?: DeviceSession
  ) {}

  invite(serial: string, deviceGroup?: DeviceGroup): Promise<unknown> {
    if (this.session?.silent) return this.session.start()
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
      socket.emit('group.invite', serial, transactionChannel, {
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

  kick(serial: string): Promise<unknown> {
    if (this.session?.silent) return this.session.release()
    const transaction = this.transactionServiceFactory()
    const { channel: transactionChannel, donePromise: transactionEndPromise } = transaction.initializeTransaction()

    socket.emit('group.kick', serial, transactionChannel, {
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
