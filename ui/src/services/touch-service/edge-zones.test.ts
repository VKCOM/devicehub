import { describe, expect, it } from 'vitest'

import { EDGE_ZONE_SIZE, getStreamRect, projectToEdge } from './edge-zones'

/* A 9:20 portrait stream letterboxed into a 400x600 stage at (0, 100) */
const stage = { left: 0, top: 100, width: 400, height: 600 }
const stream = getStreamRect(stage, 9 / 20)

describe('getStreamRect', () => {
  it('fits a tall stream by height and centers it horizontally', () => {
    expect(stream.height).toBe(600)
    expect(stream.width).toBeCloseTo(270)
    expect(stream.left).toBeCloseTo(65)
    expect(stream.top).toBe(100)
  })

  it('fits a wide stream by width and centers it vertically', () => {
    const wide = getStreamRect(stage, 20 / 9)

    expect(wide.width).toBe(400)
    expect(wide.height).toBeCloseTo(180)
    expect(wide.top).toBeCloseTo(310)
  })
})

describe('projectToEdge', () => {
  const right = stream.left + stream.width
  const bottom = stream.top + stream.height

  it('keeps a touch in the middle of the stream as is', () => {
    const point = { x: 200, y: 400 }

    expect(projectToEdge(point, stream)).toEqual({ edge: null, point })
  })

  it('projects a touch inside the left edge zone onto the left edge', () => {
    expect(projectToEdge({ x: stream.left + 10, y: 400 }, stream)).toEqual({
      edge: 'left',
      point: { x: stream.left, y: 400 },
    })
  })

  it('projects a touch in the letterbox beside the stream onto the nearest edge', () => {
    expect(projectToEdge({ x: 20, y: 300 }, stream)).toEqual({ edge: 'left', point: { x: stream.left, y: 300 } })
    expect(projectToEdge({ x: 390, y: 300 }, stream)).toEqual({ edge: 'right', point: { x: right, y: 300 } })
  })

  it('projects the top and bottom zones to the notification shade and home edges', () => {
    expect(projectToEdge({ x: 200, y: stream.top + 3 }, stream).point).toEqual({ x: 200, y: stream.top })
    expect(projectToEdge({ x: 200, y: bottom - 3 }, stream)).toEqual({ edge: 'bottom', point: { x: 200, y: bottom } })
  })

  it('does not count a touch just past the zone as an edge swipe', () => {
    expect(projectToEdge({ x: stream.left + EDGE_ZONE_SIZE, y: 400 }, stream).edge).toBeNull()
  })

  it('clamps the other axis into the stream for a touch outside a corner', () => {
    expect(projectToEdge({ x: stream.left - 30, y: bottom + 5 }, stream)).toEqual({
      edge: 'left',
      point: { x: stream.left, y: bottom },
    })
  })
})
