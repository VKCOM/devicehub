import {Transform} from './index.js'

/**
 * Serialized HTML element structure
 */
interface SerializedHTMLElement {
    tagName: string
    attributes: Record<string, string>
    innerHTML: string
}

/**
 * HTML element-like object for type checking
 */
interface HTMLElementLike {
    children: any
    innerHTML: string
    tagName: string
    attributes: ArrayLike<{ name: string; value: string }> & Iterable<{ name: string; value: string }>
}

// Cached sandbox document for performance
let sandbox: Document | undefined

/**
 * Get or create sandbox document for safe HTML parsing
 */
const getSandbox = (): Document => {
    return sandbox ??= document.implementation.createHTMLDocument('sandbox')
}

/**
 * Efficiently convert element attributes to plain object
 */
const objectifyAttributes = (element: HTMLElementLike): Record<string, string> => {
    const data: Record<string, string> = {}

    // Use for...of for better performance with NamedNodeMap
    for (const attribute of element.attributes) {
        data[attribute.name] = attribute.value
    }

    return data
}

/**
 * Transform for serializing HTML elements into JSON-compatible format
 * Uses sandboxed document for safe deserialization
 */
const HTMLTransform: Transform = {
    type: 'HTMLElement',

    // Optimized HTML element detection
    shouldTransform: (type: string, obj: any): obj is HTMLElementLike => {
        return obj &&
               obj.children &&
               typeof obj.innerHTML === 'string' &&
               typeof obj.tagName === 'string'
    },

    // Serialize HTML element to plain object
    toSerializable: (element: HTMLElementLike): SerializedHTMLElement => {
        return {
            tagName: element.tagName.toLowerCase(),
            attributes: objectifyAttributes(element),
            innerHTML: element.innerHTML
        }
    },

    // Deserialize to actual HTML element using sandbox
    fromSerializable: (data: SerializedHTMLElement): HTMLElement | SerializedHTMLElement => {
        try {
            const element = getSandbox().createElement(data.tagName)
            element.innerHTML = data.innerHTML

            for (const attributeName of Object.keys(data.attributes)) {
                try {
                    element.setAttribute(attributeName, data.attributes[attributeName])
                }
                catch {
                    // no-op
                }
            }

            return element
        }
        catch {
            return data
        }
    }
}

export default HTMLTransform
