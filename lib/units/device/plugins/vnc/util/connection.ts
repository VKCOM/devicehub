import util from 'util'
import os from 'os'
import crypto from 'crypto'
import EventEmitter from 'events'
import { Socket } from 'net'
import PixelFormat from './pixelformat.js'
import logger from '../../../../../util/logger.js'

const _logger = logger.createLogger('vnc:connection')
const debug = _logger.debug.bind(_logger)

interface SecurityMethod {
  type: number
  challenge?: Buffer
  auth: (data: AuthData) => Promise<void>
}

interface VncConnectionOptions {
  width: number
  height: number
  name: string
  challenge?: Buffer
  security?: SecurityMethod[]
}

interface AuthData {
  response: Buffer
}

interface Rectangle {
  xPosition: number
  yPosition: number
  width: number
  height: number
  encodingType: number
  data?: Buffer
}

interface FbUpdateRequest {
  incremental: number
  xPosition: number
  yPosition: number
  width: number
  height: number
}

interface PointerEvent {
  buttonMask: number
  xPosition: number
  yPosition: number
}

class VncConnection extends EventEmitter {
  // Version constants
  static readonly V3_003 = 3003
  static readonly V3_007 = 3007
  static readonly V3_008 = 3008

  // Security constants
  static readonly SECURITY_NONE = 1
  static readonly SECURITY_VNC = 2

  // Security result constants
  static readonly SECURITYRESULT_OK = 0
  static readonly SECURITYRESULT_FAIL = 1

  // Client message constants
  static readonly CLIENT_MESSAGE_SETPIXELFORMAT = 0
  static readonly CLIENT_MESSAGE_SETENCODINGS = 2
  static readonly CLIENT_MESSAGE_FBUPDATEREQUEST = 3
  static readonly CLIENT_MESSAGE_KEYEVENT = 4
  static readonly CLIENT_MESSAGE_POINTEREVENT = 5
  static readonly CLIENT_MESSAGE_CLIENTCUTTEXT = 6

  // Server message constants
  static readonly SERVER_MESSAGE_FBUPDATE = 0

  // Encoding constants
  static readonly ENCODING_RAW = 0
  static readonly ENCODING_TIGHT = 7
  static readonly ENCODING_DESKTOPSIZE = -223

  // State constants
  static readonly STATE_NEED_CLIENT_VERSION = 10
  static readonly STATE_NEED_CLIENT_SECURITY = 20
  static readonly STATE_NEED_CLIENT_INIT = 30
  static readonly STATE_NEED_CLIENT_VNC_AUTH = 31
  static readonly STATE_NEED_CLIENT_MESSAGE = 40
  static readonly STATE_NEED_CLIENT_MESSAGE_SETPIXELFORMAT = 50
  static readonly STATE_NEED_CLIENT_MESSAGE_SETENCODINGS = 60
  static readonly STATE_NEED_CLIENT_MESSAGE_SETENCODINGS_VALUE = 61
  static readonly STATE_NEED_CLIENT_MESSAGE_FBUPDATEREQUEST = 70
  static readonly STATE_NEED_CLIENT_MESSAGE_KEYEVENT = 80
  static readonly STATE_NEED_CLIENT_MESSAGE_POINTEREVENT = 90
  static readonly STATE_NEED_CLIENT_MESSAGE_CLIENTCUTTEXT = 100
  static readonly STATE_NEED_CLIENT_MESSAGE_CLIENTCUTTEXT_VALUE = 101

  options: VncConnectionOptions
  conn: Socket
  private _buffer: Buffer | null
  private _state: number
  private _serverVersion: number
  private _serverSupportedSecurity: SecurityMethod[]
  private _serverSupportedSecurityByType: Record<number, SecurityMethod>
  private _serverWidth: number
  private _serverHeight: number
  private _serverPixelFormat: PixelFormat
  private _serverName: string
  private _clientVersion: number | null
  private _clientSecurity?: number
  private _clientShare: number
  private _clientPixelFormat: PixelFormat
  private _clientEncodingCount: number
  private _clientEncodings: number[]
  private _clientCutTextLength: number
  private _authChallenge: Buffer
  private _blockingOps: Array<Promise<void>>

  constructor(conn: Socket, options: VncConnectionOptions) {
    super()
    this.options = options
    this._buffer = null
    this._state = 0
    this._changeState(VncConnection.STATE_NEED_CLIENT_VERSION)
    this._serverVersion = VncConnection.V3_008

    // If no security is provided, default to accepting both SECURITY_VNC and SECURITY_NONE
    // with an auth handler that always succeeds (accepts any password)
    // IMPORTANT: SECURITY_VNC must be FIRST because RFB 3.003 clients (like macOS Screen Sharing)
    // only use the first security type in the array (no negotiation), and macOS requires VNC auth
    if (!this.options.security || this.options.security.length === 0) {
      this._serverSupportedSecurity = [
        {
          type: VncConnection.SECURITY_VNC,
          challenge: crypto.randomBytes(16),
          auth: async () => {
            /* Accept any password - no verification */
            debug('VNC auth: accepting any password (no security configured)')
          }
        },
        {
          type: VncConnection.SECURITY_NONE,
          auth: async () => { /* No authentication needed */ }
        }
      ]
    } else {
      this._serverSupportedSecurity = this.options.security
    }

    this._serverSupportedSecurityByType = this._serverSupportedSecurity.reduce(
      (map: Record<number, SecurityMethod>, method: SecurityMethod) => {
        map[method.type] = method
        return map
      },
      Object.create(null)
    )
    this._serverWidth = this.options.width
    this._serverHeight = this.options.height
    this._serverPixelFormat = new PixelFormat({
      bitsPerPixel: 32,
      depth: 24,
      bigEndianFlag: os.endianness() === 'BE' ? 1 : 0,
      trueColorFlag: 1,
      redMax: 255,
      greenMax: 255,
      blueMax: 255,
      redShift: 16,
      greenShift: 8,
      blueShift: 0
    })
    this._serverName = this.options.name
    this._clientVersion = null
    this._clientShare = 0
    this._clientPixelFormat = this._serverPixelFormat
    this._clientEncodingCount = 0
    this._clientEncodings = []
    this._clientCutTextLength = 0
    this._authChallenge = this.options.challenge || crypto.randomBytes(16)
    this.conn = conn
      .on('error', this._errorListener)
      .on('readable', this._readableListener)
      .on('end', this._endListener)
      .on('close', this._closeListener)
    this._blockingOps = []
    this._writeServerVersion()
    this._read()
  }

  end(): void {
    if (!this.conn.destroyed) {
      this.conn.end()
    }
  }

  updateDimensions(width: number, height: number): void {
    debug(`Updating server dimensions from ${this._serverWidth}x${this._serverHeight} to ${width}x${height}`)
    this._serverWidth = width
    this._serverHeight = height
  }

  writeFramebufferUpdate(rectangles: Rectangle[]): void {
    const chunk = Buffer.alloc(4)
    chunk[0] = VncConnection.SERVER_MESSAGE_FBUPDATE
    chunk[1] = 0
    chunk.writeUInt16BE(rectangles.length, 2)
    this._write(chunk)
    rectangles.forEach((rect: any) => {
      const rchunk = Buffer.alloc(12)
      rchunk.writeUInt16BE(rect.xPosition, 0)
      rchunk.writeUInt16BE(rect.yPosition, 2)
      rchunk.writeUInt16BE(rect.width, 4)
      rchunk.writeUInt16BE(rect.height, 6)
      rchunk.writeInt32BE(rect.encodingType, 8)
      this._write(rchunk)
      switch (rect.encodingType) {
        case VncConnection.ENCODING_RAW:
          if (rect.data) {
            this._write(rect.data)
          }
          break
        case VncConnection.ENCODING_TIGHT:
          // Tight encoding with JPEG compression
          if (rect.jpegData) {
            // Compression control byte (0x90 = JPEG compression)
            const compressionControl = Buffer.alloc(1)
            compressionControl[0] = rect.compressionControl || 0x90
            this._write(compressionControl)

            // Write JPEG data length in compact representation
            const jpegLength = rect.jpegData.length
            const lengthBuf = this._encodeCompactLength(jpegLength)
            this._write(lengthBuf)

            // Write JPEG data
            this._write(rect.jpegData)
          }
          break
        case VncConnection.ENCODING_DESKTOPSIZE:
          this._serverWidth = rect.width
          this._serverHeight = rect.height
          break
        default:
          throw new Error(util.format('Unsupported encoding type', rect.encodingType))
      }
    })
  }

  private _encodeCompactLength(length: number): Buffer {
    // Tight encoding uses compact length representation
    // 0-127: 1 byte
    // 128-16383: 2 bytes
    // 16384+: 3 bytes
    if (length < 128) {
      const buf = Buffer.alloc(1)
      buf[0] = length
      return buf
    } else if (length < 16384) {
      const buf = Buffer.alloc(2)
      buf[0] = (length & 0x7F) | 0x80
      buf[1] = (length >> 7) & 0xFF
      return buf
    } else {
      const buf = Buffer.alloc(3)
      buf[0] = (length & 0x7F) | 0x80
      buf[1] = ((length >> 7) & 0x7F) | 0x80
      buf[2] = (length >> 14) & 0xFF
      return buf
    }
  }

  private _error(err: Error): void {
    this.emit('error', err)
    if (!this.conn.destroyed) {
      this.end()
    }
  }

  private _errorListener = (err: Error): void => {
    this._error(err)
  }

  private _endListener = (): void => {
    this.emit('end')
  }

  private _closeListener = (): void => {
    this.emit('close')
  }

  private _writeServerVersion(): void {
    switch (this._serverVersion) {
      case VncConnection.V3_003:
        this._write(Buffer.from('RFB 003.003\n'))
        break
      case VncConnection.V3_007:
        this._write(Buffer.from('RFB 003.007\n'))
        break
      case VncConnection.V3_008:
        this._write(Buffer.from('RFB 003.008\n'))
        break
    }
  }

  private _writeSupportedSecurity(): void {
    const chunk = Buffer.alloc(1 + this._serverSupportedSecurity.length)
    chunk[0] = this._serverSupportedSecurity.length
    this._serverSupportedSecurity.forEach((security, i) => {
      chunk[1 + i] = security.type
    })
    this._write(chunk)
  }

  private _writeSupportedSecurityV3_003(): void {
    // RFB 3.003: Server sends 4-byte UINT32 with security type (no negotiation)
    const chunk = Buffer.alloc(4)
    const secType = this._serverSupportedSecurity.length > 0
      ? this._serverSupportedSecurity[0].type
      : VncConnection.SECURITY_NONE
    chunk.writeUInt32BE(secType, 0)
    this._write(chunk)
  }

  private _writeSecurityResult(result: number, reason?: string): void {
    let chunk: Buffer
    switch (result) {
      case VncConnection.SECURITYRESULT_OK:
        chunk = Buffer.alloc(4)
        chunk.writeUInt32BE(result, 0)
        this._write(chunk)
        break
      case VncConnection.SECURITYRESULT_FAIL:
        if (!reason) {
          reason = 'Unknown error'
        }
        chunk = Buffer.alloc(4 + 4 + reason.length)
        chunk.writeUInt32BE(result, 0)
        chunk.writeUInt32BE(reason.length, 4)
        chunk.write(reason, 8, reason.length)
        this._write(chunk)
        break
    }
  }

  private _writeServerInit(): void {
    debug('server pixel format %s', this._serverPixelFormat)
    debug(`ServerInit: ${this._serverWidth}x${this._serverHeight}, name=${this._serverName}`)
    const chunk = Buffer.alloc(2 + 2 + 16 + 4 + this._serverName.length)
    chunk.writeUInt16BE(this._serverWidth, 0)
    chunk.writeUInt16BE(this._serverHeight, 2)
    chunk[4] = this._serverPixelFormat.bitsPerPixel
    chunk[5] = this._serverPixelFormat.depth
    chunk[6] = this._serverPixelFormat.bigEndianFlag
    chunk[7] = this._serverPixelFormat.trueColorFlag
    chunk.writeUInt16BE(this._serverPixelFormat.redMax, 8)
    chunk.writeUInt16BE(this._serverPixelFormat.greenMax, 10)
    chunk.writeUInt16BE(this._serverPixelFormat.blueMax, 12)
    chunk[14] = this._serverPixelFormat.redShift
    chunk[15] = this._serverPixelFormat.greenShift
    chunk[16] = this._serverPixelFormat.blueShift
    chunk[17] = 0 // padding
    chunk[18] = 0 // padding
    chunk[19] = 0 // padding
    chunk.writeUInt32BE(this._serverName.length, 20)
    chunk.write(this._serverName, 24, this._serverName.length)
    this._write(chunk)
  }

  private _writeVncAuthChallenge(): void {
    const vncSec = this._serverSupportedSecurityByType[VncConnection.SECURITY_VNC]
    debug('vnc auth challenge %s', vncSec.challenge)
    if (vncSec.challenge) {
      this._write(vncSec.challenge)
    }
  }

  private _readableListener = (): void => {
    this._read()
  }

  private _read(): void {
    Promise.all(this._blockingOps)
      .then(() => this._unguardedRead())
      .catch((err) => {
        debug('_read() promise rejected: %s', err?.message || err)
      })
  }

  private _auth(type: number, data: AuthData): void {
    const security = this._serverSupportedSecurityByType[type]
    const success = () => {
      this._changeState(VncConnection.STATE_NEED_CLIENT_INIT)
      // RFB 3.003 spec says not to send security result, but many clients (especially macOS Screen Sharing)
      // expect it anyway. Send it for compatibility.
      this._writeSecurityResult(VncConnection.SECURITYRESULT_OK)
      debug('VNC authenticated successfully')
      this.emit('authenticated')
      // Don't call _read() here - let the promise completion trigger it
    }

    if (!security) {
      success()
      // Manually trigger read after synchronous success
      this._read()
      return
    }

    const authPromise = security
      .auth(data)
      .then(() => {
        success()
      })
      .catch((err) => {
        debug('auth failed: %s', err?.message || err)
        // Send security result for compatibility (see success case)
        this._writeSecurityResult(
          VncConnection.SECURITYRESULT_FAIL,
          'Authentication failure'
        )
        this.end()
      })
      .finally(() => {
        // Remove this promise from blocking ops after completion
        const index = this._blockingOps.indexOf(authPromise)
        if (index > -1) {
          this._blockingOps.splice(index, 1)
        }
        // Trigger next read cycle after auth completes
        // Use setImmediate to break out of the promise context
        setImmediate(() => {
          this._read()
        })
      })

    this._blockingOps.push(authPromise)
  }

  private _unguardedRead(): void {
    let chunk: Buffer | null
    let lo: number
    let hi: number
    while (this._append(this.conn.read())) {
      do {
        chunk = null
        switch (this._state) {
          case VncConnection.STATE_NEED_CLIENT_VERSION:
            if ((chunk = this._consume(12))) {
              const parsedVersion = this._parseVersion(chunk)
              if (parsedVersion === null) {
                debug('ERROR: Invalid client version string: %s', chunk.toString())
                this.end()
                return
              }
              this._clientVersion = parsedVersion
              const versionString = parsedVersion === VncConnection.V3_003 ? '3.003' :
                                   parsedVersion === VncConnection.V3_007 ? '3.007' : '3.008'
              debug(`Client version: RFB ${versionString} (${parsedVersion})`)

              // RFB 3.003 uses a different security handshake than 3.007/3.008
              if (this._clientVersion === VncConnection.V3_003) {
                this._writeSupportedSecurityV3_003()
                // For 3.003, no client selection - move based on security type
                if (this._serverSupportedSecurity.length === 0) {
                  this._error(new Error('No security methods available'))
                  return
                }
                const secType = this._serverSupportedSecurity[0].type
                this._clientSecurity = secType

                if (secType === VncConnection.SECURITY_NONE) {
                  this._changeState(VncConnection.STATE_NEED_CLIENT_INIT)
                  this.emit('authenticated')
                } else if (secType === VncConnection.SECURITY_VNC) {
                  this._writeVncAuthChallenge()
                  this._changeState(VncConnection.STATE_NEED_CLIENT_VNC_AUTH)
                } else {
                  this._error(new Error('Unsupported security type for RFB 3.003'))
                  return
                }
              } else {
                // RFB 3.007 and 3.008
                this._writeSupportedSecurity()
                this._changeState(VncConnection.STATE_NEED_CLIENT_SECURITY)
              }
            }
            break
          case VncConnection.STATE_NEED_CLIENT_SECURITY:
            if ((chunk = this._consume(1))) {
              const parsedSecurity = this._parseSecurity(chunk)
              if (parsedSecurity === null) {
                this._writeSecurityResult(
                  VncConnection.SECURITYRESULT_FAIL,
                  'Unimplemented security type'
                )
                this.end()
                return
              }
              this._clientSecurity = parsedSecurity
              debug('client security %s', this._clientSecurity)
              if (!(this._clientSecurity in this._serverSupportedSecurityByType)) {
                this._writeSecurityResult(
                  VncConnection.SECURITYRESULT_FAIL,
                  'Unsupported security type'
                )
                this.end()
                return
              }
              switch (this._clientSecurity) {
                case VncConnection.SECURITY_NONE:
                  this._changeState(VncConnection.STATE_NEED_CLIENT_INIT)
                  // RFB 3.007/3.008 send security result, 3.003 doesn't (but won't reach here)
                  if (this._clientVersion !== VncConnection.V3_003) {
                    this._writeSecurityResult(VncConnection.SECURITYRESULT_OK)
                  }
                  this.emit('authenticated')
                  return
                case VncConnection.SECURITY_VNC:
                  this._writeVncAuthChallenge()
                  this._changeState(VncConnection.STATE_NEED_CLIENT_VNC_AUTH)
                  break
              }
            }
            break
          case VncConnection.STATE_NEED_CLIENT_VNC_AUTH:
            if ((chunk = this._consume(16))) {
              this._auth(VncConnection.SECURITY_VNC, {
                response: chunk
              })
              return
            }
            break
          case VncConnection.STATE_NEED_CLIENT_INIT:
            if ((chunk = this._consume(1))) {
              this._clientShare = chunk[0]
              debug('client shareFlag %s', this._clientShare)
              this._writeServerInit()
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE:
            if ((chunk = this._consume(1))) {
              const messageType = chunk[0]
              // debug(`Client message type: ${messageType}`)
              switch (messageType) {
                case VncConnection.CLIENT_MESSAGE_SETPIXELFORMAT:
                  this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_SETPIXELFORMAT)
                  break
                case VncConnection.CLIENT_MESSAGE_SETENCODINGS:
                  this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_SETENCODINGS)
                  break
                case VncConnection.CLIENT_MESSAGE_FBUPDATEREQUEST:
                  this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_FBUPDATEREQUEST)
                  break
                case VncConnection.CLIENT_MESSAGE_KEYEVENT:
                  this.emit('userActivity')
                  this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_KEYEVENT)
                  break
                case VncConnection.CLIENT_MESSAGE_POINTEREVENT:
                  this.emit('userActivity')
                  this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_POINTEREVENT)
                  break
                case VncConnection.CLIENT_MESSAGE_CLIENTCUTTEXT:
                  this.emit('userActivity')
                  this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_CLIENTCUTTEXT)
                  break
                default:
                  this._error(new Error(util.format('Unsupported message type %d', messageType)))
                  return
              }
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_SETPIXELFORMAT:
            if ((chunk = this._consume(19))) {
              // [0b, 3b) padding
              this._clientPixelFormat = new PixelFormat({
                bitsPerPixel: chunk[3],
                depth: chunk[4],
                bigEndianFlag: chunk[5],
                trueColorFlag: chunk[6],
                redMax: chunk.readUInt16BE(7),
                greenMax: chunk.readUInt16BE(9),
                blueMax: chunk.readUInt16BE(11),
                redShift: chunk[13],
                greenShift: chunk[14],
                blueShift: chunk[15]
              })
              // [16b, 19b) padding
              debug('client pixel format %s', this._clientPixelFormat)
              this.emit('formatchange', this._clientPixelFormat)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_SETENCODINGS:
            if ((chunk = this._consume(3))) {
              // [0b, 1b) padding
              this._clientEncodingCount = chunk.readUInt16BE(1)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_SETENCODINGS_VALUE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_SETENCODINGS_VALUE:
            lo = 0
            hi = 4 * this._clientEncodingCount
            if ((chunk = this._consume(hi))) {
              this._clientEncodings = []
              while (lo < hi) {
                this._clientEncodings.push(chunk.readInt32BE(lo))
                lo += 4
              }
              debug('client encodings %s', this._clientEncodings)
              this.emit('encodings', this._clientEncodings)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_FBUPDATEREQUEST:
            if ((chunk = this._consume(9))) {
              this.emit('fbupdaterequest', {
                incremental: chunk[0],
                xPosition: chunk.readUInt16BE(1),
                yPosition: chunk.readUInt16BE(3),
                width: chunk.readUInt16BE(5),
                height: chunk.readUInt16BE(7)
              } as FbUpdateRequest)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_KEYEVENT:
            if ((chunk = this._consume(7))) {
              // downFlag = chunk[0]
              // [1b, 3b) padding
              // key = chunk.readUInt32BE(3)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_POINTEREVENT:
            if ((chunk = this._consume(5))) {
              const buttonMask = chunk[0]
              const xPixel = chunk.readUInt16BE(1)
              const yPixel = chunk.readUInt16BE(3)

              // Prevent division by zero - if dimensions are not set, use pixel coordinates as normalized (assuming 0-1 range)
              if (this._serverWidth === 0 || this._serverHeight === 0) {
                debug(`WARNING: Server dimensions not set (${this._serverWidth}x${this._serverHeight}), cannot normalize pointer coordinates`)
                this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
                break
              }

              const xNorm = xPixel / this._serverWidth
              const yNorm = yPixel / this._serverHeight

              debug(`Pointer event received: button=${buttonMask}, x=${xPixel}/${this._serverWidth}=${xNorm.toFixed(3)}, y=${yPixel}/${this._serverHeight}=${yNorm.toFixed(3)}`)

              this.emit('pointer', {
                buttonMask: buttonMask,
                xPosition: xNorm,
                yPosition: yNorm
              } as PointerEvent)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_CLIENTCUTTEXT:
            if ((chunk = this._consume(7))) {
              // [0b, 3b) padding
              this._clientCutTextLength = chunk.readUInt32BE(3)
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE_CLIENTCUTTEXT_VALUE)
            }
            break
          case VncConnection.STATE_NEED_CLIENT_MESSAGE_CLIENTCUTTEXT_VALUE:
            if ((chunk = this._consume(this._clientCutTextLength))) {
              // value = chunk
              this._changeState(VncConnection.STATE_NEED_CLIENT_MESSAGE)
            }
            break
          default:
            throw new Error(util.format('Impossible state %d', this._state))
        }
      } while (chunk)
    }
  }

  private _parseVersion(chunk: Buffer): number | null {
    if (chunk.equals(Buffer.from('RFB 003.008\n'))) {
      return VncConnection.V3_008
    }
    if (chunk.equals(Buffer.from('RFB 003.007\n'))) {
      return VncConnection.V3_007
    }
    if (chunk.equals(Buffer.from('RFB 003.003\n'))) {
      return VncConnection.V3_003
    }
    return null
  }

  private _parseSecurity(chunk: Buffer): number | null {
    switch (chunk[0]) {
      case VncConnection.SECURITY_NONE:
      case VncConnection.SECURITY_VNC:
        return chunk[0]
      default:
        return null
    }
  }

  private _changeState(state: number): void {
    this._state = state
  }

  private _append(chunk: Buffer | null): boolean {
    if (!chunk) {
      return false
    }
    // debug('in %s', chunk)
    if (this._buffer) {
      this._buffer = Buffer.concat([this._buffer, chunk], this._buffer.length + chunk.length)
    } else {
      this._buffer = chunk
    }
    return true
  }

  private _consume(n: number): Buffer | null {
    let chunk: Buffer
    if (!this._buffer) {
      return null
    }
    if (n < this._buffer.length) {
      chunk = this._buffer.slice(0, n)
      this._buffer = this._buffer.slice(n)
      return chunk
    }
    if (n === this._buffer.length) {
      chunk = this._buffer
      this._buffer = null
      return chunk
    }
    return null
  }

  private _write(chunk: Buffer): void {
    try {
      if (!this.conn.destroyed && this.conn.writable) {
        this.conn.write(chunk)
      }
    } catch (err: any) {
      // Ignore EPIPE and ECONNRESET errors - client disconnected
      if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
        debug(`Write error: ${err?.message || err}`)
        throw err
      }
    }
  }
}

export default VncConnection

