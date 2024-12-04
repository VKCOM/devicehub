/**
 * Rotation affects the screen as follows:
 *
 *                   0deg
 *                 |------|
 *                 | MENU |
 *                 |------|
 *            -->  |      |  --|
 *            |    |      |    v
 *                 |      |
 *                 |      |
 *                 |------|
 *        |----|-|          |-|----|
 *        |    |M|          | |    |
 *        |    |E|          | |    |
 *  90deg |    |N|          |U|    | 270deg
 *        |    |U|          |N|    |
 *        |    | |          |E|    |
 *        |    | |          |M|    |
 *        |----|-|          |-|----|
 *                 |------|
 *            ^    |      |    |
 *            |--  |      |  <--
 *                 |      |
 *                 |      |
 *                 |------|
 *                 | UNEM |
 *                 |------|
 *                  180deg
 *
 * Which leads to the following mapping:
 *
 * |--------------|------|---------|---------|---------|
 * |              | 0deg |  90deg  |  180deg |  270deg |
 * |--------------|------|---------|---------|---------|
 * | CSS rotate() | 0deg | -90deg  | -180deg |  90deg  |
 * | bounding w   |  w   |    h    |    w    |    h    |
 * | bounding h   |  h   |    w    |    h    |    w    |
 * | pos x        |  x   |   h-y   |   w-x   |    y    |
 * | pos y        |  y   |    x    |   h-y   |   h-x   |
 * |--------------|------|---------|---------|---------|
 */

import type { Coordinator, Coords, CoordsArgs, Size } from './types'

class ScalingService {
  coordinator(realWidth: number, realHeight: number): Coordinator {
    const realRatio = realWidth / realHeight

    return {
      coords: ({ boundingWidth, boundingHeight, relX, relY, rotation, isIosDevice }: CoordsArgs): Coords => {
        let width = 0
        let height = 0
        let x = 0
        let y = 0
        let ratio = 0
        let scaledValue = 0

        switch (rotation) {
          case 0:
            width = boundingWidth
            height = boundingHeight
            x = relX
            y = relY
            break
          case 90:
            width = boundingHeight
            height = boundingWidth
            x = boundingHeight - relY
            y = relX

            // NOTE: X and Y are inverted on iOS
            if (isIosDevice) {
              width = boundingHeight
              height = boundingWidth
              x = relY
              y = relX
            }

            break
          case 180:
            width = boundingWidth
            height = boundingHeight
            x = boundingWidth - relX
            y = boundingHeight - relY
            break
          case 270:
            width = boundingHeight
            height = boundingWidth
            x = relY
            y = boundingWidth - relX
            break
        }

        ratio = width / height

        if (realRatio > ratio) {
          // NOTE: covers the area horizontally
          scaledValue = width / realRatio

          // NOTE: adjust y to start from the scaled top edge
          y -= (height - scaledValue) / 2

          /* NOTE: not touching the screen, but we want to trigger certain events
            (like touchup) anyway, so let's do it on the edges.
          */
          if (y < 0) {
            y = 0
          } else if (y > scaledValue) {
            y = scaledValue
          }

          // NOTE: make sure x is within bounds too
          if (x < 0) {
            x = 0
          } else if (x > width) {
            x = width
          }

          height = scaledValue
        } else {
          // NOTE: covers the area vertically
          scaledValue = height * realRatio
          // NOTE: adjust x to start from the scaled left edge
          x -= (width - scaledValue) / 2

          /* NOTE: not touching the screen, but we want to trigger certain events
            (like touchup) anyway, so let's do it on the edges.
          */
          if (x < 0) {
            x = 0
          } else if (x > scaledValue) {
            x = scaledValue
          }

          // NOTE: make sure y is within bounds too
          if (y < 0) {
            y = 0
          } else if (y > height) {
            y = height
          }

          width = scaledValue
        }

        if (rotation === 90 && isIosDevice) {
          return {
            xP: y / height,
            yP: x / width,
          }
        }

        return {
          xP: x / width,
          yP: y / height,
        }
      },
      size(sizeWidth: number, sizeHeight: number): Size {
        let width = sizeWidth
        let height = sizeHeight
        const ratio = width / height

        if (realRatio > ratio) {
          // NOTE: covers the area horizontally

          if (width >= realWidth) {
            // NOTE: don't go over max size
            width = realWidth
            height = realHeight
          } else {
            height = Math.floor(width / realRatio)
          }
        } else {
          // NOTE: covers the area vertically

          if (height >= realHeight) {
            // NOTE: don't go over max size
            height = realHeight
            width = realWidth
          } else {
            width = Math.floor(height * realRatio)
          }
        }

        return {
          width,
          height,
        }
      },
      projectedSize(boundingWidth: number, boundingHeight: number, rotation: number): Size {
        let width = 0
        let height = 0

        switch (rotation) {
          case 0:
          case 180:
            width = boundingWidth
            height = boundingHeight
            break
          case 90:
          case 270:
            width = boundingHeight
            height = boundingWidth
            break
        }

        const ratio = width / height

        if (realRatio > ratio) {
          // NOTE: covers the area horizontally
          height = Math.floor(width / realRatio)
        } else {
          width = Math.floor(height * realRatio)
        }

        return {
          width,
          height,
        }
      },
    }
  }
}

export const scalingService = new ScalingService()
