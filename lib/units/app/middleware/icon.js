import serveStatic from 'serve-static'
export default (function(rootDir) {
    return serveStatic(`${rootDir}/public/icons`, {
        maxAge: '30d'
    })
})
