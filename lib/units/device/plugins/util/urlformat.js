import syrup from '@devicefarmer/stf-syrup'
import _ from 'lodash'
import * as tr from 'transliteration'
import identity from './identity.js'
import data from './data.js'
export default syrup.serial()
    .dependency(identity)
    .dependency(data)
    .define(function(options, identity, data) {
    function createSlug() {
        var model = identity.model
        var name = data ? data.name.id : ''
        return (name === '' || model.toLowerCase() === name.toLowerCase()) ?
            tr.slugify(model) :
            tr.slugify(name + ' ' + model)
    }
    var defaults = {
        publicIp: options.publicIp
        , serial: options.serial
        , model: identity.model
        , name: data ? data.name.id : ''
        , slug: createSlug()
    }
    return function(template, port) {
        return _.template(template, {
            imports: {
                slugify: tr.slugify
            }
        })(_.defaults({publicPort: port}, defaults))
    }
})
