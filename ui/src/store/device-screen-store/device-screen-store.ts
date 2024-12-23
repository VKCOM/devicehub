import { makeAutoObservable, runInAction } from 'mobx'

import { deviceBySerialStore } from '@/store/device-by-serial-store'

import type { ElementBoundSize, StartScreenStreamingMessage } from './types'
import type { Device } from '@/generated/types'

export class DeviceScreenStore {
  private readonly websocketReconnectionInterval = 5000 // NOTE: 5s
  private readonly websocketReconnectionMaxAttempts = 3 // NOTE: 5s * 3 -> 15s total delay
  private websocket: WebSocket | null = null
  private websocketReconnecting = false
  private websocketReconnectionAttempt = 0
  private websocketReconnectionTimeoutID: ReturnType<typeof setTimeout> | null = null

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

  isScreenLoading = false
  isScreenRotated = false

  constructor() {
    this.updateBounds = this.updateBounds.bind(this)
    this.messageListener = this.messageListener.bind(this)
    this.openListener = this.openListener.bind(this)

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

  async startScreenStreaming(serial: string, canvas: HTMLCanvasElement, canvasWrapper: HTMLDivElement): Promise<void> {
    runInAction(() => {
      this.setIsScreenLoading(true)
    })

    const device = await deviceBySerialStore.fetch(serial)

    this.device = device
    this.context = canvas.getContext('bitmaprenderer')
    this.canvasWrapper = canvasWrapper

    this.connectWebsocket()
  }

  stopScreenStreaming(): void {
    this.stopWebsocket()
  }

  updateBounds(): void {
    if (!this.canvasWrapper || !this.canvasWrapper.offsetWidth || !this.canvasWrapper.offsetHeight) {
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

  private shouldUpdateScreen(): boolean {
    return Boolean(
      // NO if the user has disabled the screen.
      this.showScreen &&
        // NO if the page is not visible (e.g. background tab).
        document.visibilityState === 'visible' &&
        // NO if we don't have a connection yet.
        this.websocket &&
        this.websocket.readyState === WebSocket.OPEN
      // YES otherwise
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
  }

  private connectWebsocket(): void {
    if (!this.device?.display?.url) {
      throw new Error('No display url')
    }

    this.websocket = new WebSocket(this.device.display.url)

    this.websocket.binaryType = 'blob'
    this.websocket.onopen = this.openListener.bind(this)
    this.websocket.onmessage = this.messageListener.bind(this)
    this.websocket.onerror = this.errorListener.bind(this)
    this.websocket.onclose = this.closeListener.bind(this)
  }

  private stopWebsocket(): void {
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }
  }

  private reconnectWebsocket(): void {
    // NOTE: No need reconnect if it is already in progress
    if (this.websocketReconnecting || this.websocketReconnectionTimeoutID) return

    this.websocketReconnecting = true
    this.websocketReconnectionAttempt += 1
    this.connectWebsocket()
  }

  private openListener(): void {
    if (this.websocketReconnecting) {
      this.websocketReconnecting = false
      this.websocketReconnectionAttempt = 0
    }

    if (this.shouldUpdateScreen()) {
      this.updateBounds()
      this.onScreenInterestGained()

      return
    }

    this.onScreenInterestLost()
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
      // NOTE: The current view is marked secure and cannot be viewed remotely

      return
    }

    const startRegex = /^start /

    if (startRegex.test(message.data)) {
      const startData: StartScreenStreamingMessage = JSON.parse(message.data.replace(startRegex, ''))

      this.screenRotation = startData.orientation

      this.isScreenStreamingJustStarted = true
    }
  }

  private errorListener(): void {}
  private closeListener(): void {
    this.websocketReconnecting = false

    if (this.websocketReconnectionAttempt < this.websocketReconnectionMaxAttempts) {
      this.websocketReconnectionTimeoutID = setTimeout(() => {
        this.websocketReconnectionTimeoutID = null
        this.reconnectWebsocket()
      }, this.websocketReconnectionInterval)

      return
    }

    // TODO: Show modal with message: 'Service is currently unavailable! Try your attempt later.'
    this.setIsScreenLoading(false)
  }
}
