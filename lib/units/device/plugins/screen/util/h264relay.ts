//
// Fans the scrcpy H.264 stream out to the screen WebSocket clients.
//
// A decoder can only start on a key frame, and only skip whole groups of
// pictures. So:
//   - a client that joins mid-stream gets the session and config packets and
//     the packets since the last key frame;
//   - a client whose socket backs up stops receiving until the next key frame,
//     instead of queueing a growing delay.
//
import type {ScrcpyStreamItem} from '../../../resources/util/scrcpy-stream.js'

export interface RelayClient {
    send(data: Buffer): unknown
    bufferedAmount(): number
}

interface ClientState {
    client: RelayClient
    // Decodes the current group of pictures: may receive its next delta frame
    synced: boolean
}

// Bytes queued on a socket past which the client waits for the next key frame
const DEFAULT_MAX_BUFFERED = 2 * 1024 * 1024
// Packets kept for joining clients; past it they wait for the next key frame
const MAX_GOP_PACKETS = 600

export class H264Relay {
    private session: Buffer | null = null
    private config: Buffer | null = null
    private gop: Buffer[] = []
    private clients = new Map<string, ClientState>()

    constructor(private maxBuffered = DEFAULT_MAX_BUFFERED) {}

    add(id: string, client: RelayClient) {
        const state: ClientState = {client, synced: false}
        this.clients.set(id, state)

        if (this.session) {
            client.send(this.session)
        }
        if (this.config) {
            client.send(this.config)
        }
        if (this.gop.length) {
            for (const packet of this.gop) {
                client.send(packet)
            }
            state.synced = true
        }
    }

    remove(id: string) {
        this.clients.delete(id)
    }

    // The producer stopped: the next stream starts from scratch
    reset() {
        this.session = null
        this.config = null
        this.gop = []
        for (const state of this.clients.values()) {
            state.synced = false
        }
    }

    push(item: ScrcpyStreamItem) {
        switch (item.type) {
        case 'session':
            // A new capture session (rotation, resize) restarts with config + key frame
            this.session = item.raw
            this.config = null
            this.gop = []
            for (const state of this.clients.values()) {
                state.synced = false
                state.client.send(item.raw)
            }
            break
        case 'packet':
            if (item.config) {
                this.config = item.raw
                for (const state of this.clients.values()) {
                    state.client.send(item.raw)
                }
            }
            else if (item.keyFrame) {
                this.gop = [item.raw]
                for (const state of this.clients.values()) {
                    if (state.client.bufferedAmount() > this.maxBuffered) {
                        state.synced = false
                        continue
                    }
                    state.synced = true
                    state.client.send(item.raw)
                }
            }
            else {
                if (this.gop.length) {
                    if (this.gop.length < MAX_GOP_PACKETS) {
                        this.gop.push(item.raw)
                    }
                    else {
                        this.gop = []
                    }
                }
                for (const state of this.clients.values()) {
                    if (!state.synced) {
                        continue
                    }
                    if (state.client.bufferedAmount() > this.maxBuffered) {
                        state.synced = false
                        continue
                    }
                    state.client.send(item.raw)
                }
            }
            break
        }
    }
}
