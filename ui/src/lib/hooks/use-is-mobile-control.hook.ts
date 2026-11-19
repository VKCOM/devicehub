import { useSyncExternalStore } from 'react'

/* NOTE: VKUI SMALL_TABLET breakpoint: a touch screen whose short side is narrower is a phone */
const PHONE_MAX_WIDTH = 768
/* NOTE: A phone turned to landscape is wide, but never this tall; a tablet always is */
const PHONE_LANDSCAPE_MAX_HEIGHT = 500

/* Whether a viewport of this size gets the phone layout of the control page, in portrait and landscape */
export const isMobileControlViewport = ({
  width,
  height,
  isCoarsePointer,
}: {
  width: number
  height: number
  isCoarsePointer: boolean
}): boolean => isCoarsePointer && (width < PHONE_MAX_WIDTH || height < PHONE_LANDSCAPE_MAX_HEIGHT)

const COARSE_POINTER_QUERY = '(pointer: coarse)'

const subscribe = (onChange: () => void) => {
  const pointer = window.matchMedia(COARSE_POINTER_QUERY)

  window.addEventListener('resize', onChange)
  pointer.addEventListener('change', onChange)

  return () => {
    window.removeEventListener('resize', onChange)
    pointer.removeEventListener('change', onChange)
  }
}

const getSnapshot = () =>
  isMobileControlViewport({
    width: window.innerWidth,
    height: window.innerHeight,
    isCoarsePointer: window.matchMedia(COARSE_POINTER_QUERY).matches,
  })

/* Whether the control page uses its phone layout; rotating the phone keeps it */
export const useIsMobileControl = (): boolean => useSyncExternalStore(subscribe, getSnapshot)
