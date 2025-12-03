interface PixelFormatValues {
  bitsPerPixel: number
  depth: number
  bigEndianFlag: number
  trueColorFlag: number
  redMax: number
  greenMax: number
  blueMax: number
  redShift: number
  greenShift: number
  blueShift: number
}

class PixelFormat {
  bitsPerPixel: number
  depth: number
  bigEndianFlag: number
  trueColorFlag: number
  redMax: number
  greenMax: number
  blueMax: number
  redShift: number
  greenShift: number
  blueShift: number

  constructor(values: PixelFormatValues) {
    this.bitsPerPixel = values.bitsPerPixel
    this.depth = values.depth
    this.bigEndianFlag = values.bigEndianFlag
    this.trueColorFlag = values.trueColorFlag
    this.redMax = values.redMax
    this.greenMax = values.greenMax
    this.blueMax = values.blueMax
    this.redShift = values.redShift
    this.greenShift = values.greenShift
    this.blueShift = values.blueShift
  }
}

export default PixelFormat

