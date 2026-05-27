import syrup from '@devicefarmer/stf-syrup'
import _ from 'lodash'
import * as tr from 'transliteration'

export type UrlFormatter = (
    template: string,
    port: number,
    model?: string | null,
    name?: string | null,
) => string

interface UrlFormatOptions {
    [key: string]: unknown
}

const createSlug = (model: string, name: string): string =>
    (name === '' || model.toLowerCase() === name.toLowerCase()) ?
        tr.slugify(model) :
        tr.slugify(name + ' ' + model)

export default syrup.serial()
    .define((options: UrlFormatOptions): UrlFormatter =>
        (template, port, model = null, name = null) => {
            const safeModel = model ?? ''
            const safeName = name ?? ''
            const slug = (safeName || safeModel) ? createSlug(safeModel, safeName) : 'slug'

            return _.template(template, {
                imports: {
                    slugify: tr.slugify,
                },
            })(
                Object.assign(
                    {
                        model: safeModel,
                        name: safeName,
                        slug,
                        publicPort: port,
                    },
                    options,
                ),
            )
        })
