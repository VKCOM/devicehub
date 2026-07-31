import groupsEngine from '../../units/groups-engine/index.js'
export const command = 'groups-engine'
export const describe = 'Start the groups engine unit.'
export const builder = function(yargs) {
    return yargs
        .env('DH')
        .option('connect-proxy', {
            alias: 'c',
            describe: 'Proxy ROUTER endpoint(s) to connect to.',
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
            proxy: argv.connectProxy
        }
    })
}
