interface RealDimensions {
    width: number
    height: number
}

interface VirtualDimensions {
    width: number
    height: number
    rotation: number
}

export default class FrameConfig {
    public realWidth: number
    public realHeight: number
    public virtualWidth: number
    public virtualHeight: number
    public rotation: number
    public quality: number

    constructor(real: RealDimensions, virtual: VirtualDimensions, quality: number) {
        this.realWidth = real.width
        this.realHeight = real.height
        this.virtualWidth = virtual.width
        this.virtualHeight = virtual.height
        this.rotation = virtual.rotation
        this.quality = quality
    }

    toString(): string {
        return `${this.realWidth}x${this.realHeight}@${this.virtualWidth}x${this.virtualHeight}/${this.rotation}`
    }
}

