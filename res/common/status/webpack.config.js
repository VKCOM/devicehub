var pathutil = require('../../../lib/util/pathutil.cjs')
var options = require('../../../webpack.config.cjs').webpack
var _ = require('lodash')

module.exports = _.defaults(options, {
    entry: pathutil.resource('common/status/scripts/entry.js')
    , output: {
        path: pathutil.resource('build')
        , publicPath: '/static/build/'
        , filename: 'bundle-status.js'
    }
})
