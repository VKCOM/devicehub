import { useEffect } from 'react'

import type { RefObject } from 'react'

export const useClickOutside = <T extends HTMLElement = HTMLElement>(ref: RefObject<T>, cb: () => void): void => {
  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.composedPath()[0] as Node)) {
        cb()
      }
    }

    document.body.addEventListener('click', onClickOutside)

    return (): void => document.body.removeEventListener('click', onClickOutside)
  }, [cb])
}
