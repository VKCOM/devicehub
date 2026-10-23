import { useSyncExternalStore } from 'react'

/* Whether the media query matches, updated as the viewport changes */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)

      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches
  )
