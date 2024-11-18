import s3 from '../../units/storage/s3.js'
export const command = 'storage-s3'
export const describe = 'Start an S3 storage unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_STORAGE_S3')
        .strict()
        .option('bucket', {
            describe: 'S3 bucket name.'
            , type: 'string'
            , demand: true
        })
        .option('endpoint', {
            describe: 'S3 bucket endpoint.'
            , type: 'string'
            , demand: true
        })
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
        .option('profile', {
            describe: 'AWS credentials profile name.'
            , type: 'string'
            , demand: true
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_STORAGE_S3_` (e.g. ' +
        '`STF_STORAGE_S3_PROFILE`).')
}
export const handler = function(argv) {
    return s3({
        port: argv.port
        , profile: argv.profile
        , bucket: argv.bucket
        , endpoint: argv.endpoint
        , maxFileSize: argv.maxFileSize
    })
}
