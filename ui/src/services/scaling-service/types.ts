export type Coords = {
  xP: number
  yP: number
}

export type CoordsArgs = {
  boundingWidth: number
  boundingHeight: number
  relX: number
  relY: number
  rotation: number
  isIosDevice: boolean
}

export type Size = {
  width: number
  height: number
}

export type Coordinator = {
  coords: (args: CoordsArgs) => Coords
  size: (sizeWidth: number, sizeHeight: number) => Size
  projectedSize: (boundingWidth: number, boundingHeight: number, rotation: number) => Size
}
