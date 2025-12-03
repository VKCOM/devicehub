import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import adb from '../support/adb.js'
import group from './group.js'
import service$0 from './service.js'

export default syrup.serial()
    .dependency(adb)
    .dependency(group)
    .dependency(service$0)
    .define(async(options, adb, group, service) => {
        if (!options.cleanup) {
            return
        }

        const log = logger.createLogger('device:plugins:cleanup')

        const getInstalledApps = async() => (
            await adb.getDevice(options.serial).execOut('pm list packages -3') || ''
        )
            .toString()
            .trim()
            .split('\n')
            .map(pkg => pkg.trim().substring(8))

        const checkpoint = await getInstalledApps()
        log.info('Saved checkpoint of installed apps: %s', checkpoint.join(', '))

        const uninstall = (pkg: string) => {
            try {
                log.info('Cleaning up package "%s"', pkg)
                return adb.getDevice(options.serial).uninstall(pkg)
            } catch (err: any) {
                log.warn('Unable to clean up package "%s": %s', pkg, err?.message)
            }
        }

        const removePackages = async() => {
            const apps = await getInstalledApps()
            const newApps = apps.filter(app => !checkpoint.includes(app))

            if (!newApps.length) return
            log.info('Cleaning: %s', newApps.join(', '))

            for (const pkg of newApps) {
                await uninstall(pkg)
            }

            log.info('Cleaning completed')
        }

        const disableBluetooth = async() => {
            if (!options.cleanupDisableBluetooth) {
                return
            }

            const enabled = await service.getBluetoothStatus()
            if (enabled) {
                log.info('Disabling Bluetooth')
                return service.setBluetoothEnabled(false)
            }
        }

        const cleanBluetoothBonds = () => {
            if (!options.cleanupBluetoothBonds) {
                return
            }

            log.info('Cleanup Bluetooth bonds')
            return service.cleanBluetoothBonds()
        }

        group.on('leave', async() => {
            await removePackages()
            await cleanBluetoothBonds()
            await disableBluetooth()
        })
    })
