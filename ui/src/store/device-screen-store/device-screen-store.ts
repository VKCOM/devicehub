import { t } from 'i18next'
import { makeAutoObservable, runInAction } from 'mobx'
import { inject, injectable } from 'inversify'
import { backOff } from 'exponential-backoff'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceErrorModalStore } from '@/store/device-error-modal-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'
import { authStore } from '@/store/auth-store'

import type { ElementBoundSize, StartScreenStreamingMessage } from './types'
import type { Device } from '@/generated/types'

@injectable()
@deviceConnectionRequired()
export class DeviceScreenStore {
  private websocket: WebSocket | null = null
  private backoffPromise: Promise<void> | null = null
  private disposed = false

  private context: ImageBitmapRenderingContext | null = null
  private canvasWrapper: HTMLDivElement | null = null
  private device: Device | null = null
  private showScreen = true
  private options = {
    autoScaleForRetina: true,
    density: Math.max(1, Math.min(1.5, devicePixelRatio || 1)),
    minScale: 0.36,
  }
  private adjustedBoundSize = {
    width: 0,
    height: 0,
  }
  private screenRotation = 0
  private isScreenStreamingJustStarted = false

  isAspectRatioModeLetterbox = false
  isScreenLoading = false
  isScreenRotated = false

  constructor(@inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore) {
    this.updateBounds = this.updateBounds.bind(this)
    this.messageListener = this.messageListener.bind(this)

    makeAutoObservable(this)
  }

  get getDevice(): Device | null {
    return this.device
  }

  get getCanvasWrapper(): HTMLDivElement | null {
    return this.canvasWrapper
  }

  get getScreenRotation(): number {
    return this.screenRotation
  }

  setIsScreenLoading(value: boolean): void {
    this.isScreenLoading = value
  }

  async init(): Promise<void> {
    this.device = await this.deviceBySerialStore.fetch()
  }

  async startScreenStreaming(canvas: HTMLCanvasElement, canvasWrapper: HTMLDivElement): Promise<void> {
    runInAction(() => {
      this.setIsScreenLoading(true)
    })

    if (this.disposed) {
      this.disposed = false

      return
    }

    this.context = canvas.getContext('bitmaprenderer')
    this.canvasWrapper = canvasWrapper

    this.connectWithBackoff()
  }

  stopScreenStreaming(): void {
    this.disposed = true
    this.backoffPromise = null

    if (this.websocket) {
      this.websocket.onclose = null
      this.websocket.close()
      this.websocket = null
    }
  }

  updateBounds(): void {
    if (!this.canvasWrapper) {
      throw new Error('Unable to read bounds; container must have dimensions')
    }

    const newAdjustedBoundSize = this.getNewAdjustedBoundSize(
      this.canvasWrapper.offsetWidth,
      this.canvasWrapper.offsetHeight
    )

    if (
      !this.adjustedBoundSize ||
      newAdjustedBoundSize.width !== this.adjustedBoundSize.width ||
      newAdjustedBoundSize.height !== this.adjustedBoundSize.height
    ) {
      this.adjustedBoundSize = newAdjustedBoundSize
      this.onScreenInterestAreaChanged()
    }
  }

  determineAspectRatioMode(): void {
    if (this.canvasWrapper && this.context) {
      const canvasAspect = this.context.canvas.width / this.context.canvas.height
      const canvasWrapperAspect = this.canvasWrapper.offsetWidth / this.canvasWrapper.offsetHeight

      this.isAspectRatioModeLetterbox = canvasWrapperAspect < canvasAspect
    }
  }

  private shouldUpdateScreen(): boolean {
    return Boolean(
      this.showScreen &&
        document.visibilityState === 'visible' &&
        this.websocket &&
        this.websocket.readyState === WebSocket.OPEN
    )
  }

  private onScreenInterestGained(): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send('on')
    }
  }

  private onScreenInterestAreaChanged(): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send('size ' + this.adjustedBoundSize.width + 'x' + this.adjustedBoundSize.height)
    }
  }

  private onScreenInterestLost(): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send('off')
    }
  }

  private adjustBoundedSize(width: number, height: number): ElementBoundSize {
    if (!this.device?.display?.width || !this.device?.display?.height) {
      throw new Error('No display width or height')
    }

    const scaledWidth = this.device.display.width * this.options.minScale
    const scaledHeight = this.device.display.height * this.options.minScale

    let sw = width * this.options.density
    let sh = height * this.options.density

    if (sw < scaledWidth) {
      sw *= scaledWidth / sw
      sh *= scaledWidth / sh
    }

    if (sh < scaledHeight) {
      sw *= scaledHeight / sw
      sh *= scaledHeight / sh
    }

    return {
      width: Math.ceil(sw),
      height: Math.ceil(sh),
    }
  }

  private getNewAdjustedBoundSize(width: number, height: number): ElementBoundSize {
    switch (this.screenRotation) {
      case 90:
      case 270:
        return this.adjustBoundedSize(height, width)
      case 0:
      case 180:

      /* falls through */
      default:
        return this.adjustBoundedSize(width, height)
    }
  }

  private isRotated(): boolean {
    return this.screenRotation === 90 || this.screenRotation === 270
  }

  private updateImageArea(imageWidth: number, imageHeight: number): void {
    if (!this.context) {
      throw new Error('Context is not set')
    }

    if (this.options.autoScaleForRetina) {
      this.context.canvas.width = imageWidth * (devicePixelRatio || 1)
      this.context.canvas.height = imageHeight * (devicePixelRatio || 1)
    }

    if (!this.options.autoScaleForRetina) {
      this.context.canvas.width = imageWidth
      this.context.canvas.height = imageHeight
    }

    const isRotated = this.isRotated()

    if (isRotated) {
      this.isScreenRotated = true
    }

    if (!isRotated) {
      this.isScreenRotated = false
    }

    this.determineAspectRatioMode()
  }

  private connectWebsocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.device?.display?.url) {
        reject(new Error('No display url'))

        return
      }

      if (!authStore.jwt) {
        reject(new Error('Authentication token required'))

        return
      }

      const ws = new WebSocket(this.device.display.url, `access_token.${authStore.jwt}`)

      ws.binaryType = 'blob'

      ws.onopen = () => {
        this.websocket = ws
        ws.onmessage = this.messageListener.bind(this)
        ws.onerror = () => {}
        ws.onclose = this.handleUnexpectedClose.bind(this)

        this.isScreenStreamingJustStarted = true
        resolve()
      }

      ws.onerror = () => {}

      ws.onclose = (event: CloseEvent) => {
        if (event.code === 1008) {
          reject(new AuthError())

          return
        }

        reject(new Error(`WebSocket closed before opening: ${event.code}`))
      }
    })
  }

  private connectWithBackoff(): Promise<void> {
    if (this.backoffPromise) return this.backoffPromise

    this.backoffPromise = backOff(() => this.connectWebsocket(), {
      numOfAttempts: 8,
      startingDelay: 1000,
      maxDelay: 16000,
      jitter: 'full',
      retry: (err) => {
        if (this.disposed) return false
        if (err instanceof AuthError) return false

        return true
      },
    })
      .catch((err) => {
        if (this.disposed) return

        runInAction(() => {
          if (err instanceof AuthError) {
            deviceErrorModalStore.setError(t('Unauthorized'))
          } else {
            deviceErrorModalStore.setError(t('Service is currently unavailable'))
          }
        })
      })
      .finally(() => {
        this.backoffPromise = null
      })

    return this.backoffPromise
  }

  private handleUnexpectedClose(event: CloseEvent): void {
    this.websocket = null

    runInAction(() => {
      this.setIsScreenLoading(true)
    })

    if (event.code === 1008) {
      deviceErrorModalStore.setError(t('Unauthorized'))

      return
    }

    if (!event.wasClean && !this.disposed) {
      this.connectWithBackoff()
    }
  }

  private messageListener(message: MessageEvent<Blob | string>): void {
    if (message.data instanceof Blob) {
      createImageBitmap(message.data).then((image) => {
        if (!this.context) {
          throw new Error('Context is not set')
        }

        if (this.isScreenStreamingJustStarted) {
          this.updateImageArea(image.width, image.height)

          this.setIsScreenLoading(false)
          this.isScreenStreamingJustStarted = false
        }

        this.context.transferFromImageBitmap(image)
      })

      return
    }

    if (message.data === 'secure_on') {
      return
    }

    if (typeof message.data === 'string') {
      try {
        const authMessage = JSON.parse(message.data)

        if (authMessage.type === 'auth_success') {
          console.info('WebSocket authentication successful')

          if (this.shouldUpdateScreen()) {
            this.updateBounds()
            this.onScreenInterestGained()

            return
          }

          this.onScreenInterestLost()

          return
        }

        if (authMessage.type === 'auth_error') {
          console.error('WebSocket authentication failed:', authMessage.message)

          return
        }
      } catch {
        /* empty */
      }
    }

    const startRegex = /^start /

    if (startRegex.test(message.data)) {
      const startData: StartScreenStreamingMessage = JSON.parse(message.data.replace(startRegex, ''))

      this.isScreenStreamingJustStarted = true

      this.screenRotation = startData.orientation
    }
  }
}

class AuthError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AuthError'
  }
}
