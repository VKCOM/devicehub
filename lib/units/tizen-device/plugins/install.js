import logger from '../../../util/logger.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import router from '../../base-device/support/router.js'
import push from '../../base-device/support/push.js'
import storage from '../../base-device/support/storage.js'
import sdb from './sdb'
import launcher from './launcher'
import deviceutil from '../../../util/deviceutil.js'

export default syrup.serial()
    .dependency(router)
    .dependency(push)
    .dependency(storage)
    .dependency(sdb)
    .dependency(launcher)
    .define((options, router, push, storage, sdb, launcher) => {
        const log = logger.createLogger('tizen-device:plugins:install')
        const reply = wireutil.reply(options.serial)

        router.on(wire.InstallMessage, async function(channel, message) {
            log.info('Installing application from "%s"', message.href, message.launch ? '[ LAUNCH ]' : '')

            const sendProgress = (data, progress) =>
                push.send([channel, reply.progress(data, progress)])

            sendProgress('starting', 0)

            const stopProgressUp = deviceutil.progressUp(sendProgress)
            const {path, cleanup} = await storage.download(message.href, channel, message.jwt)

            stopProgressUp()
            sendProgress('installing_app', 50)

            const installResult = await sdb.install(path, message.pkg, true, 60_000)
            cleanup()

            if (installResult && message.launch && message.pkg) {
                sendProgress('launching_app', 95)

                await launcher.launchApp(channel, message)
                return
            }

            sendProgress('installing_app', 100)
        })

        router.on(wire.UninstallIosMessage, function(channel, message) {
            uninstallApp(options.serial, message.packageName)
        })
    })
