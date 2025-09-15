import syrup from '@devicefarmer/stf-syrup'
import push from '../../base-device/support/push.js'
import router from '../../base-device/support/router.js'
import group from '../../base-device/plugins/group.js'
import sdb from './sdb/index.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import webinspector from './webinspector/index.js'

export default syrup.serial()
    .dependency(push)
    .dependency(router)
    .dependency(sdb)
    .dependency(webinspector)
    .dependency(group)
    .define((options, push, router, sdb, webinspector, group) => {
        const reply = wireutil.reply(options.serial)

        const success = (channel, body) => push.send([channel, reply.okay('success', body)])

        const plugin = {
            app: null,

            killApp: async(force) => {
                try {
                    if (!plugin.app?.pkg) {
                        throw 'No application running'
                    }
                    const result = await sdb.killApp(plugin.app.pkg, force)
                    plugin.app = null

                    return {result}
                }
                catch (err) {
                    return {result: false, error: err?.message || err}
                }
            },

            launchApp: async(channel, message) => {
                await plugin.killApp(true)

                plugin.app = await sdb.debugApp(message.pkg)
                    .catch(({message: error}) => ({error}))

                if ('error' in plugin.app) {
                    push.send([channel, reply.fail('fail', plugin.app)])
                    return
                }
                await sdb.forwardPort(options.appInspectPort, plugin.app.port) // only for external webinspector connection

                await webinspector.start(plugin.app.port)
                success(channel, plugin.app)
            },

            start: async() => {
                group.on('leave', () => plugin.killApp(true))
                group.on('join', () => plugin.killApp(true))

                router
                    .on(wire.GetInstalledApplications, async(channel) =>
                        success(channel, Object.fromEntries(await sdb.getApps()))
                    )

                    .on(wire.LaunchDeviceApp, plugin.launchApp)

                    .on(wire.TerminateDeviceApp, async(channel) =>
                        success(channel, await plugin.killApp())
                    )
                    .on(wire.KillDeviceApp, async(channel) =>
                        success(channel, await plugin.killApp(true))
                    )
            }
        }

        return plugin
    })
