import { MessageType } from "@protobuf-ts/runtime";
import { createLogger } from "../util/logger.ts";
const allClasses = await import('./wire.ts')


const log = createLogger('wire:legacy')

interface UnknownMessage<T extends object> {
    new(...args: unknown[]): T
    type: MessageType<T>
}

const alerted = new Set<string>()

/**
 * @deprecated Do not use the proxy for the constructor. Import the model directly from wire.ts
 */
export default new Proxy({} as Record<string, UnknownMessage<object>>, {
    get(target, prop, receiver) {
        const messageType = (allClasses as any)[prop] as MessageType<object>
        if (!messageType) {
            throw new Error(`Unknown message type tried constructing: ${prop.toString()}`)
        }
        if (!alerted.has(messageType.typeName)) {
            alerted.add(messageType.typeName)
            log.warn('Legacy contstructor lookup for %s', messageType.typeName)
        }
        const construct = function constructor(this: any, ...args: unknown[]) {
            const message = messageType.create(Object.fromEntries(messageType.fields.map((name, index) => ([name.localName, args[index]]))))
            Object.assign(this, message)
        }
        construct.type = messageType
        return construct
    }
})
