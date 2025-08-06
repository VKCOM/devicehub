import EventEmitter from "eventemitter3";
import wire from "./index.js";
import logger from "../util/logger.js";

const log = logger.createLogger("wire:router");

// Тип сообщения Wire
export interface WireMessage {
    $code: string;
}

// Тип события: либо строка, либо символ, либо WireMessage
type EventType = string | symbol | WireMessage;

export class WireRouter extends EventEmitter {
    constructor() {
        super();
    }

    on(
        event: string | symbol,
        fn: (...args: any[]) => void,
        context?: any
    ): this;
    on(message: WireMessage, fn: (...args: any[]) => void): this;
    on(
        eventOrMessage: EventType,
        fn: (...args: any[]) => void,
        context?: any
    ): this {
        if (
            typeof eventOrMessage !== "string" &&
            typeof eventOrMessage !== "symbol" &&
            "$code" in eventOrMessage
        ) {
            // WireMessage
            super.on(eventOrMessage.$code, fn);
        } else {
            super.on(eventOrMessage as string | symbol, fn, context);
        }
        return this;
    }

    removeListener(
        event: string | symbol,
        fn: (...args: any[]) => void,
        context?: any
    ): this;
    removeListener(message: WireMessage, fn: (...args: any[]) => void): this;
    removeListener(
        eventOrMessage: EventType,
        fn: (...args: any[]) => void,
        context?: any
    ): this {
        if (typeof eventOrMessage === "object" && "$code" in eventOrMessage) {
            super.removeListener(eventOrMessage.$code, fn);
        } else {
            super.removeListener(
                eventOrMessage as string | symbol,
                fn,
                context
            );
        }
        return this;
    }

    handler(): (channel: any, data: Uint8Array) => void {
        return (channel: any, data: Uint8Array) => {
            const wrapper = wire.Envelope.decode(data);
            const type = wire.ReverseMessageType[wrapper.type];
            let decodedMessage: any;

            try {
                decodedMessage = wire[type].decode(wrapper.message);
            } catch (e) {
                log.error(
                    'Received message with type "%s", but cant parse data ' +
                        wrapper.message
                );
                throw e;
            }

            log.info(
                'Received message with type "%s", and data %s',
                type || wrapper.type,
                JSON.stringify(decodedMessage)
            );

            if (type) {
                this.emit(
                    wrapper.type,
                    wrapper.channel || channel,
                    decodedMessage,
                    data
                );
                this.emit("message", channel);
            } else {
                log.warn(
                    'Unknown message type "%d", perhaps we need an update?',
                    wrapper.type
                );
            }
        };
    }
}
