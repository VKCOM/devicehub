import * as Sentry from '@sentry/node'

// ----------------------------------Proxy all methods for Sentry error tracing---------------------------------------//

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg
const ARGUMENT_NAMES = /([^\s,]+)/g

// TODO: argument names can be simplified after build
function getArgumentsNames(fn: Function) {
    const fnStr = fn.toString().replace(STRIP_COMMENTS, '')
    let result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
    return result || []
}

const getAddedAttributes = (fn: Function, args: any[]) => Object.fromEntries(
    getArgumentsNames(fn).map((argument, i) => [
        `dbapi.${argument}`,
        args[i]
    ])
)

export default <T extends Record<string, any>>(model: T) => Object.keys(model).reduce((proxiedModel, method) => {
    if (typeof model[method] !== 'function') {
        proxiedModel[method] = model[method]
        return proxiedModel
    }

    proxiedModel[method] = (...args: any[]) => Sentry.startSpan(
        {
            op: 'dbapi',
            name: method,
            attributes: getAddedAttributes(model[method], args)
        }
        , () => model[method](...args)
    )
    return proxiedModel
}, {} as T)

