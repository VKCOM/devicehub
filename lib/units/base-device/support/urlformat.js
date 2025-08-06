import syrup from '@devicefarmer/stf-syrup'
import _ from 'lodash'
import * as tr from 'transliteration'

export default syrup.serial()
    .define((options) => {
        const createSlug = (model, name) =>
            (name === '' || model.toLowerCase() === name.toLowerCase()) ?
                tr.slugify(model) :
                tr.slugify(name + ' ' + model)

        return (template, port, model = null, name = null) =>
            _.template(template, {
                imports: {
                    slugify: tr.slugify
                }
            })(
                Object.assign({
                    model, name,
                    slug: name || model ? createSlug(model, name) : 'slug',
                    publicPort: port
                }, options)
            )
    })
