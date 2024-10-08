import os from 'os'
import temp from '../../units/storage/temp.js'
export const command = 'storage-temp'
export const describe = 'Start a temp storage unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_STORAGE_TEMP')
        .strict()
        .option('max-file-size', {
        describe: 'Maximum file size to allow for uploads. Note that nginx ' +
            'may have a separate limit, meaning you should change both.'
        , type: 'number'
        , default: 1 * 1024 * 1024 * 1024
    })
        .option('port', {
        alias: 'p'
        , describe: 'The port to bind to.'
        , type: 'number'
        , default: process.env.PORT || 7100
    })
        .option('connect-push', {
        describe: 'Device-side ZeroMQ PULL endpoint to connect to.'
        , array: true
        , demand: true
    })
        .option('connect-sub', {
        describe: 'Device-side ZeroMQ PULL endpoint to connect to.'
        , array: true
        , demand: true
    })
        .option('save-dir', {
        describe: 'The location where files are saved to.'
        , type: 'string'
        , default: os.tmpdir()
    })
        .option('bundletool-path', {
        describe: 'The path to bundletool binary.'
        , type: 'string'
        , default: '/app/bundletool/bundletool.jar'
    })
        .option('ks', {
        describe: 'The name of the keystore to sign APKs built from AAB.'
        , type: 'string'
        , default: 'openstf'
    })
        .option('ks-key-alias', {
        describe: 'Indicates the alias to be used in the future to refer to the keystore.'
        , type: 'string'
        , default: 'mykey'
    })
        .option('ks-pass', {
        describe: 'The password of the keystore.'
        , type: 'string'
        , default: 'openstf'
    })
        .option('ks-key-pass', {
        describe: 'The password of the private key contained in keystore.'
        , type: 'string'
        , default: 'openstf'
    })
        .option('ks-keyalg', {
        describe: 'The algorithm that is used to generate the key.'
        , type: 'string'
        , default: 'RSA'
    })
        .option('ks-validity', {
        describe: 'Number of days of keystore validity.'
        , type: 'number'
        , default: '90'
    })
        .option('ks-keysize', {
        describe: 'Key size of the keystore.'
        , type: 'number'
        , default: '2048'
    })
        .option('ks-dname', {
        describe: 'Keystore Distinguished Name, contain Common Name(CN), ' +
            'Organizational Unit (OU), Oranization(O), Locality (L), State (S) and Country (C).'
        , type: 'string'
        , default: 'CN=openstf.io, OU=openstf, O=openstf, L=PaloAlto, S=California, C=US'
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
        'underscores and prefixing it with `STF_STORAGE_TEMP_` (e.g. ' +
        '`STF_STORAGE_TEMP_SAVE_DIR`).')
}
export const handler = function(argv) {
    return temp({
        port: argv.port
        , saveDir: argv.saveDir
        , maxFileSize: argv.maxFileSize
        , endpoints: {
            push: argv.connectPush
            , sub: argv.connectSub
        }
        , publicIp: argv.publicIp
        , bundletoolPath: argv.bundletoolPath
        , keystore: {
            ksPath: `/tmp/${argv.ks}.keystore`
            , ksKeyAlias: argv.ksKeyAlias
            , ksPass: argv.ksPass
            , ksKeyPass: argv.ksKeyPass
            , ksKeyalg: argv.ksKeyalg
            , ksValidity: argv.ksValidity
            , ksKeysize: argv.ksKeysize
            , ksDname: argv.ksDname
        }
        , secret: argv.secret
        , ssid: argv.ssid
    })
}
