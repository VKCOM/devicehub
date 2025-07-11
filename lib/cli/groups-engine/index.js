import groupsEngine from '../../units/groups-engine/index.js'
export const command = 'groups-engine'
export const describe = 'Start the groups engine unit.'
export const builder = function(yargs) {
    return yargs
        .env('STF_GROUPS_ENGINE')
        .strict()
        .option('connect-push', {
            alias: 'c',
            describe: 'App-side ZeroMQ PULL endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-sub', {
            alias: 'u',
            describe: 'App-side ZeroMQ PUB endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-push-dev', {
            alias: 'pd',
            describe: 'Device-side ZeroMQ PULL endpoint to connect to.',
            array: true,
            demand: true
        })
        .option('connect-sub-dev', {
            alias: 'sd',
            describe: 'Device-side ZeroMQ PUB endpoint to connect to.',
            array: true,
            demand: true
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_GROUPS_ENGINE_` .)')
}
export const handler = function(argv) {
    return groupsEngine({
        endpoints: {
            push: argv.connectPush,
            sub: argv.connectSub,
            pushdev: argv.connectPushDev,
            subdev: argv.connectSubDev
        }
    })
}
