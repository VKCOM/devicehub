import { useEffect, useRef } from 'react'
import { reaction } from 'mobx'

import styles from '../device-screen.module.css'

import type { TouchService } from '@/services/touch-service/touch-service'

/* NOTE: How long a point of the path stays visible, the line fades out towards its oldest end */
const TRAIL_LIFETIME_MS = 280
const TRAIL_WIDTH = 3
const TRAIL_COLOR = '82, 158, 244'

type TrailPoint = { x: number; y: number; time: number }

type TouchTrailProps = {
  touchService: TouchService
}

/*
 * A short fading line behind every finger, drawn from the same points that are sent to the device,
 * so the user sees the exact path of a swipe. The canvas is only redrawn while a trail is visible.
 */
export const TouchTrail = ({ touchService }: TouchTrailProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) return undefined

    const trails = new Map<number, TrailPoint[]>()
    let frame = 0

    const resize = () => {
      const ratio = window.devicePixelRatio || 1

      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const draw = () => {
      const now = performance.now()

      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = TRAIL_WIDTH

      for (const [index, points] of trails) {
        while (points.length && now - points[0].time > TRAIL_LIFETIME_MS) points.shift()

        if (!points.length) {
          trails.delete(index)
          continue
        }

        for (let i = 1; i < points.length; i++) {
          const alpha = 1 - (now - points[i].time) / TRAIL_LIFETIME_MS

          context.strokeStyle = `rgba(${TRAIL_COLOR}, ${Math.max(0, alpha).toFixed(3)})`
          context.beginPath()
          context.moveTo(points[i - 1].x, points[i - 1].y)
          context.lineTo(points[i].x, points[i].y)
          context.stroke()
        }
      }

      frame = trails.size ? requestAnimationFrame(draw) : 0
    }

    const dispose = reaction(
      () => Object.values(touchService.fingers).map(({ index, x, y }) => ({ index, x, y })),
      (fingers) => {
        const now = performance.now()

        for (const { index, x, y } of fingers) {
          const points = trails.get(index) ?? []
          const last = points[points.length - 1]

          if (!last || last.x !== x || last.y !== y) points.push({ x, y, time: now })

          trails.set(index, points)
        }

        if (!frame) frame = requestAnimationFrame(draw)
      }
    )

    const resizeObserver = new ResizeObserver(resize)

    resizeObserver.observe(canvas)
    resize()

    return () => {
      dispose()
      resizeObserver.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [touchService])

  return <canvas ref={canvasRef} aria-hidden='true' className={styles.touchTrail} />
}
