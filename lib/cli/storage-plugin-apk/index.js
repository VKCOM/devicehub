import os from 'os'
import apk from '../../units/storage/plugins/apk/index.js'
export const command = 'storage-plugin-apk'
export const describe = 'Start an APK storage plugin unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_STORAGE_PLUGIN_APK')
        .strict()
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
            describe: 'The location where to cache APK files.'
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
        'underscores and prefixing it with `STF_STORAGE_PLUGIN_APK_` (e.g. ' +
        '`STF_STORAGE_PLUGIN_APK_CACHE_DIR`).')
}
export const handler = function(argv) {
    return apk({
        port: argv.port
        , storageUrl: argv.storageUrl
        , cacheDir: argv.cacheDir
        , secret: argv.secret
        , ssid: argv.ssid
    })
}
