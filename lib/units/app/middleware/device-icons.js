import serveStatic from 'serve-static'
import * as pathutil from '../../../util/pathutil.cjs'
export default (function() {
    return serveStatic(pathutil.root('res/common'), {
        maxAge: '30d'
    })
})
