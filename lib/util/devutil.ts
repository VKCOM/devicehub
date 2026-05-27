import util from 'util'
import split from 'split'
import syrup from '@devicefarmer/stf-syrup'
import type {Client as AdbClient} from '@u4/adbkit'
import type {Duplex, Readable} from 'node:stream'

import adb from '../units/device/support/adb.js'
import properties from '../units/device/support/properties.js'
import logger from './logger.js'
import * as streamutil from './streamutil.js'

export interface DisplayInfo {
    id: number
    width: number
    height: number
    xdpi: number
    ydpi: number
    fps: number
    density: number
    rotation: number
    secure: boolean
    size: number
}

export type TaggedSocket = Duplex & {sock: string}

export interface Identity {
    serial: string
    platform: 'Android'
    manufacturer: string
    operator: string | null
    model: string
    version: string
    abi: string
    sdk: string
    product: string
    cpuPlatform: string
    openGLESVersion: string
    marketName: string
    macAddress: string
    ram: string | number
}

interface DevUtilOptions {
    serial: string
    deviceCode?: string
    [key: string]: unknown
}

interface PsResult {
    showTotalPid: boolean
    pids: number[]
}

export interface DevUtil {
    executeShellCommand: (command: string) => Promise<void>
    ensureUnusedLocalSocket: (sock: string) => Promise<string | undefined>
    waitForLocalSocket: (sock: string, timeout?: number) => Promise<Duplex>
    listPidsByComm: (comm: string, bin: string) => Promise<number[]>
    waitForProcsToDie: (comm: string, bin: string) => Promise<void>
    killProcsByComm: (comm: string, bin: string, mode?: number) => Promise<void>
    makeIdentity: () => Promise<Identity>
    getDeviceMarketName: () => Promise<string>
    getDisplayInfo: (id?: number) => Promise<DisplayInfo>
}

const Manufacturers = {
    HUAWEI: ['HUAWEI', 'HONOR'],
    XIAOMI: ['XIAOMI', 'REDMI', 'POCO'],
    SAMSUNG: ['SAMSUNG'],
}

const isAny = (haystack: string, needles: readonly string[]): boolean =>
    needles.some((n) => haystack.toUpperCase().includes(n))

async function shellToString(adb: AdbClient, serial: string, command: string): Promise<string> {
    try {
        const stream = await adb.getDevice(serial).shell(command)
        const buf: Buffer = await streamutil.readAll(stream)
        return buf.toString('utf8')
    }
    catch {
        return ''
    }
}

function parseWmSize(out: string): {physical?: [number, number]; override?: [number, number]} {
    const result: {physical?: [number, number]; override?: [number, number]} = {}
    const phys = /Physical size:\s*(\d+)x(\d+)/i.exec(out)
    const over = /Override size:\s*(\d+)x(\d+)/i.exec(out)
    if (phys) result.physical = [parseInt(phys[1], 10), parseInt(phys[2], 10)]
    if (over) result.override = [parseInt(over[1], 10), parseInt(over[2], 10)]
    return result
}

function parseWmDensity(out: string): {physical?: number; override?: number} {
    const result: {physical?: number; override?: number} = {}
    const phys = /Physical density:\s*(\d+)/i.exec(out)
    const over = /Override density:\s*(\d+)/i.exec(out)
    if (phys) result.physical = parseInt(phys[1], 10)
    if (over) result.override = parseInt(over[1], 10)
    return result
}

function parseDumpsysDisplay(out: string): {
    width?: number
    height?: number
    density?: number
    rotation?: number
    fps?: number
    secure?: boolean
    xdpi?: number
    ydpi?: number
} {
    const r: {
        width?: number
        height?: number
        density?: number
        rotation?: number
        fps?: number
        secure?: boolean
        xdpi?: number
        ydpi?: number
    } = {}

    // mBaseDisplayInfo / DisplayInfo: "real 1080 x 2400", or "real 1080x2400", or
    // "1080 x 2400, ... density ..." in DisplayDeviceInfo.
    const real = /real\s+(\d+)\s*x\s*(\d+)/i.exec(out)
    if (real) {
        r.width = parseInt(real[1], 10)
        r.height = parseInt(real[2], 10)
    } else {
        const m = /DisplayDeviceInfo\{[^}]*?(\d+)\s*x\s*(\d+)/i.exec(out)
        if (m) {
            r.width = parseInt(m[1], 10)
            r.height = parseInt(m[2], 10)
        }
    }

    const density = /density\s+(\d+(?:\.\d+)?)/i.exec(out) ?? /density:\s*(\d+(?:\.\d+)?)/i.exec(out)
    if (density) r.density = parseFloat(density[1])

    const rotation = /rotation\s+(\d+)/i.exec(out)
    if (rotation) r.rotation = parseInt(rotation[1], 10) * 90 // dumpsys reports 0..3

    const fps = /(\d+(?:\.\d+)?)\s*fps/i.exec(out)
    if (fps) r.fps = parseFloat(fps[1])

    if (/FLAG_SECURE/.test(out)) r.secure = true

    const xdpi = /xDpi[=:]\s*(\d+(?:\.\d+)?)/i.exec(out)
    const ydpi = /yDpi[=:]\s*(\d+(?:\.\d+)?)/i.exec(out)
    if (xdpi) r.xdpi = parseFloat(xdpi[1])
    if (ydpi) r.ydpi = parseFloat(ydpi[1])

    return r
}

function buildDisplayInfo(
    id: number,
    width: number,
    height: number,
    overrides: Partial<DisplayInfo> = {}
): DisplayInfo {
    const xdpi = overrides.xdpi ?? overrides.density ?? 240
    const ydpi = overrides.ydpi ?? overrides.density ?? 240
    return {
        id,
        width,
        height,
        xdpi,
        ydpi,
        fps: overrides.fps ?? 60,
        density: overrides.density ?? 1,
        rotation: overrides.rotation ?? 0,
        secure: overrides.secure ?? false,
        size:
            xdpi > 0 && ydpi > 0
                ? Math.sqrt(Math.pow(width / xdpi, 2) + Math.pow(height / ydpi, 2))
                : 0,
    }
}

export default syrup.serial()
    .dependency(properties)
    .dependency(adb)
    .define(function(options: DevUtilOptions, properties: Record<string, string>, adb: AdbClient) {
        const log = logger.createLogger('util:devutil')
        const devutil = Object.create(null) as DevUtil

        devutil.executeShellCommand = function(command: string): Promise<void> {
            return adb.getDevice(options.serial).execOut(command).then((result) => {
                log.debug(`executing shell command ${command}, %s`, result)
            })
        }

        devutil.ensureUnusedLocalSocket = function(sock: string): Promise<string | undefined> {
            return adb.getDevice(options.serial).openLocal(sock)
                .then(function(conn): string | undefined {
                    conn.end()
                    throw new Error(util.format('Local socket "%s" should be unused', sock))
                })
                .catch((err: Error): string | undefined => {
                    if (err.message.indexOf('closed') !== -1) {
                        return sock
                    }
                    return undefined
                })
        }

        devutil.waitForLocalSocket = (sock: string, timeout = 60 * 1000): Promise<Duplex> =>
            new Promise<Duplex>(async(resolve, reject) => {
                const signal = AbortSignal.timeout(timeout)
                let attempt = 0

                signal.onabort = (): void => reject(signal.reason)

                while (!signal.aborted) {
                    try {
                        const conn = await adb.getDevice(options.serial).openLocal(sock) as TaggedSocket
                        conn.sock = sock
                        resolve(conn)
                        return
                    } catch (err: any) {
                        log.error(`[attempt: ${++attempt}] Error in waitForLocalSocket: ${err?.message}`)
                        await new Promise((r) => setTimeout(r, 500 + attempt * 300))
                    }
                }
            })

        devutil.listPidsByComm = function(comm: string, bin: string): Promise<number[]> {
            const serial = options.serial
            const users: Record<string, boolean> = {shell: true}
            const findProcess = function(out: Readable): Promise<PsResult> {
                return new Promise<PsResult>(function(resolve) {
                    let header = true
                    const pids: number[] = []
                    let showTotalPid = false
                    out.pipe(split())
                        .on('data', function(chunk: Buffer | string) {
                            if (header) {
                                header = false
                            } else {
                                const cols = chunk.toString().split(/\s+/)
                                if (!showTotalPid && cols[0] === 'root') {
                                    showTotalPid = true
                                }
                                const lastCol = cols.pop()
                                if ((lastCol === comm || lastCol === bin) && users[cols[0]]) {
                                    pids.push(Number(cols[1]))
                                }
                            }
                        })
                        .on('end', function() {
                            resolve({showTotalPid, pids})
                        })
                })
            }
            return adb.getDevice(serial).shell('ps 2>/dev/null')
                .then((stream) => findProcess(stream))
                .then(function(res): number[] | Promise<number[]> {
                    if (res.showTotalPid || res.pids.length > 0) {
                        return res.pids
                    }
                    return adb.getDevice(serial).shell('ps -lef 2>/dev/null')
                        .then((stream) => findProcess(stream))
                        .then((res2) => res2.pids)
                })
        }

        devutil.waitForProcsToDie = function(comm: string, bin: string): Promise<void> {
            return devutil.listPidsByComm(comm, bin)
                .then(async(pids): Promise<void> => {
                    if (pids.length) {
                        await new Promise((r) => setTimeout(r, 100))
                        return devutil.waitForProcsToDie(comm, bin)
                    }
                })
        }

        devutil.killProcsByComm = function(comm: string, bin: string, mode?: number): Promise<void> {
            return devutil.listPidsByComm(comm, bin)
                .then(function(pids): Promise<void> {
                    if (!pids.length) {
                        return Promise.resolve()
                    }
                    return adb.getDevice(options.serial).shell(['kill', String(mode ?? -15)].concat(pids.map(String)))
                        .then((out) => new Promise<void>((resolve) => {
                            out.on('end', () => resolve())
                        }))
                        .then(() => devutil.waitForProcsToDie(comm, bin))
                        .catch(() => devutil.killProcsByComm(comm, bin, -9))
                })
        }

        devutil.makeIdentity = async function(): Promise<Identity> {
            const serial = options.serial
            let model = properties['ro.product.model']
            const brand = properties['ro.product.brand']
            const manufacturer = properties['ro.product.manufacturer']
            const operator = properties['gsm.sim.operator.alpha'] ||
                properties['gsm.operator.alpha']
            const version = properties['ro.build.version.release']
            const sdk = properties['ro.build.version.sdk']
            const abi = properties['ro.product.cpu.abi']
            const product = properties['ro.product.name']
            const cpuPlatform = properties['ro.board.platform']
            let openGLESVersionRaw: string | number = properties['ro.opengles.version']
            let marketName = await devutil.getDeviceMarketName()
            if (!marketName) {
                console.warn('Can\'t get marketing name for device, will be used: \'default\'.')
                marketName = 'default'
            }
            const customMarketName = properties['debug.stf.product.device']
            const macAddress = (properties as Record<string, string>).mac_address
            const ram = (properties as Record<string, string>).ram
            let openGLESVersion: string
            const parsedOgl = parseInt(String(openGLESVersionRaw), 10)
            if (isNaN(parsedOgl)) {
                openGLESVersion = '0.0'
            } else {
                const openGLESVersionMajor = (parsedOgl & 0xffff0000) >> 16
                const openGLESVersionMinor = parsedOgl & 0xffff
                openGLESVersion = openGLESVersionMajor + '.' + openGLESVersionMinor
            }
            // Remove brand prefix for consistency. Note that some devices (e.g. TPS650)
            // do not expose the brand property.
            if (brand && model.substr(0, brand.length) === brand) {
                model = model.substr(brand.length)
            }
            // Remove manufacturer prefix for consistency
            if (model.substr(0, manufacturer.length) === manufacturer) {
                model = model.substr(manufacturer.length)
            }
            // update device name for human readable values based on env variables
            const deviceUdid = process.env.DEVICE_UDID
            const deviceName = process.env.STF_PROVIDER_DEVICE_NAME
            console.log('Attacted device udid: ' + deviceUdid + '; name: ' + deviceName)
            if (serial === deviceUdid && deviceName) {
                model = deviceName
            }
            if (customMarketName) {
                marketName = customMarketName
            }
            return {
                serial,
                platform: 'Android',
                manufacturer: manufacturer.toUpperCase(),
                operator: operator || null,
                model,
                version,
                abi,
                sdk,
                product,
                cpuPlatform,
                openGLESVersion,
                marketName,
                macAddress,
                ram,
            }
        }

        devutil.getDeviceMarketName = function(): Promise<string> {
            const serial = options.serial
            const manufacturer = (properties['ro.product.manufacturer'] || '').toUpperCase()
            return adb.getDevice(serial).execOut('settings get global device_name', 'utf-8').then(function(deviceName) {
                if (!deviceName || deviceName === 'null\n') {
                    return adb.getDevice(serial).execOut('settings get secure bluetooth_name', 'utf-8').then(function(bluetoothName) {
                        if (!bluetoothName || bluetoothName === 'null\n') {
                            switch (manufacturer) {
                                case 'ARCHOS':
                                case 'GOOGLE':
                                    return properties['ro.product.model']
                                case 'HMD GLOBAL':
                                    return properties['ro.product.nickname']
                                case 'OPPO':
                                    return adb.getDevice(serial).execOut('settings get secure oppo_device_name', 'utf-8').then(function(oppoDeviceName) {
                                        if (!oppoDeviceName || oppoDeviceName === 'null\n') {
                                            return properties['ro.oppo.market.name']
                                        }
                                        return String(oppoDeviceName)
                                    })
                                case 'HUAWEI':
                                    return properties['ro.config.marketing_name']
                                case 'XIAOMI':
                                    return properties['ro.config.marketing_name']
                                case 'ITEL MOBILE LIMITED':
                                    return properties['transsion.device.name']
                                default:
                                    return properties['ro.product.device']
                            }
                        }
                        return String(bluetoothName)
                    })
                }
                return String(deviceName)
            }).catch(function(err: Error): string {
                log.error(util.format(
                    'Can\'t get marketing name for device, will be used: \'default\'.\nUnexpected error: %s',
                    err
                ))
                return 'default'
            })
        }

        /**
         * Vendor-resilient display detection strategy:
         *   1. `wm size`               -- Physical / Override resolution
         *   2. `wm density`            -- Physical / Override density
         *   3. `dumpsys display`       -- real WxH, density, rotation, fps, secure
         *   4. Vendor switch          -- pick Physical vs Override per OEM quirks
         *   5. Result                 -- buildDisplayInfo() composes the final object
         *
         * Vendor notes:
         *   - HUAWEI / HONOR: EMUI's display-scaling overrides are unreliable; prefer
         *     `dumpsys display` real dimensions, fall back to Physical size from wm.
         *   - XIAOMI / REDMI / POCO: MIUI's "display size" setting silently rewrites
         *     the Override size. Always use Physical size to stay aligned with what
         *     minicap actually streams.
         *   - SAMSUNG: behaves like default; DEX-mode devices may expose additional
         *     internal displays but for id=0 the Override behavior is correct.
         *   - Default: prefer Override (it's what the user has actively set) and fall
         *     back to Physical.
         *
         * Returns zero dimensions only if every source failed.
         */
        devutil.getDisplayInfo = async function(id: number = 0): Promise<DisplayInfo> {
            const serial = options.serial
            const manufacturer = (properties['ro.product.manufacturer'] || '').toUpperCase()

            // Run shell commands in parallel -- they don't depend on each other.
            const [wmSizeOut, wmDensityOut, dumpsysDisplayOut] = await Promise.all([
                shellToString(adb, serial, 'wm size'),
                shellToString(adb, serial, 'wm density'),
                shellToString(adb, serial, 'dumpsys display'),
            ])

            const wmSize = parseWmSize(wmSizeOut)
            const wmDensity = parseWmDensity(wmDensityOut)
            const dumpsys = parseDumpsysDisplay(dumpsysDisplayOut)

            // Pick width/height based on vendor.
            let width = 0
            let height = 0

            if (isAny(manufacturer, Manufacturers.HUAWEI)) {
                // Prefer dumpsys "real WxH"; fall back to Physical size.
                if (dumpsys.width && dumpsys.height) {
                    width = dumpsys.width
                    height = dumpsys.height
                } else if (wmSize.physical) {
                    [width, height] = wmSize.physical
                }
                log.debug(util.format('Display probe (HUAWEI/HONOR): chose %dx%d', width, height))
            } else if (isAny(manufacturer, Manufacturers.XIAOMI)) {
                // MIUI's Override size lies -- always use Physical, fall back to dumpsys.
                if (wmSize.physical) {
                    [width, height] = wmSize.physical
                } else if (dumpsys.width && dumpsys.height) {
                    width = dumpsys.width
                    height = dumpsys.height
                }
                log.debug(util.format('Display probe (XIAOMI/REDMI/POCO): chose %dx%d (Physical only)', width, height))
            } else if (isAny(manufacturer, Manufacturers.SAMSUNG)) {
                // Samsung honors Override when present.
                if (wmSize.override) {
                    [width, height] = wmSize.override
                } else if (wmSize.physical) {
                    [width, height] = wmSize.physical
                } else if (dumpsys.width && dumpsys.height) {
                    width = dumpsys.width
                    height = dumpsys.height
                }
                log.debug(util.format('Display probe (SAMSUNG): chose %dx%d', width, height))
            } else {
                // Generic: prefer Override if user explicitly set one, else Physical, else dumpsys.
                if (wmSize.override) {
                    [width, height] = wmSize.override
                } else if (wmSize.physical) {
                    [width, height] = wmSize.physical
                } else if (dumpsys.width && dumpsys.height) {
                    width = dumpsys.width
                    height = dumpsys.height
                }
                log.debug(util.format('Display probe (default): chose %dx%d', width, height))
            }

            // Density: prefer override (matches what apps actually see), then physical, then dumpsys, then ro.sf.lcd_density.
            let density: number | undefined
            if (isAny(manufacturer, Manufacturers.XIAOMI)) {
                density = wmDensity.physical ?? wmDensity.override ?? dumpsys.density
            } else {
                density = wmDensity.override ?? wmDensity.physical ?? dumpsys.density
            }
            if (!density) {
                const lcd = parseInt(properties['ro.sf.lcd_density'] || '', 10)
                if (!isNaN(lcd)) density = lcd
            }

            // Convert density (dpi) to a multiplier when buildDisplayInfo expects "scale"-ish.
            // Historically `density` in DisplayInfo is the multiplier (e.g. 2.0 for xhdpi).
            const densityMultiplier = density ? density / 160 : undefined

            return buildDisplayInfo(id, width, height, {
                density: densityMultiplier,
                xdpi: density,
                ydpi: density,
                rotation: dumpsys.rotation,
                fps: dumpsys.fps,
                secure: dumpsys.secure,
            })
        }

        return devutil
    })
