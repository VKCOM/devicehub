import {v4 as uuidv4} from 'uuid'
import apiutil from '../util/apiutil.js'
import wire from './index.js'
import {WireRouter} from './router.js'
import * as Sentry from '@sentry/node'
import wireutil from './util.js'

export const runTransaction = (channel, message, {sub, push, channelRouter, timeout = apiutil.GRPC_WAIT_TIMEOUT}) => {
    return Sentry.startSpan({
        op: 'wireTransaction',
        name: message.$code,
        attributes: {
            message,
            channel,
            timeout
        },
        forceTransaction: true,
    }, () => {
        const responseChannel = 'txn_' + uuidv4()
        sub.subscribe(responseChannel)
        return new Promise((resolve, reject) => {
            const messageListener = new WireRouter()
                .on(wire.TransactionDoneMessage, function(channel, message) {
                    clearTimeout(trTimeout)
                    sub.unsubscribe(responseChannel)
                    channelRouter.removeListener(responseChannel, messageListener)
                    if (message.success) {
                        resolve(message)
                    }
                    else {
                        reject(message)
                    }
                })
                .handler()

            const trTimeout = setTimeout(function() {
                channelRouter.removeListener(responseChannel, messageListener)
                sub.unsubscribe(responseChannel)

                Sentry.addBreadcrumb({
                    data: {channel, message, timeout},
                    message: 'Transaction context',
                    level: 'warning',
                    type: 'default'
                })
                Sentry.captureMessage('Timeout when running transaction')
                reject(new Error('Timeout when running transaction'))
            }, timeout)

            channelRouter.on(responseChannel, messageListener)
            push.send([
                channel,
                wireutil.transaction(responseChannel, message)
            ])
        })
    })
}
