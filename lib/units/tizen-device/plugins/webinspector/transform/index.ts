// Transform exports
export {default as ArithmeticTransform} from './arithmetic.js'
export {default as BigIntTransform} from './BigInt.js'
export {default as FunctionTransform} from './Function.js'
export {default as HTMLTransform} from './HTML.js'
export {default as MapTransform} from './Map.js'

/**
 * Transform interface matching the main Replicator requirements
 */
export interface Transform {
    type: string
    lookup?: any
    shouldTransform(type: string, val: any): boolean
    toSerializable(val: any): any
    fromSerializable(val: any): any
}
