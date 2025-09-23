import {Transform} from './index.js'

/**
 * Serialized Map data structure
 */
interface SerializedMap {
    name: 'Map'
    body: Record<string, any>
    proto: string
}

/**
 * Transform for serializing Map objects into JSON-compatible format
 * Handles object keys by JSON stringifying them
 */
const MapTransform: Transform = {
    type: 'Map',
    lookup: Map,

    // Optimized Map detection using constructor name
    shouldTransform: (type: string, obj: any): obj is Map<any, any> => {
        return obj?.constructor?.name === 'Map'
    },

    // Convert Map to serializable object with stringified object keys
    toSerializable: (map: Map<any, any>): SerializedMap => {
        const body: Record<string, any> = {}

        // Optimize iteration with forEach for better performance
        map.forEach((value, key) => {
            // Stringify object keys, keep primitive keys as-is for efficiency
            const serializedKey = typeof key === 'object' ? JSON.stringify(key) : key
            body[serializedKey] = value
        })

        return {
            name: 'Map',
            body,
            proto: Object.getPrototypeOf(map).constructor.name
        }
    },

    // Convert serialized data back to object (not actual Map for compatibility)
    fromSerializable: (data: SerializedMap): Record<string, any> => {
        const obj = {...data.body}

        // Restore constructor information if available
        if (typeof data.proto === 'string') {
            // @ts-ignore - Intentional constructor override for compatibility
            obj.constructor = {
                name: data.proto
            }
        }

        return obj
    }
}

export default MapTransform
