import type {Readable} from 'node:stream'

/**
 * See https://github.com/openstf/minicap
 */
export interface Banner {
    version: number
    length: number
    pid: number
    realWidth: number
    realHeight: number
    virtualWidth: number
    virtualHeight: number
    orientation: number
    quirks: {
        dumb: boolean
        alwaysUpright: boolean
        tear: boolean
    }
}

type BannerStream = Readable & {banner?: Banner; read: (n: number) => Buffer | null}

export const read = function parseBanner(out: BannerStream, signal?: AbortSignal): Promise<Banner> {
    return new Promise<Banner>(function(resolve, reject) {
        let readBannerBytes = 0
        let needBannerBytes = 2
        const banner: Banner = (out.banner = {
            version: 0,
            length: 0,
            pid: 0,
            realWidth: 0,
            realHeight: 0,
            virtualWidth: 0,
            virtualHeight: 0,
            orientation: 0,
            quirks: {
                dumb: false,
                alwaysUpright: false,
                tear: false,
            },
        })

        const cleanup = (): void => {
            out.removeListener('readable', tryRead)
            if (signal) signal.removeEventListener('abort', onAbort)
        }

        const onAbort = (): void => {
            cleanup()
            reject(signal?.reason ?? new Error('Banner read aborted'))
        }

        const tryRead = function(): void {
            let chunk: Buffer | null
            while ((chunk = out.read(needBannerBytes - readBannerBytes))) {
                for (let cursor = 0, len = chunk.length; cursor < len;) {
                    if (readBannerBytes < needBannerBytes) {
                        switch (readBannerBytes) {
                            case 0:
                                // version
                                banner.version = chunk[cursor]
                                break
                            case 1:
                                // length
                                banner.length = needBannerBytes = chunk[cursor]
                                break
                            case 2:
                            case 3:
                            case 4:
                            case 5:
                                // pid
                                banner.pid += (chunk[cursor] << ((readBannerBytes - 2) * 8)) >>> 0
                                break
                            case 6:
                            case 7:
                            case 8:
                            case 9:
                                // real width
                                banner.realWidth += (chunk[cursor] << ((readBannerBytes - 6) * 8)) >>> 0
                                break
                            case 10:
                            case 11:
                            case 12:
                            case 13:
                                // real height
                                banner.realHeight += (chunk[cursor] << ((readBannerBytes - 10) * 8)) >>> 0
                                break
                            case 14:
                            case 15:
                            case 16:
                            case 17:
                                // virtual width
                                banner.virtualWidth += (chunk[cursor] << ((readBannerBytes - 14) * 8)) >>> 0
                                break
                            case 18:
                            case 19:
                            case 20:
                            case 21:
                                // virtual height
                                banner.virtualHeight += (chunk[cursor] << ((readBannerBytes - 18) * 8)) >>> 0
                                break
                            case 22:
                                // orientation
                                banner.orientation += chunk[cursor] * 90
                                break
                            case 23:
                                // quirks
                                banner.quirks.dumb = (chunk[cursor] & 1) === 1
                                banner.quirks.alwaysUpright = (chunk[cursor] & 2) === 2
                                banner.quirks.tear = (chunk[cursor] & 4) === 4
                                break
                        }
                        cursor += 1
                        readBannerBytes += 1
                        if (readBannerBytes === needBannerBytes) {
                            cleanup()
                            resolve(banner)
                            return
                        }
                    } else {
                        cleanup()
                        reject(new Error('Supposedly impossible error parsing banner'))
                        return
                    }
                }
            }
        }

        if (signal) {
            if (signal.aborted) {
                reject(signal.reason ?? new Error('Banner read aborted'))
                return
            }
            signal.addEventListener('abort', onAbort, {once: true})
        }

        tryRead()
        out.on('readable', tryRead)
    })
}
