import net from 'node:net'

/*
 * Just enough of the adbd side of the ADB transport protocol for a real ADB
 * server to accept `adb connect` to it:
 *   - 'device' mode answers CNXN, so the device shows up as `device`;
 *   - 'unauthorized' mode asks for AUTH and never accepts a key, like a device
 *     whose user has not confirmed the RSA prompt.
 * Streams (shell:, etc.) are refused, so health checks fail fast instead of hanging.
 */

const A_CNXN = 0x4e584e43
const A_AUTH = 0x48545541
const A_OPEN = 0x4e45504f
const A_CLSE = 0x45534c43

const AUTH_TOKEN = 1
const AUTH_SIGNATURE = 2

const VERSION = 0x01000001
const MAX_DATA = 256 * 1024

const BANNER = 'device::ro.product.name=fake;ro.product.model=fake;ro.product.device=fake;features=cmd,shell_v2\0'

const packet = (command: number, arg0: number, arg1: number, data = Buffer.alloc(0)) => {
    const header = Buffer.alloc(24)
    let checksum = 0
    for (const byte of data) {
        checksum = (checksum + byte) >>> 0
    }
    header.writeUInt32LE(command, 0)
    header.writeUInt32LE(arg0, 4)
    header.writeUInt32LE(arg1, 8)
    header.writeUInt32LE(data.length, 12)
    header.writeUInt32LE(checksum, 16)
    header.writeUInt32LE((command ^ 0xffffffff) >>> 0, 20)
    return Buffer.concat([header, data])
}

export class FakeAdbd {
    private server = net.createServer(socket => this.accept(socket))
    private sockets = new Set<net.Socket>()
    port = 0

    constructor(
        private mode: 'device' | 'unauthorized' = 'device',
        readonly host = '127.0.0.1'
    ) {}

    async start(): Promise<number> {
        await new Promise<void>((resolve, reject) => {
            this.server.once('error', reject)
            this.server.listen(0, this.host, resolve)
        })
        this.port = (this.server.address() as net.AddressInfo).port
        return this.port
    }

    /* Drops every connection, as a device that lost its network would */
    async stop(): Promise<void> {
        for (const socket of this.sockets) {
            socket.destroy()
        }
        await new Promise<void>(resolve => this.server.close(() => resolve()))
    }

    private accept(socket: net.Socket) {
        this.sockets.add(socket)
        socket.on('close', () => this.sockets.delete(socket))
        socket.on('error', () => {})

        let buffer = Buffer.alloc(0)
        socket.on('data', data => {
            buffer = Buffer.concat([buffer, data])
            while (buffer.length >= 24) {
                const length = buffer.readUInt32LE(12)
                if (buffer.length < 24 + length) {
                    return
                }

                const command = buffer.readUInt32LE(0)
                const arg0 = buffer.readUInt32LE(4)
                buffer = buffer.subarray(24 + length)

                this.handle(socket, command, arg0)
            }
        })
    }

    private handle(socket: net.Socket, command: number, arg0: number) {
        if (this.mode === 'unauthorized') {
            // Reject every signature; the public key (AUTH_RSAPUBLICKEY) stays unanswered
            if (command === A_CNXN || (command === A_AUTH && arg0 === AUTH_SIGNATURE)) {
                socket.write(packet(A_AUTH, AUTH_TOKEN, 0, Buffer.alloc(20, 7)))
            }
            return
        }

        if (command === A_CNXN) {
            socket.write(packet(A_CNXN, VERSION, MAX_DATA, Buffer.from(BANNER)))
        }
        else if (command === A_OPEN) {
            socket.write(packet(A_CLSE, 0, arg0))
        }
    }
}
