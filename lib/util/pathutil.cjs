var path = require('path')
var fs = require('fs')
var util = require('util')

// Export
module.exports.root = function(target) {
    return path.resolve(__dirname, '../..', target)
}

// Export
module.exports.reactFrontend = function(target) {
    return path.resolve(__dirname, '../../ui', target)
}

// Export
module.exports.vendor = function(target) {
    return path.resolve(__dirname, '../../vendor', target)
}

// Export
module.exports.module = function(target) {
    return path.resolve(__dirname, '../../node_modules', target)
}

// Export
module.exports.match = function(candidates) {
    for (var i = 0, l = candidates.length; i < l; ++i) {
        if (fs.existsSync(candidates[i])) {
            return candidates[i]
        }
    }
    return undefined
}

// Export
module.exports.requiredMatch = function(candidates) {
    var matched = this.match(candidates)
    if(matched !== undefined) {
        return matched
    }
    else {
        throw new Error(util.format(
            'At least one of these paths should exist: %s'
            , candidates.join(', ')
        ))
    }
}
