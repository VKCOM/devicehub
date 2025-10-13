import EventEmitter from "eventemitter3";
import logger from "../util/logger.js";
import { MessageType } from "@protobuf-ts/runtime";
import { Envelope } from "./wire.ts";
import { Any } from "./google/protobuf/any.ts";

const log = logger.createLogger("wire:router");

type MessageHandler<T extends object> = (channel: string, message: T, data: Buffer) => unknown

export class WireRouter {
    emitter = new EventEmitter()
    registeredTypes = new Map<string, MessageType<object>>

    on<T extends object>(eventName: string | symbol, fn: MessageHandler<T>, context?: object): this;
    on<T extends object>(messageType: MessageType<T>, fn: MessageHandler<T>): this;
    on<T extends object>(
        messageType: MessageType<T> | string | symbol,
        fn: MessageHandler<T>,
        context?: object
    ): this {
        if (
            typeof messageType !== "string" &&
            typeof messageType !== "symbol"
        ) {
            // WireMessage
            this.emitter.on(messageType.typeName, fn);
            this.registeredTypes.set(Any.typeNameToUrl(messageType.typeName), messageType)
        } else {
            this.emitter.on(messageType, fn, context);
        }
        return this
    }

    removeAllListeners<T extends object>(messageType: MessageType<T>) {
        this.emitter.removeAllListeners(messageType.typeName)
    }

    removeListener<T extends object>(eventName: string | symbol, fn: MessageHandler<T>, context?: object): this;
    removeListener<T extends object>(messageType: MessageType<T>, fn: MessageHandler<T>): this;
    removeListener<T extends object>(
        messageType: MessageType<T> | string | symbol,
        fn: MessageHandler<T>,
        context?: object
    ): this {
        if (typeof messageType === "object") {
            this.emitter.removeListener(messageType.typeName, fn);
        } else {
            this.emitter.removeListener(
                messageType,
                fn,
                context
            )
        }
        return this
    }

    handler() {
        return (channel: string, data: Buffer) => {
            const decoded = Envelope.fromBinary(data);
            if (!decoded.message) {
                log.warn(`Message without message %s`, decoded)
                return
            }
            let target = decoded.message.typeUrl;
            if(!target) {
                log.warn(`Message without typeUrl %s`, decoded)
                return
            }
            const messageType = this.registeredTypes.get(target);
            if (!messageType) {
                // log.warn(`Unknown message type:`, decoded)
                // Nobody is expecting such message type.. Ignoring..
                return
            }
            const decodedMessage = Any.unpack(decoded.message, messageType)
            // const wrapper = wire.Envelope.decode(data);
            // const type = wire.ReverseMessageType[wrapper.type];
            // let decodedMessage: any;

            // try {
            //     decodedMessage = wire[type].decode(wrapper.message)
            // }
            // catch (e) {
            //     log.error(
            //         'Received message with type "%s", but cant parse data ' +
            //             wrapper.message
            //     );
            //     throw e;
            // }

            // log.info(
            //     'Received message with type "%s", and data %s',
            //     messageType.typeName,
            //     messageType.toJsonString(decodedMessage)
            // )

            this.emitter.emit(messageType.typeName, decoded.channel || channel, decodedMessage, data)
            this.emitter.emit('message', channel)
        }
    }
}
