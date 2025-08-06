import logger from '../../util/logger.js'
import lifecycle from '../../util/lifecycle.js'
import * as zmqutil from '../../util/zmqutil.js'
export default (function(options) {
    const log = logger.createLogger('triproxy')
    if (options.name) {
        logger.setGlobalIdentifier(options.name)
    }
    function proxy(to) {
        return function() {
            log.verbose('Proxied to: ' + to.type + ' with args \n' + arguments[0].toString() + '\n' + arguments[1].toString())
            to.send([].slice.call(arguments))
        }
    }
    // App/device output
    let pub = zmqutil.socket('pub')
    pub.bindSync(options.endpoints.pub)
    log.info('PUB socket bound on', options.endpoints.pub)
    // Coordinator input/output
    let dealer = zmqutil.socket('dealer')
    dealer.bindSync(options.endpoints.dealer)
    dealer.on('message', proxy(pub))
    log.info('DEALER socket bound on', options.endpoints.dealer)
    // App/device input
    let pull = zmqutil.socket('pull')
    pull.bindSync(options.endpoints.pull)
    pull.on('message', proxy(dealer))
    log.info('PULL socket bound on', options.endpoints.pull)
    lifecycle.observe(function() {
        [pub, dealer, pull].forEach(function(sock) {
            try {
                sock.close()
            }
            catch (err) {
                log.error(err)
            }
        })
    })
})
