import { useEffect, useRef } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { Spinner } from '@vkontakte/vkui'
import { useInjection } from 'inversify-react'
import { useErrorBoundary } from 'react-error-boundary'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { useScreenAutoQuality } from '@/lib/hooks/use-screen-auto-quality.hook'
import { useScreenStreaming } from '@/lib/hooks/use-screen-streaming.hook'
import { useCallbackWithErrorHandling } from '@/lib/hooks/use-callback-with-error-handling.hook'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useIsMobileControl } from '@/lib/hooks/use-is-mobile-control.hook'

import { TouchTrail } from './touch-trail'

import styles from '../device-screen.module.css'

import type { ChangeEvent, ClipboardEvent, KeyboardEvent, RefObject } from 'react'

interface ScreenProps {
  canvasWrapperRef: RefObject<HTMLDivElement>
}

export const StreamingScreen = observer(({ canvasWrapperRef }: ScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const touchService = useInjection(CONTAINER_IDS.touchService)
  const keyboardService = useInjection(CONTAINER_IDS.keyboardService)
  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const isMobileControl = useIsMobileControl()

  // NOTE: The phone layout has its own view settings, the desktop always shows touches
  const isTouchIndicatorShown = !isMobileControl || mobileControlStore.isTouchIndicatorShown
  const isTouchTrailShown = isMobileControl && mobileControlStore.isTouchTrailShown

  const { showBoundary } = useErrorBoundary()

  useScreenStreaming({ canvasRef, canvasWrapperRef })
  useScreenAutoQuality()

  const onInputChange = useCallbackWithErrorHandling((event: ChangeEvent<HTMLInputElement>) => {
    keyboardService.changeListener({
      value: event.target.value,
      clearInput: () => {
        if (inputRef.current) {
          inputRef.current.value = ''
        }
      },
    })
  })

  const onCopy = useCallbackWithErrorHandling((event: ClipboardEvent) => {
    event.preventDefault()

    keyboardService.copyListener({
      setClipboardData: (content) => event.clipboardData.setData('text/plain', content),
    })
  })

  const onKeyDown = useCallbackWithErrorHandling((event: KeyboardEvent<HTMLInputElement>) => {
    keyboardService.keyDownListener({
      key: event.key,
      preventDefault: event.preventDefault.bind(event),
    })
  })

  const onKeyUp = useCallbackWithErrorHandling((event: KeyboardEvent<HTMLInputElement>) => {
    keyboardService.keyUpListener({
      code: event.code,
      key: event.key,
      keyCode: event.keyCode,
      charCode: event.key.charCodeAt(0),
      preventDefault: event.preventDefault.bind(event),
    })
  })

  const onPaste = useCallbackWithErrorHandling((event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()

    keyboardService.pasteListener({
      getClipboardData: () => event.clipboardData.getData('text/plain'),
    })
  })

  useEffect(() => {
    const element = canvasWrapperRef.current

    if (!element) return undefined

    const handle =
      <E extends Event>(listener: (event: E) => void) =>
      (event: E): void => {
        try {
          listener(event)
        } catch (error) {
          showBoundary(error)
        }
      }

    const onMouseDown = handle((event: MouseEvent) => {
      event.preventDefault()

      touchService.mouseDownListener({
        mousePageX: event.pageX,
        mousePageY: event.pageY,
        eventTimestamp: event.timeStamp,
        isAltKeyPressed: event.altKey,
        isRightButtonPressed: event.button === 2,
        focusInput: () => inputRef.current?.focus(),
      })
    })

    const onMouseMove = handle((event: MouseEvent) => {
      event.preventDefault()

      touchService.mouseMoveListener({
        mousePageX: event.pageX,
        mousePageY: event.pageY,
        isRightButtonPressed: event.button === 2,
        isAltKeyPressed: event.altKey,
      })
    })

    const onMouseUp = handle((event: MouseEvent) => {
      event.preventDefault()

      touchService.mouseUpListener({
        mousePageX: event.pageX,
        mousePageY: event.pageY,
        isRightButtonPressed: event.button === 2,
      })

      touchService.mouseUpBugWorkaroundListener(event)
    })

    /* NOTE: Touches belong to the device: no scrolling, zooming, emulated mouse events or focus changes */
    const onTouchStart = handle((event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()

      touchService.touchStartListener({ touches: event.touches, changedTouches: event.changedTouches })
    })

    const onTouchMove = handle((event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()

      touchService.touchMoveListener({ changedTouches: event.changedTouches })
    })

    const onTouchEnd = handle((event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()

      touchService.touchEndListener({ touches: event.touches, changedTouches: event.changedTouches })
    })

    const touchOptions: AddEventListenerOptions = { passive: false }

    element.addEventListener('mousedown', onMouseDown)
    element.addEventListener('mousemove', onMouseMove)
    element.addEventListener('mouseup', onMouseUp)
    element.addEventListener('touchstart', onTouchStart, touchOptions)
    element.addEventListener('touchmove', onTouchMove, touchOptions)
    element.addEventListener('touchend', onTouchEnd, touchOptions)
    element.addEventListener('touchcancel', onTouchEnd, touchOptions)

    return () => {
      element.removeEventListener('mousedown', onMouseDown)
      element.removeEventListener('mousemove', onMouseMove)
      element.removeEventListener('mouseup', onMouseUp)
      element.removeEventListener('touchstart', onTouchStart, touchOptions)
      element.removeEventListener('touchmove', onTouchMove, touchOptions)
      element.removeEventListener('touchend', onTouchEnd, touchOptions)
      element.removeEventListener('touchcancel', onTouchEnd, touchOptions)
    }
  }, [touchService])

  return (
    <>
      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={cn(styles.canvas, { [styles.letterbox]: deviceScreenStore.isAspectRatioModeLetterbox })}
        />
        {isTouchTrailShown && <TouchTrail touchService={touchService} />}
        {isTouchIndicatorShown &&
          touchService.slots.map((value, index) => {
            const finger = touchService.fingers[index]
            // NOTE: Phones report a pressure near 1 for every touch, which only made the ring larger
            const scale = isMobileControl || !finger ? 1 : finger.pressure + 0.5

            return (
              <span
                key={value}
                className={cn(styles.finger, {
                  [styles.activeFinger]: finger,
                  [styles.mobileFinger]: isMobileControl,
                })}
                style={
                  finger ? { transform: `translate3d(${finger.x}px,${finger.y}px,0) scale(${scale},${scale})` } : {}
                }
              />
            )
          })}
        <ConditionalRender conditions={[deviceScreenStore.isScreenLoading]}>
          <Spinner className={styles.spinner} size='xl' />
        </ConditionalRender>
      </div>
      <input
        ref={inputRef}
        autoCapitalize='off'
        autoComplete='off'
        autoCorrect='off'
        className={styles.screenInput}
        inputMode='text'
        type='text'
        onChange={onInputChange}
        onCopy={onCopy}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onPaste={onPaste}
      />
    </>
  )
})
