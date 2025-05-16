import AllModel from './models/all/index.js'
import GroupModel from './models/group/index.js'


/**
 * @returns
 * {typeof import("./models/all/model.js") &
 *  typeof import("./models/group/model.js")}
 */
const concatModels = (...models) => Object.assign({}, ...models)

export default concatModels(
    AllModel
    , GroupModel
)
