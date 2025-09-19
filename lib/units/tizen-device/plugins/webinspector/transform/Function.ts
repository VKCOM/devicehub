import {Transform} from './index.js'

/**
 * Serialized function structure
 */
interface SerializedFunction {
    name?: string
    body?: string
    proto?: string
}

/**
 * Transform for serializing functions into JSON-compatible format
 * Note: This creates placeholder functions, not executable ones
 */
const FunctionTransform: Transform = {
    type: 'Function',
    lookup: Function,

    // Simple and fast function type check
    shouldTransform: (type: string, obj: any): obj is Function => {
        return typeof obj === 'function'
    },

    // Extract function metadata for serialization
    toSerializable: (func: Function): SerializedFunction => {
        let body = ''

        try {
            // Extract function body between first { and last }
            const funcString = func.toString()
            const startIndex = funcString.indexOf('{') + 1
            const endIndex = funcString.lastIndexOf('}')

            if (startIndex > 0 && endIndex > startIndex) {
                body = funcString.substring(startIndex, endIndex)
            }
        }
        catch {
            // Ignore errors in function stringification
        }

        return {
            name: func.name,
            body,
            proto: Object.getPrototypeOf(func).constructor.name
        }
    },

    // Create placeholder function with metadata
    fromSerializable: (data: SerializedFunction): Function | SerializedFunction => {
        try {
            const tempFunc = function() {}

            if (typeof data.name === 'string') {
                Object.defineProperty(tempFunc, 'name', {
                    value: data.name,
                    writable: false,
                    configurable: true
                })
            }

            if (typeof data.body === 'string') {
                Object.defineProperty(tempFunc, 'body', {
                    value: data.body,
                    writable: false,
                    configurable: true
                })
            }

            if (typeof data.proto === 'string') { // @ts-ignore
                tempFunc.constructor = {
                    name: data.proto
                }
            }

            return tempFunc
        }
        catch {
            return data
        }
    }
}

export default FunctionTransform
