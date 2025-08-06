import { useEffect, useRef } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { Spinner } from '@vkontakte/vkui'
import { useInjection } from 'inversify-react'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { useScreenAutoQuality } from '@/lib/hooks/use-screen-auto-quality.hook'
import { useScreenStreaming } from '@/lib/hooks/use-screen-streaming.hook'
import { useCallbackWithErrorHandling } from '@/lib/hooks/use-callback-with-error-handling.hook'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import styles from '../device-screen.module.css'

import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MouseEvent, TouchEvent, RefObject } from 'react'

interface ScreenProps {
  canvasWrapperRef: RefObject<HTMLDivElement>
}

export const StreamingScreen = observer(({ canvasWrapperRef }: ScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const touchService = useInjection(CONTAINER_IDS.touchService)
  const keyboardService = useInjection(CONTAINER_IDS.keyboardService)
  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)

  useScreenStreaming({ canvasRef, canvasWrapperRef })
  useScreenAutoQuality()

  const onMouseDown = useCallbackWithErrorHandling((event: MouseEvent<HTMLDivElement>) => {
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

  const onMouseMove = useCallbackWithErrorHandling((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    touchService.mouseMoveListener({
      mousePageX: event.pageX,
      mousePageY: event.pageY,
      isRightButtonPressed: event.button === 2,
      isAltKeyPressed: event.altKey,
    })
  })

  const onMouseUp = useCallbackWithErrorHandling((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    touchService.mouseUpListener({
      mousePageX: event.pageX,
      mousePageY: event.pageY,
      isRightButtonPressed: event.button === 2,
    })

    touchService.mouseUpBugWorkaroundListener(event)
  })

  const onTouchEnd = useCallbackWithErrorHandling((event: TouchEvent<HTMLDivElement>) => {
    touchService.touchEndListener({
      touches: event.nativeEvent.touches,
      changedTouches: event.nativeEvent.changedTouches,
    })
  })

  const onTouchMove = useCallbackWithErrorHandling((event: TouchEvent<HTMLDivElement>) => {
    touchService.touchMoveListener({ changedTouches: event.nativeEvent.changedTouches })
  })

  const onTouchStart = useCallbackWithErrorHandling((event: TouchEvent<HTMLDivElement>) => {
    touchService.touchStartListener({
      touches: event.nativeEvent.touches,
      changedTouches: event.nativeEvent.changedTouches,
    })
  })

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
    canvasWrapperRef?.current?.addEventListener('mousedown', onMouseDown)
    canvasWrapperRef?.current?.addEventListener('mousemove', onMouseMove)
    canvasWrapperRef?.current?.addEventListener('mouseup', onMouseUp)
    canvasWrapperRef?.current?.addEventListener('touchend', onTouchEnd)
    canvasWrapperRef?.current?.addEventListener('touchmove', onTouchMove)
    canvasWrapperRef?.current?.addEventListener('touchstart', onTouchStart)
  }, [])

  return (
    <>
      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={cn(styles.canvas, { [styles.letterbox]: deviceScreenStore.isAspectRatioModeLetterbox })}
        />
        {touchService.slots.map((value, index) => (
          <span
            key={value}
            className={cn(styles.finger, { [styles.activeFinger]: touchService.fingers[index] })}
            style={
              touchService.fingers[index]
                ? {
                    transform: `translate3d(${touchService.fingers[index].x}px,${touchService.fingers[index].y}px,0) scale(${touchService.fingers[index].pressure + 0.5},${touchService.fingers[index].pressure + 0.5}`,
                  }
                : {}
            }
          />
        ))}
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
