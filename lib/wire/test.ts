import { Any } from "./google/protobuf/any.ts";
import wire from "./index.ts";
import wireutil from "./util.ts";
import { DeviceIntroductionMessage, DeviceIosIntroductionMessage, DeviceStatus, Envelope, ProviderMessage } from "./wire.ts";
import * as Messages from "./wire.ts";


import { IMessageType, MessageTypeContainer } from "@protobuf-ts/runtime";


// const data = Envelope.create({
//     message: Any.pack({
//         serial: "test",
//         status: DeviceStatus.CONNECTING,
//     }, DeviceIntroductionMessage),
//     channel: undefined
// })

// console.log("Created data: ", data)
// const bin = Envelope.toBinary(data)
// const bin = wireutil.envelope(wire.DeviceIntroductionMessage, "test", wireutil.toDeviceStatus('device'), new wire.ProviderMessage('channel', 'name'))
// console.log("Bin: ", bin)

// const decoded = Envelope.fromBinary(bin)
const bin = Buffer.from(Uint8Array.from([18,104,10,45,116,121,112,101,46,103,111,111,103,108,101,97,112,105,115,46,99,111,109,47,68,101,118,105,99,101,73,110,116,114,111,100,117,99,116,105,111,110,77,101,115,115,97,103,101,18,55,10,11,82,70,56,78,57,49,51,77,51,74,89,16,3,26,38,10,24,56,90,102,111,77,79,67,51,67,48,120,101,98,117,121,81,66,88,113,78,102,65,61,61,18,10,109,45,97,108,122,104,97,110,111,118]))
console.log('bin, %s, %s', bin, typeof bin)
const decoded = Envelope.fromBinary(bin)
console.log("Decoded: ", decoded)

console.log(Any.unpack(decoded.message, DeviceIntroductionMessage))

