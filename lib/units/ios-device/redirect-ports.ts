import * as usbmux from '@irdk/usbmux'
import logger from '../../util/logger.js'
import net from 'node:net'

const log = logger.createLogger('ios:redirect-ports')

/**
 * Open ports from an iOS device to a host.
 * Currently, works only for unix based systems.
 * Returns stop function.
 */
export async function openPort(
    devicePort: number,
    listenPort: number,
    udid: string,
    usbmuxPath = '/var/run/usbmuxd',
    loopbackOnly = false
): Promise<() => Promise<void>> {
    try {
        usbmux.address.path = usbmuxPath

        // The library Relay binds all interfaces. Silent workers keep raw WDA/MJPEG private.
        if (loopbackOnly) {
            const deviceId = await usbmux.findDevice({udid})
            const sockets = new Set<net.Socket>()
            let closing = false
            const server = net.createServer(async socket => {
                sockets.add(socket)
                socket.once('close', () => sockets.delete(socket))
                socket.on('error', () => socket.destroy())

                try {
                    const tunnel = await usbmux.connect(deviceId, devicePort)
                    if (closing || socket.destroyed) {
                        tunnel.destroy()
                        return
                    }

                    sockets.add(tunnel)
                    tunnel.once('close', () => {
                        sockets.delete(tunnel)
                        socket.destroy()
                    })
                    tunnel.on('error', () => tunnel.destroy())
                    socket.once('close', () => tunnel.destroy())
                    socket.pipe(tunnel).pipe(socket)
                }
                catch {
                    socket.destroy()
                }
            })

            await new Promise<void>((resolve, reject) => {
                server.once('error', reject)
                server.listen(listenPort, '127.0.0.1', resolve)
            })

            return async () => {
                closing = true
                for (const socket of sockets) socket.destroy()
                await new Promise<void>(resolve => server.close(() => resolve()))
            }
        }

        const relay = new usbmux.Relay(devicePort, listenPort, {
            udid: udid
        })

        relay.on('error', (error: any) => {
            log.error(`Relay error: ${error.message} (code: ${error.number || 'unknown'})`)
        })

        await new Promise<void>((resolve, reject) => {
            const readyHandler = () => {
                relay.removeListener('error', errorHandler)
                log.debug(`Relay ready: ${devicePort} -> ${listenPort} (${udid})`)
                resolve()
            }

            const errorHandler = (error: any) => {
                relay.removeListener('ready', readyHandler)
                reject(error)
            }

            relay.once('ready', readyHandler)
            relay.once('error', errorHandler)
        })

        relay.once('detached', (deviceUdid: string) => {
            log.warn(`Device detached: ${deviceUdid}`)
        })

        return () => new Promise<void>((resolve, reject) => {
            relay.removeAllListeners('error')
            relay.once('close', () => {
                log.debug(`Relay closed: ${devicePort} -> ${listenPort}`)
                resolve()
            })

            relay.once('error', (reason: any) => {
                log.error(`Error during relay stop: ${reason.message}`)
                reject(reason)
            })

            relay.stop()
        })

    } catch (error: any) {
        log.error(`Failed to create relay: ${error.message}`)
        throw error
    }
}
