import {Transform} from './index.js'

const enum ArithmeticType {
    infinity = 0,
    minusInfinity = 1,
    minusZero = 2
}

const isMinusZero = (value: number): boolean => 1 / value === -Infinity

/**
 * Transform for handling special arithmetic values: Infinity, -Infinity, and -0
 * These values need special handling as they don't serialize properly in JSON
 */
const ArithmeticTransform: Transform = {
    type: 'Arithmetic',
    lookup: Number,

    shouldTransform: (type: string, value: any): value is number => {
        return type === 'number' &&
               (value === Infinity || value === -Infinity || isMinusZero(value))
    },

    toSerializable: (value: number): ArithmeticType => {
        if (value === Infinity) {
            return ArithmeticType.infinity
        }
        if (value === -Infinity) {
            return ArithmeticType.minusInfinity
        }
        return ArithmeticType.minusZero
    },

    fromSerializable: (data: ArithmeticType): number => {
        switch (data) {
        case ArithmeticType.infinity:
            return Infinity
        case ArithmeticType.minusInfinity:
            return -Infinity
        case ArithmeticType.minusZero:
            return -0
        default:
            return data as number
        }
    }
}

export default ArithmeticTransform
