import { H264ScreenDecoder, h264CodecString, parseScrcpyPacket } from './h264-screen-decoder'

// scrcpy 5 wire format: 12-byte header, then the payload of a media packet
const session = (width: number, height: number): ArrayBuffer => {
  const view = new DataView(new ArrayBuffer(12))

  view.setUint32(0, 0x80000000)
  view.setUint32(4, width)
  view.setUint32(8, height)

  return view.buffer
}

const media = (payload: number[], { config = false, keyFrame = false, pts = 0 } = {}): ArrayBuffer => {
  const view = new DataView(new ArrayBuffer(12 + payload.length))

  view.setUint32(0, (config ? 0x40000000 : 0) | (keyFrame ? 0x20000000 : 0))
  view.setUint32(4, pts)
  view.setUint32(8, payload.length)
  new Uint8Array(view.buffer).set(payload, 12)

  return view.buffer
}

// Annex B SPS (Constrained Baseline, level 3.1) and PPS
const CONFIG = [0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1f, 0xda, 0, 0, 0, 1, 0x68, 0xce]
const KEY = [0, 0, 0, 1, 0x65, 0x88]
const DELTA = [0, 0, 0, 1, 0x41, 0x9a]

class FakeDecoder {
  static instances: FakeDecoder[] = []
  state = 'unconfigured'
  configs: VideoDecoderConfig[] = []
  chunks: Array<{ type: string; data: Uint8Array }> = []

  constructor(readonly init: VideoDecoderInit) {
    FakeDecoder.instances.push(this)
  }

  configure(config: VideoDecoderConfig): void {
    this.state = 'configured'
    this.configs.push(config)
  }

  decode(chunk: { type: string; data: Uint8Array }): void {
    this.chunks.push(chunk)
  }

  close(): void {
    this.state = 'closed'
  }
}

class FakeChunk {
  type: string
  data: Uint8Array

  constructor(init: { type: string; data: Uint8Array }) {
    this.type = init.type
    this.data = init.data
  }
}

describe('parseScrcpyPacket', () => {
  test('reads a session packet', () => {
    expect(parseScrcpyPacket(session(720, 1280))).toEqual({ type: 'session', width: 720, height: 1280 })
  })

  test('reads the flags, PTS and payload of a media packet', () => {
    const packet = parseScrcpyPacket(media(KEY, { keyFrame: true, pts: 40000 }))

    expect(packet).toMatchObject({ type: 'media', config: false, keyFrame: true, pts: 40000 })
    expect(packet?.type === 'media' && Array.from(packet.payload)).toEqual(KEY)
  })
})

describe('h264CodecString', () => {
  test('builds the codec string from the SPS profile, constraints and level', () => {
    expect(h264CodecString(new Uint8Array(CONFIG))).toBe('avc1.42c01f')
  })

  test('returns null without an SPS', () => {
    expect(h264CodecString(new Uint8Array(KEY))).toBeNull()
  })
})

describe('H264ScreenDecoder', () => {
  beforeEach(() => {
    FakeDecoder.instances = []
    vi.stubGlobal('VideoDecoder', FakeDecoder)
    vi.stubGlobal('EncodedVideoChunk', FakeChunk)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const decoder = (): { decoder: H264ScreenDecoder; errors: Error[] } => {
    const errors: Error[] = []

    return {
      decoder: new H264ScreenDecoder(
        () => {},
        (error) => errors.push(error)
      ),
      errors,
    }
  }

  test('configures from the config packet and decodes from the key frame on', () => {
    const { decoder: screen } = decoder()

    screen.push(session(720, 1280))
    screen.push(media(CONFIG, { config: true }))
    screen.push(media(DELTA))
    screen.push(media(KEY, { keyFrame: true }))
    screen.push(media(DELTA))

    const [fake] = FakeDecoder.instances

    expect(fake.configs).toEqual([{ codec: 'avc1.42c01f', optimizeForLatency: true }])
    // The delta before the key frame cannot be decoded
    expect(fake.chunks.map((chunk) => chunk.type)).toEqual(['key', 'delta'])
    // The parameter sets travel in band with the key frame
    expect(Array.from(fake.chunks[0].data)).toEqual([...CONFIG, ...KEY])
    expect(Array.from(fake.chunks[1].data)).toEqual(DELTA)
  })

  test('recovers on the next key frame after a decoder error', () => {
    const { decoder: screen, errors } = decoder()

    screen.push(media(CONFIG, { config: true }))
    screen.push(media(KEY, { keyFrame: true }))
    FakeDecoder.instances[0].init.error(new DOMException('decode failed'))

    screen.push(media(DELTA))
    screen.push(media(KEY, { keyFrame: true }))

    expect(errors).toHaveLength(1)
    expect(FakeDecoder.instances).toHaveLength(2)
    expect(FakeDecoder.instances[1].chunks.map((chunk) => chunk.type)).toEqual(['key'])
  })

  test('waits for a config before decoding', () => {
    const { decoder: screen } = decoder()

    screen.push(media(KEY, { keyFrame: true }))

    expect(FakeDecoder.instances).toHaveLength(0)
  })
})
