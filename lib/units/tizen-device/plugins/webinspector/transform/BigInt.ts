import {Transform} from './index.js'

/**
 * Optimized BigInt transform for serialization/deserialization
 * Serialize a `bigint` to a string with 'n' suffix for efficient parsing
 */
const BigIntTransform: Transform = {
    type: 'BigInt',

    shouldTransform: (_type: string, obj: any): obj is bigint => {
        return typeof obj === 'bigint'
    },

    toSerializable: (value: bigint): string => {
        return `${value}n`
    },

    fromSerializable: (data: string): bigint => {
        return BigInt(data.slice(0, -1))
    }
}

export default BigIntTransform
