/*
 * Decoder of the scrcpy H.264 screen stream (`--need-scrcpy` on the provider).
 *
 * Each WebSocket message is one scrcpy packet: a 12-byte header, then the
 * payload for a media packet. A session packet (MSB set) carries the new
 * frame size; a media packet carries the config (SPS/PPS) or a frame, in
 * Annex B. The config is sent again with each key frame, as WebCodecs takes
 * an Annex B stream with the parameter sets in band.
 */

export type ScrcpyPacket =
  | { type: 'session'; width: number; height: number }
  | { type: 'media'; config: boolean; keyFrame: boolean; pts: number; payload: Uint8Array }

const HEADER_LENGTH = 12

export const parseScrcpyPacket = (data: ArrayBuffer): ScrcpyPacket | null => {
  if (data.byteLength < HEADER_LENGTH) return null

  const view = new DataView(data)
  const first = view.getUint8(0)

  if (first & 0x80) {
    return { type: 'session', width: view.getUint32(4), height: view.getUint32(8) }
  }

  // The top 3 bits are flags, the other 61 the PTS in microseconds
  const ptsHigh = view.getUint32(0) & 0x1fffffff

  return {
    type: 'media',
    config: (first & 0x40) !== 0,
    keyFrame: (first & 0x20) !== 0,
    pts: ptsHigh * 2 ** 32 + view.getUint32(4),
    payload: new Uint8Array(data, HEADER_LENGTH),
  }
}

/* The WebCodecs codec string ("avc1.PPCCLL") of the SPS in an Annex B config */
export const h264CodecString = (config: Uint8Array): string | null => {
  for (let i = 0; i + 6 < config.length; i++) {
    if (config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 1 && (config[i + 3] & 0x1f) === 7) {
      const hex = (byte: number): string => byte.toString(16).padStart(2, '0')

      return `avc1.${hex(config[i + 4])}${hex(config[i + 5])}${hex(config[i + 6])}`
    }
  }

  return null
}

export class H264ScreenDecoder {
  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined'
  }

  private decoder: VideoDecoder | null = null
  private config: Uint8Array | null = null
  private needsKeyFrame = true

  constructor(
    private readonly onFrame: (frame: VideoFrame) => void,
    private readonly onError: (error: Error) => void
  ) {}

  push(data: ArrayBuffer): void {
    const packet = parseScrcpyPacket(data)

    // A session packet announces a new config and key frame, nothing to do yet
    if (!packet || packet.type === 'session') return

    if (packet.config) {
      this.config = packet.payload.slice()
      this.configure()

      return
    }

    if (packet.keyFrame) {
      if (!this.decoder && !this.configure()) return

      this.needsKeyFrame = false
    } else if (this.needsKeyFrame) {
      return
    }

    const chunkData = packet.keyFrame && this.config ? concat(this.config, packet.payload) : packet.payload

    try {
      this.decoder?.decode(
        new EncodedVideoChunk({ type: packet.keyFrame ? 'key' : 'delta', timestamp: packet.pts, data: chunkData })
      )
    } catch (error) {
      this.fail(error)
    }
  }

  close(): void {
    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close()
    }

    this.decoder = null
    this.needsKeyFrame = true
  }

  // A decoder starts over from a key frame after each configure()
  private configure(): boolean {
    const codec = this.config && h264CodecString(this.config)

    if (!codec) return false

    try {
      if (!this.decoder || this.decoder.state === 'closed') {
        this.decoder = new VideoDecoder({
          output: (frame) => this.onFrame(frame),
          error: (error) => this.fail(error),
        })
      }

      this.decoder.configure({ codec, optimizeForLatency: true })
      this.needsKeyFrame = true

      return true
    } catch (error) {
      this.fail(error)

      return false
    }
  }

  // The next key frame configures a new decoder from the saved config
  private fail(error: unknown): void {
    this.close()
    this.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)

  out.set(a)
  out.set(b, a.length)

  return out
}
