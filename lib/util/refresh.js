import fs from 'fs'
var watchers = Object.create(null)
function refresh() {
    process.kill('SIGHUP')
}
function collect() {
    Object.keys(require.cache).forEach(function(path) {
        if (!watchers[path]) {
            if (path.indexOf('node_modules') === -1) {
                watchers[path] = fs.watch(path, refresh)
            }
        }
    })
}
export default (function() {
    collect()
})
