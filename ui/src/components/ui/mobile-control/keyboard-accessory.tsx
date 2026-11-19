import { useEffect, useRef } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Icon24ChevronDown, Icon24GearOutline } from '@vkontakte/icons'

import { MOBILE_INPUT_SENTINEL } from '@/services/keyboard-service/keyboard-service'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { useAccessoryKeys } from './accessory-keys'

import styles from './mobile-control.module.css'

import type { MouseEvent } from 'react'
import type { MobileLayout } from './mobile-layout'

type KeyboardAccessoryProps = {
  layout: MobileLayout
}

/* NOTE: A press must not move the focus away from the input, or the keyboard closes */
const keepFocus = (event: MouseEvent) => event.preventDefault()

/*
 * The phone keyboard types on the device through a real, visually hidden input. The row above
 * the keyboard is pinned to the visual viewport, so iOS never covers it, and always offers Hide.
 */
export const KeyboardAccessory = observer(({ layout }: KeyboardAccessoryProps) => {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const keyboardService = useInjection(CONTAINER_IDS.keyboardService)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)

  useEffect(() => {
    mobileControlStore.setKeyboardInput(inputRef.current)

    return () => mobileControlStore.setKeyboardInput(null)
  }, [])

  /* NOTE: What the device already got from the input, the next input event is sent as a diff to it */
  const sentValueRef = useRef(MOBILE_INPUT_SENTINEL)

  const resetInput = () => {
    const input = inputRef.current

    sentValueRef.current = MOBILE_INPUT_SENTINEL

    if (!input) return

    input.value = MOBILE_INPUT_SENTINEL
    input.setSelectionRange(MOBILE_INPUT_SENTINEL.length, MOBILE_INPUT_SENTINEL.length)
  }

  const sendInput = (value: string, isComposing: boolean) => {
    const previousValue = sentValueRef.current

    sentValueRef.current = value
    keyboardService.mobileInputListener({ value, previousValue, isComposing, resetInput })
  }

  const { isKeyboardOpen } = mobileControlStore
  const accessoryKeys = useAccessoryKeys()

  return (
    <>
      {/*
       * NOTE: A textarea, not an input: Chrome shows its autofill bar (passwords, cards, addresses)
       * over the page for inputs, and in full screen that bar covered the row above the keyboard
       */}
      <textarea
        ref={inputRef}
        aria-label={t('Type on device')}
        autoCapitalize='off'
        autoComplete='off'
        autoCorrect='off'
        className={styles.keyboardInput}
        defaultValue={MOBILE_INPUT_SENTINEL}
        enterKeyHint='enter'
        inputMode='text'
        rows={1}
        spellCheck={false}
        onBlur={() => mobileControlStore.onKeyboardHiddenByOs()}
        onCompositionEnd={(event) => sendInput(event.currentTarget.value, false)}
        onFocus={resetInput}
        onInput={(event) => sendInput(event.currentTarget.value, (event.nativeEvent as InputEvent).isComposing)}
        onKeyDown={(event) =>
          keyboardService.mobileKeyDownListener({ key: event.key, preventDefault: () => event.preventDefault() })
        }
        onKeyUp={(event) =>
          keyboardService.mobileKeyUpListener({ key: event.key, preventDefault: () => event.preventDefault() })
        }
      />
      <div
        aria-hidden={!isKeyboardOpen}
        className={cn(styles.accessory, { [styles.accessoryOn]: isKeyboardOpen })}
        style={{ top: layout.accessoryTop }}
      >
        <div className={styles.accessoryKeys}>
          <button
            aria-label={t('Hide keyboard')}
            className={cn(styles.accessoryKey, styles.accessoryHide)}
            type='button'
            onClick={() => mobileControlStore.closeKeyboard()}
            onMouseDown={keepFocus}
          >
            <Icon24ChevronDown height={20} width={20} />
          </button>
          {mobileControlStore.accessoryKeys.map((id) => {
            const key = accessoryKeys[id]

            return (
              <button
                key={id}
                aria-label={key.label}
                className={cn(styles.accessoryKey, { [styles.accessoryPaste]: id === 'paste' })}
                type='button'
                onClick={key.onClick}
                onMouseDown={keepFocus}
              >
                {key.content}
              </button>
            )
          })}
        </div>
        <button
          aria-label={t('Keyboard row settings')}
          className={cn(styles.accessoryKey, styles.accessorySettings)}
          type='button'
          onClick={() => mobileControlStore.setAccessorySettingsOpen(true)}
        >
          <Icon24GearOutline height={20} width={20} />
        </button>
      </div>
    </>
  )
})
