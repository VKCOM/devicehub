import util from 'util'
import {EventEmitter} from 'node:events'
import {type Duplex} from 'node:stream'
import syrup from '@devicefarmer/stf-syrup'
import {type Client as AdbClient} from '@u4/adbkit'

import logger from '../../../../util/logger.js'
import * as streamutil from '../../../../util/streamutil.js'
import devutil, {type DisplayInfo, type DevUtil} from '../../../../util/devutil.js'
import adb from '../../support/adb.js'
import minicap from '../../resources/minicap.js'
import service from '../service.js'
import options from '../screen/options.js'

const RETRY_ATTEMPTS = 5
const RETRY_DELAY_MS = 500

export interface DisplayProperties extends DisplayInfo {
    url?: string
}

interface ScreenOptions {
    devicePort: number
    publicPort: number
    publicUrl: string
}

/**
 * Surface of the `resources/minicap` syrup unit consumed here.
 * NOTE: `run(mode, cmd)` is the documented two-arg form. The `mode` argument
 * is ignored when SDK >= 23 (minicap is invoked via app_process). The single
 * argument form below is preserved verbatim from the original `display.js`;
 * it relies on minicap.run() tolerating an undefined `cmd` on legacy SDKs.
 */
interface MinicapResource {
    bin: string
    lib: string
    apk: string
    run(mode: string, cmd?: string): Promise<Duplex>
}

interface ServicePluginSurface extends EventEmitter {
    getDisplay: (id: number) => Promise<DisplayInfo>
}

export class Display extends EventEmitter {
    public id: number
    public properties: DisplayProperties

    constructor(id: number, properties: DisplayProperties) {
        super()
        this.id = id
        this.properties = properties
    }

    updateRotation(newRotation: number): void {
        this.properties.rotation = newRotation
        this.emit('rotationChange', newRotation)
    }
}

export default syrup.serial()
    .dependency(adb)
    .dependency(minicap)
    .dependency(service)
    .dependency(options)
    .dependency(devutil)
    .define(async function(
        _options: {serial: string},
        _adb: AdbClient,
        minicap: MinicapResource,
        service: ServicePluginSurface,
        screenOptions: ScreenOptions,
        devutil: DevUtil
    ): Promise<Display> {
        const log = logger.createLogger('device:plugins:display')

        function infoFromMinicap(id: number): Promise<DisplayProperties> {
            return minicap.run(util.format('-d %d -i', id))
                .then((stream) => streamutil.readAll(stream))
                .then(function(out: Buffer): DisplayProperties {
                    const text = out.toString()
                    const errMatch = /^ERROR: (.*)$/.exec(text)
                    if (errMatch) {
                        throw new Error(errMatch[1])
                    }
                    try {
                        return JSON.parse(text) as DisplayProperties
                    }
                    catch {
                        throw new Error(text)
                    }
                })
        }

        function infoFromService(id: number): Promise<DisplayProperties> {
            return service.getDisplay(id)
        }

        async function readInfoOnce(id: number): Promise<DisplayProperties> {
            try {
                const info = await devutil.getDisplayInfo(id)
                if (info.width > 0 && info.height > 0) {
                    return info
                }
                log.warn(util.format('devutil.getDisplayInfo returned zero dimensions for id=%s, falling back', id))
            }
            catch (err: any) {
                log.warn(util.format('devutil.getDisplayInfo failed for id=%s: %s', id, err?.message))
            }

            try {
                return await infoFromService(id)
            }
            catch {
                return await infoFromMinicap(id)
            }
        }

        async function readInfo(id: number): Promise<Display> {
            log.info('Reading display info')

            let lastErr: unknown = null
            for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
                try {
                    const properties = await readInfoOnce(id)
                    if (properties.width > 0 && properties.height > 0) {
                        properties.url = screenOptions.publicUrl
                        return new Display(id, properties)
                    }
                    log.warn(util.format(
                        'Display info attempt %d/%d returned zero dimensions, retrying',
                        attempt,
                        RETRY_ATTEMPTS
                    ))
                } catch (err: any) {
                    lastErr = err
                    log.warn(util.format(
                        'Display info attempt %d/%d failed: %s',
                        attempt,
                        RETRY_ATTEMPTS,
                        err?.message
                    ))
                }
                if (attempt < RETRY_ATTEMPTS) {
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
                }
            }

            // Last resort: return whatever the legacy paths give us (even if zero) so
            // downstream code keeps its existing behaviour rather than crashing the unit.
            const lastErrMessage = lastErr instanceof Error ? lastErr.message : 'none'
            log.fatal(util.format(
                'Unable to obtain positive display dimensions after %d attempts. lastErr=%s',
                RETRY_ATTEMPTS,
                lastErrMessage
            ))
            const properties = await infoFromService(id).catch(() => infoFromMinicap(id))
            properties.url = screenOptions.publicUrl
            return new Display(id, properties)
        }

        const display = await readInfo(0)
        service.on('rotationChange', (data: {rotation: number}) => {
            display.updateRotation(data.rotation)
        })
        return display
    })
