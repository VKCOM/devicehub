import { Readable } from 'stream'

export interface BannerQuirks {
    dumb: boolean
    alwaysUpright: boolean
    tear: boolean
}

export interface Banner {
    version: number
    length: number
    pid: number
    realWidth: number
    realHeight: number
    virtualWidth: number
    virtualHeight: number
    orientation: number
    quirks: BannerQuirks
}

interface BannerStream extends Readable {
    banner?: Banner
}

export const read = (out: BannerStream) =>
    new Promise<Banner>((resolve, reject) => {
        let readBannerBytes = 0
        let needBannerBytes = 2

        const banner: Banner = out.banner = {
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
                tear: false
            }
        }

        const tryRead = function() {
            for (let chunk: Buffer | null; (chunk = out.read(needBannerBytes - readBannerBytes));) {
                for (let cursor = 0, len = chunk.length; cursor < len;) {
                    if (readBannerBytes >= needBannerBytes) {
                        out.removeListener('readable', tryRead)
                        reject(new Error('Supposedly impossible error parsing banner'))
                        return
                    }

                    if (readBannerBytes === 0) {
                        banner.version = chunk[cursor]
                    }

                    else if (readBannerBytes === 1) {
                        banner.length = needBannerBytes = chunk[cursor]
                    }

                    else if (readBannerBytes <= 5) {
                        banner.pid += (chunk[cursor] << ((readBannerBytes - 2) * 8)) >>> 0
                    }

                    else if (readBannerBytes <= 9) {
                        banner.realWidth += (chunk[cursor] << ((readBannerBytes - 6) * 8)) >>> 0
                    }

                    else if (readBannerBytes <= 13) {
                        banner.realHeight += (chunk[cursor] << ((readBannerBytes - 10) * 8)) >>> 0
                    }

                    else if (readBannerBytes <= 17) {
                        banner.virtualWidth += (chunk[cursor] << ((readBannerBytes - 14) * 8)) >>> 0
                    }

                    else if (readBannerBytes <= 21) {
                        banner.virtualHeight += (chunk[cursor] << ((readBannerBytes - 18) * 8)) >>> 0
                    }

                    else if (readBannerBytes === 22) {
                        banner.orientation += chunk[cursor] * 90
                    }

                    else if (readBannerBytes === 23) {
                        banner.quirks.dumb = (chunk[cursor] & 1) === 1
                        banner.quirks.alwaysUpright = (chunk[cursor] & 2) === 2
                        banner.quirks.tear = (chunk[cursor] & 4) === 4
                    }

                    cursor += 1
                    readBannerBytes += 1

                    if (readBannerBytes === needBannerBytes) {
                        out.removeListener('readable', tryRead)
                        return resolve(banner)
                    }
                }
            }
        }

        tryRead()
        out.on('readable', tryRead)
    })
