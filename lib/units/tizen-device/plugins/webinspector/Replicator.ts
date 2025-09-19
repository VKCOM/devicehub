import {Transform} from './transform/index.js'

// Constants
const TRANSFORMED_TYPE_KEY = '@t'
const CIRCULAR_REF_KEY = '@r'
const KEY_REQUIRE_ESCAPING_RE = /^#*@(t|r)$/
const REMAINING_KEY = '__console_feed_remaining__'
const GLOBAL = (function getGlobal() {
    // NOTE: see http://www.ecma-international.org/ecma-262/6.0/index.html#sec-performeval step 10
    // eslint-disable-next-line no-eval
    const savedEval = eval
    return savedEval('this')
})()
const ARRAY_BUFFER_SUPPORTED = typeof ArrayBuffer === 'function'
const MAP_SUPPORTED = typeof Map === 'function'
const SET_SUPPORTED = typeof Set === 'function'
const TYPED_ARRAY_CTORS = [
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array',
] as const

const arrSlice = Array.prototype.slice

interface Serializer {
    serialize(val: any): string
    deserialize(val: string): any
}

interface CircularCandidateDescriptor {
    parent: any
    key: string | number
    refIdx: number
}

interface TransformedObject {
    [TRANSFORMED_TYPE_KEY]: string
    data: any
}

interface CircularReference {
    [CIRCULAR_REF_KEY]: number
}

// Default serializer
const JSONSerializer: Serializer = {
    serialize: (val: any): string => JSON.stringify(val),
    deserialize: (val: string): any => JSON.parse(val)
}

class EncodingTransformer {
    private readonly references: any
    private readonly transforms: Transform[]
    private readonly transformsMap: Map<any, Transform> | undefined
    private readonly circularCandidates: any[] = []
    private readonly circularCandidatesDescrs: CircularCandidateDescriptor[] = []
    private circularRefCount: number = 0
    private readonly limit: number

    constructor(val: any, transforms: Transform[], limit?: number) {
        this.references = val
        this.transforms = transforms
        this.transformsMap = this._makeTransformsMap()
        this.limit = limit ?? Infinity
    }

    private static _createRefMark(idx: number): CircularReference {
        const obj = Object.create(null)
        obj[CIRCULAR_REF_KEY] = idx
        return obj
    }

    private _createCircularCandidate(val: any, parent: any, key: string | number): void {
        this.circularCandidates.push(val)
        this.circularCandidatesDescrs.push({parent, key, refIdx: -1})
    }

    private _applyTransform(val: any, parent: any, key: string | number, transform: Transform): TransformedObject {
        const result = Object.create(null)
        const serializableVal = transform.toSerializable(val)

        if (typeof serializableVal === 'object' && serializableVal !== null) {
            this._createCircularCandidate(val, parent, key)
        }

        result[TRANSFORMED_TYPE_KEY] = transform.type
        result.data = this._handleValue(() => serializableVal, parent, key)
        return result
    }

    private _handleArray = (arr: any[]): any[] => {
        const result: any[] = []
        const arrayLimit = Math.min(arr.length, this.limit)
        const remaining = arr.length - arrayLimit

        for (let i = 0; i < arrayLimit; i++) {
            result[i] = this._handleValue(() => arr[i], result, i)
        }

        result[arrayLimit] = REMAINING_KEY + remaining

        return result
    }

    private _handlePlainObject(obj: Record<string, any>): Record<string, any> {
        const result = Object.create(null)
        let counter = 0
        let total = 0

        for (const key in obj) {
            if (Reflect.has(obj, key)) {
                if (counter >= this.limit) {
                    total++
                    continue
                }

                const resultKey = KEY_REQUIRE_ESCAPING_RE.test(key) ? '#' + key : key
                result[resultKey] = this._handleValue(() => obj[key], result, resultKey)
                counter++
                total++
            }
        }

        const remaining = total - counter
        // eslint-disable-next-line no-proto
        const name = obj?.__proto__?.constructor?.name

        if (name && name !== 'Object') {
            result.constructor = {name}
        }

        if (remaining) {
            result[REMAINING_KEY] = remaining
        }

        return result
    }

    private _handleObject(obj: any, parent: any, key: string | number): any {
        this._createCircularCandidate(obj, parent, key)
        return Array.isArray(obj) ? this._handleArray(obj) : this._handlePlainObject(obj)
    }

    private _ensureCircularReference(obj: any): CircularReference | null {
        const circularCandidateIdx = this.circularCandidates.indexOf(obj)

        if (circularCandidateIdx > -1) {
            const descr = this.circularCandidatesDescrs[circularCandidateIdx]

            if (descr.refIdx === -1) {
                descr.refIdx = descr.parent ? ++this.circularRefCount : 0
            }

            return EncodingTransformer._createRefMark(descr.refIdx)
        }

        return null
    }

    private _handleValue(getVal: () => any, parent: any, key: string | number): any {
        try {
            const val = getVal()
            const type = typeof val
            const isObject = type === 'object' && val !== null

            if (isObject) {
                const refMark = this._ensureCircularReference(val)
                if (refMark) {
                    return refMark
                }
            }

            const transform = this._findTransform(type, val)
            if (transform) {
                return this._applyTransform(val, parent, key, transform)
            }

            if (isObject) {
                return this._handleObject(val, parent, key)
            }

            return val
        }
        catch (e) {
            try {
                return this._handleValue(() => (e instanceof Error ? e : new Error(String(e))), parent, key as string | number)
            }
            catch {
                return null
            }
        }
    }

    private _makeTransformsMap(): Map<any, Transform> | undefined {
        if (!MAP_SUPPORTED) {
            return undefined
        }

        const map = new Map<any, Transform>()
        this.transforms.forEach(transform => {
            if (transform.lookup) {
                map.set(transform.lookup, transform)
            }
        })

        return map
    }

    private _findTransform(type: string, val: any): Transform | undefined {
        if (MAP_SUPPORTED && this.transformsMap) {
            if (val?.constructor) {
                const transform = this.transformsMap.get(val.constructor)
                if (transform?.shouldTransform(type, val)) {
                    return transform
                }
            }
        }

        for (const transform of this.transforms) {
            if (transform.shouldTransform(type, val)) {
                return transform
            }
        }

        return undefined
    }

    transform(): any[] {
        const references = [this._handleValue(() => this.references, null, 0)]

        for (const descr of this.circularCandidatesDescrs) {
            if (descr.refIdx > 0) {
                references[descr.refIdx] = descr.parent[descr.key]
                descr.parent[descr.key] = EncodingTransformer._createRefMark(descr.refIdx)
            }
        }

        return references
    }
}

class DecodingTransformer {
    private readonly activeTransformsStack: any[] = []
    private readonly visitedRefs: Record<number, boolean> = Object.create(null)
    private readonly references: any[]
    private readonly transformMap: Record<string, Transform>

    constructor(references: any[], transformsMap: Record<string, Transform>) {
        this.references = references
        this.transformMap = transformsMap
    }

    private _handlePlainObject(obj: Record<string, any>): void {
        const unescaped: Record<string, any> = Object.create(null)

        if ('constructor' in obj) {
            if (!obj.constructor || typeof obj.constructor.name !== 'string') {
                // @ts-ignore
                obj.constructor = {name: 'Object'}
            }
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                this._handleValue(obj[key], obj, key)

                if (KEY_REQUIRE_ESCAPING_RE.test(key)) {
                    // NOTE: use intermediate object to avoid unescaped and escaped keys interference
                    // E.g. unescaped "##@t" will be "#@t" which can overwrite escaped "#@t".
                    unescaped[key.substring(1)] = obj[key]
                    delete obj[key]
                }
            }
        }

        for (const unescapedKey in unescaped) {
            obj[unescapedKey] = unescaped[unescapedKey]
        }
    }

    private _handleTransformedObject(obj: TransformedObject, parent: any, key: string | number): void {
        const transformType = obj[TRANSFORMED_TYPE_KEY]
        const transform = this.transformMap[transformType]

        if (!transform) {
            throw new Error(`Can't find transform for "${transformType}" type.`)
        }

        this.activeTransformsStack.push(obj)
        this._handleValue(obj.data, obj, 'data')
        this.activeTransformsStack.pop()
        parent[key] = transform.fromSerializable(obj.data)
    }

    private _handleCircularSelfRefDuringTransform(refIdx: number, parent: any, key: string | number): void {
        // NOTE: we've hit a hard case: object reference itself during transformation.
        // We can't dereference it since we don't have resulting object yet. And we'll
        // not be able to restore reference lately because we will need to traverse
        // transformed object again and reference might be unreachable or new object contain
        // new circular references. As a workaround we create getter, so once transformation
        // complete, dereferenced property will point to correct transformed object.
        const references = this.references

        Object.defineProperty(parent, key, { // @ts-ignore
            val: undefined,
            configurable: true,
            enumerable: true,
            get(this: { val: any }) {
                if (this.val === undefined) {
                    this.val = references[refIdx]
                }
                return this.val
            },
            set(this: { val: any }, value: any) {
                this.val = value
            }
        })
    }

    private _handleCircularRef(refIdx: number, parent: any, key: string | number): void {
        if (this.activeTransformsStack.includes(this.references[refIdx])) {
            this._handleCircularSelfRefDuringTransform(refIdx, parent, key)
        }
        else {
            if (!this.visitedRefs[refIdx]) {
                this.visitedRefs[refIdx] = true
                this._handleValue(this.references[refIdx], this.references, refIdx)
            }
            parent[key] = this.references[refIdx]
        }
    }

    private _handleValue(val: any, parent: any, key: string | number): void {
        if (typeof val !== 'object' || val === null) {
            return
        }

        const refIdx = (val as CircularReference)[CIRCULAR_REF_KEY]

        if (refIdx !== undefined) {
            this._handleCircularRef(refIdx, parent, key)
        }
        else if ((val as TransformedObject)[TRANSFORMED_TYPE_KEY]) {
            this._handleTransformedObject(val as TransformedObject, parent, key)
        }
        else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                this._handleValue(val[i], val, i)
            }
        }
        else {
            this._handlePlainObject(val)
        }
    }

    transform(): any {
        this.visitedRefs[0] = true
        this._handleValue(this.references[0], this.references, 0)
        return this.references[0]
    }
}

// Built-in transforms with optimized implementations
const builtInTransforms: Transform[] = [
    {
        type: '[[NaN]]',
        shouldTransform: (type: string, val: any): boolean => type === 'number' && isNaN(val),
        toSerializable: (): string => '',
        fromSerializable: (): number => NaN
    },
    {
        type: '[[undefined]]',
        shouldTransform: (type: string): boolean => type === 'undefined',
        toSerializable: (): string => '',
        fromSerializable: (): undefined => undefined
    },
    {
        type: '[[Date]]',
        lookup: Date,
        shouldTransform: (type: string, val: any): boolean => val instanceof Date,
        toSerializable: (date: Date): number => date.getTime(),
        fromSerializable: (val: number): Date => {
            const date = new Date()
            date.setTime(val)
            return date
        }
    },
    {
        type: '[[RegExp]]',
        lookup: RegExp,
        shouldTransform: (type: string, val: any): boolean => val instanceof RegExp,
        toSerializable: (re: RegExp): { src: string; flags: string } => {
            const result = {
                src: re.source,
                flags: ''
            }

            if (re.global) {
                result.flags += 'g'
            }
            if (re.ignoreCase) {
                result.flags += 'i'
            }
            if (re.multiline) {
                result.flags += 'm'
            }

            return result
        },
        fromSerializable: (val: { src: string; flags: string }): RegExp => new RegExp(val.src, val.flags)
    },
    {
        type: '[[Error]]',
        lookup: Error,
        shouldTransform: (type: string, val: any): boolean => val instanceof Error,
        toSerializable: (err: Error): { name: string; message: string; stack?: string } => {
            if (!err.stack) {
                (Error as any).captureStackTrace?.(err)
            }

            return {
                name: err.name,
                message: err.message,
                stack: err.stack
            }
        },
        fromSerializable: (val: { name: string; message: string; stack?: string }): Error => {
            const Ctor = (GLOBAL as any)[val.name] || Error
            const err = new Ctor(val.message)
            err.stack = val.stack
            return err
        }
    },
    {
        type: '[[ArrayBuffer]]',
        lookup: ARRAY_BUFFER_SUPPORTED && ArrayBuffer,
        shouldTransform: (type: string, val: any): boolean => ARRAY_BUFFER_SUPPORTED && val instanceof ArrayBuffer,
        toSerializable: (buffer: ArrayBuffer): number[] => {
            const view = new Int8Array(buffer)
            return arrSlice.call(view)
        },
        fromSerializable: (val: number[]): ArrayBuffer | number[] => {
            if (ARRAY_BUFFER_SUPPORTED) {
                const buffer = new ArrayBuffer(val.length)
                const view = new Int8Array(buffer)
                view.set(val)
                return buffer
            }
            return val
        }
    },
    {
        type: '[[TypedArray]]',
        shouldTransform: (type: string, val: any): boolean => {
            if (ARRAY_BUFFER_SUPPORTED) {
                return ArrayBuffer.isView(val) && !(val instanceof DataView)
            }

            for (const ctorName of TYPED_ARRAY_CTORS) {
                if (typeof (GLOBAL as any)[ctorName] === 'function' && val instanceof (GLOBAL as any)[ctorName]) {
                    return true
                }
            }

            return false
        },
        toSerializable: (arr: any): { ctorName: string; arr: any[] } => ({
            ctorName: arr.constructor.name,
            arr: arrSlice.call(arr)
        }),
        fromSerializable: (val: { ctorName: string; arr: any[] }): any => {
            return typeof (GLOBAL as any)[val.ctorName] === 'function' ?
                new (GLOBAL as any)[val.ctorName](val.arr) :
                val.arr
        }
    },
    {
        type: '[[Map]]',
        lookup: MAP_SUPPORTED && Map,
        shouldTransform: (type: string, val: any): boolean => MAP_SUPPORTED && val instanceof Map,
        toSerializable: (map: Map<any, any>): any[] => {
            const flattenedKVArr: any[] = []
            map.forEach((val, key) => {
                flattenedKVArr.push(key, val)
            })
            return flattenedKVArr
        },
        fromSerializable: (val: any[]): Map<any, any> | any[][] => {
            if (MAP_SUPPORTED) {
                // NOTE: new Map(iterable) is not supported by all browsers
                const map = new Map()
                for (let i = 0; i < val.length; i += 2) {
                    map.set(val[i], val[i + 1])
                }
                return map
            }

            const kvArr: any[][] = []
            for (let j = 0; j < val.length; j += 2) {
                kvArr.push([val[j], val[j + 1]])
            }
            return kvArr
        }
    },
    {
        type: '[[Set]]',
        lookup: SET_SUPPORTED && Set,
        shouldTransform: (type: string, val: any): boolean => SET_SUPPORTED && val instanceof Set,
        toSerializable: (set: Set<any>): any[] => {
            const arr: any[] = []
            set.forEach(val => arr.push(val))
            return arr
        },
        fromSerializable: (val: any[]): Set<any> | any[] => {
            if (SET_SUPPORTED) {
                // NOTE: new Set(iterable) is not supported by all browsers
                const set = new Set()
                for (const item of val) {
                    set.add(item)
                }
                return set
            }
            return val
        }
    }
]

class Replicator {
    private readonly transforms: Transform[] = []
    private readonly transformsMap: Record<string, Transform> = Object.create(null)
    private readonly serializer: Serializer

    constructor(serializer?: Serializer) {
        this.serializer = serializer || JSONSerializer
        this.addTransforms(builtInTransforms)
    }

    addTransforms(transforms: Transform | Transform[]): this {
        const transformsArray = Array.isArray(transforms) ? transforms : [transforms]

        for (const transform of transformsArray) {
            if (this.transformsMap[transform.type]) {
                throw new Error(`Transform with type "${transform.type}" was already added.`)
            }

            this.transforms.push(transform)
            this.transformsMap[transform.type] = transform
        }

        return this
    }

    removeTransforms(transforms: Transform | Transform[]): this {
        const transformsArray = Array.isArray(transforms) ? transforms : [transforms]

        for (const transform of transformsArray) {
            const idx = this.transforms.indexOf(transform)

            if (idx > -1) {
                this.transforms.splice(idx, 1)
            }

            delete this.transformsMap[transform.type]
        }

        return this
    }

    encode(val: any, limit?: number): string {
        const transformer = new EncodingTransformer(val, this.transforms, limit)
        const references = transformer.transform()
        return this.serializer.serialize(references)
    }

    decode(val: string): any {
        const references = this.serializer.deserialize(val)
        const transformer = new DecodingTransformer(references, this.transformsMap)
        return transformer.transform()
    }
}

export default Replicator
