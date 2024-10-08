import serveStatic from 'serve-static'
import * as pathutil from '../../../util/pathutil.cjs'
export default (function() {
    return serveStatic(pathutil.root('node_modules/@devicefarmer/stf-browser-db/dist'), {
        maxAge: '30d'
    })
})
