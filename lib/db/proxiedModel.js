import * as Sentry from '@sentry/node'

// ----------------------------------Proxy all methods for Sentry error tracing---------------------------------------//

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg
const ARGUMENT_NAMES = /([^\s,]+)/g

// TODO: argument names can be simplified after build
function getArgumentsNames(fn) {
    const fnStr = fn.toString().replace(STRIP_COMMENTS, '')
    let result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
    return result || []
}

const getAddedAttributes = (fn, args) => Object.fromEntries(
    getArgumentsNames(fn).map((argument, i) => [
        `dbapi.${argument}`
        , args[i]
    ])
)

/**
 * @template ModelType
 * @param {ModelType} model
 * @return {ModelType}
 */
// @ts-ignore
export default (model) => new Proxy(model, {

    /** @param {string} prop */
    get(target, prop) {
        return (...args) => Sentry.startSpan(
            {
                op: 'dbapi'
                , name: prop
                , attributes: args?.length ? getAddedAttributes(target[prop], args) : {}
            }
            , () => target[prop](...args)
        )
    }
})

// export default (model) => model ? Object.keys(model).reduce((proxiedModel, method) => {
//     db.connect()
//     // console.log('\n\n', method, '\n\n')
//     proxiedModel[method] = (...args) => Sentry.startSpan(
//         {
//             op: 'dbapi'
//             , name: method
//             , attributes: getAddedAttributes(model[method], args)
//         }
//         , () => model[method](...args)
//     )
//     return proxiedModel
// }, Object.create({})) : model

