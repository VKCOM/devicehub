import os from 'os'
import image from '../../units/storage/plugins/image/index.js'
export const command = 'storage-plugin-image'
export const describe = 'Start an image storage plugin unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_STORAGE_PLUGIN_IMAGE')
        .strict()
        .option('concurrency', {
        alias: 'c'
        , describe: 'Maximum number of simultaneous transformations.'
        , type: 'number'
    })
        .option('port', {
        alias: 'p'
        , describe: 'The port to bind to.'
        , type: 'number'
        , default: process.env.PORT || 7100
    })
        .option('storage-url', {
        alias: 'r'
        , describe: 'URL to the storage unit.'
        , type: 'string'
        , demand: true
    })
        .option('cache-dir', {
        describe: 'The location where to cache images.'
        , type: 'string'
        , default: os.tmpdir()
    })
        .option('secret', {
        alias: 's'
        , describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
            'knows this token can freely enter the system if they want, so keep ' +
            'it safe.'
        , type: 'string'
        , default: process.env.SECRET
        , demand: true
    })
        .option('ssid', {
        alias: 'i'
        , describe: 'The name of the session ID cookie.'
        , type: 'string'
        , default: process.env.SSID || 'ssid'
    })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_STORAGE_PLUGIN_IMAGE_` (e.g. ' +
        '`STF_STORAGE_PLUGIN_IMAGE_CONCURRENCY`).')
}
export const handler = function(argv) {
    return image({
        port: argv.port
        , storageUrl: argv.storageUrl
        , cacheDir: argv.cacheDir
        , concurrency: argv.concurrency || os.cpus().length
        , secret: argv.secret
        , ssid: argv.ssid
    })
}
