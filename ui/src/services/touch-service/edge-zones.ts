export type ScreenEdge = 'left' | 'right' | 'top' | 'bottom'

export type Rect = {
  left: number
  top: number
  width: number
  height: number
}

export type Point = {
  x: number
  y: number
}

/* NOTE: Width in CSS px of the band inside the stream where a touch counts as an edge swipe */
export const EDGE_ZONE_SIZE = 16

/* The rect of a stream with the given aspect ratio fit by contain (letterbox) into the bounds */
export const getStreamRect = (bounds: Rect, aspectRatio: number): Rect => {
  if (!aspectRatio || !bounds.width || !bounds.height) return bounds

  const width = Math.min(bounds.width, bounds.height * aspectRatio)
  const height = width / aspectRatio

  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
    height,
  }
}

/*
 * A touch that starts in the letterbox beside the stream, or within the edge zone inside it,
 * is projected onto that exact edge of the stream, so the device sees a swipe from its very edge
 * (Back, the notification shade or Home). Any other touch is returned as is.
 */
export const projectToEdge = (
  point: Point,
  stream: Rect,
  zoneSize = EDGE_ZONE_SIZE
): { edge: ScreenEdge | null; point: Point } => {
  const right = stream.left + stream.width
  const bottom = stream.top + stream.height

  const distances: [ScreenEdge, number][] = [
    ['left', point.x - stream.left],
    ['right', right - point.x],
    ['top', point.y - stream.top],
    ['bottom', bottom - point.y],
  ]

  const [edge, distance] = distances.reduce((closest, current) => (current[1] < closest[1] ? current : closest))

  if (distance >= zoneSize) return { edge: null, point }

  const clamped = {
    x: Math.min(Math.max(point.x, stream.left), right),
    y: Math.min(Math.max(point.y, stream.top), bottom),
  }

  if (edge === 'left') clamped.x = stream.left

  if (edge === 'right') clamped.x = right

  if (edge === 'top') clamped.y = stream.top

  if (edge === 'bottom') clamped.y = bottom

  return { edge, point: clamped }
}
