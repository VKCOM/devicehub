import EventEmitter from 'events'

interface PointerEvent {
  buttonMask: number
  xPosition: number
  yPosition: number
}

interface TouchEvent {
  seq: number
  contact: number
  x?: number
  y?: number
  pressure?: number
}

class PointerTranslator extends EventEmitter {
  private gestureStarted = false
  private seq = 0

  push(event: PointerEvent): void {
    if (!this.gestureStarted) {
      if (!event.buttonMask) {
        return
      }

      this.emit('touchstart', {
        seq: this.seq++
      })

      this.emit('touchdown', {
        seq: this.seq++,
        contact: 0,
        x: event.xPosition,
        y: event.yPosition,
        pressure: 0.5
      } as TouchEvent)

      this.emit('touchcommit', {
        seq: this.seq++
      })

      this.gestureStarted = true
      return
    }

    if (event.buttonMask) {
      this.emit('touchmove', {
        seq: this.seq++,
        contact: 0,
        x: event.xPosition,
        y: event.yPosition,
        pressure: 0.5
      } as TouchEvent)

      this.emit('touchcommit', {
        seq: this.seq++
      })
    } else {
      this.emit('touchup', {
        seq: this.seq++,
        contact: 0
      } as TouchEvent)

      this.emit('touchcommit', {
        seq: this.seq++
      })

      this.emit('touchstop', {
        seq: this.seq++
      })

      this.gestureStarted = false
    }
  }
}

export default PointerTranslator

