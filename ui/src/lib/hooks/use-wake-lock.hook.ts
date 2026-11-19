import { useEffect } from 'react'

/* Keeps the phone screen on while the page is visible; the lock is lost when hidden, so it is taken again */
export const useWakeLock = (isEnabled: boolean): void => {
  useEffect(() => {
    if (!isEnabled || !('wakeLock' in navigator)) return undefined

    let sentinel: WakeLockSentinel | null = null
    let isDisposed = false

    const acquire = async () => {
      if (sentinel || document.visibilityState !== 'visible') return

      try {
        const lock = await navigator.wakeLock.request('screen')

        if (isDisposed) {
          lock.release()

          return
        }

        sentinel = lock
        lock.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        /* NOTE: Refused, e.g. in battery saver or without a user gesture yet */
      }
    }

    const onVisibilityChange = () => acquire()
    // NOTE: Some browsers grant the lock only after a user gesture
    const onPointerDown = () => acquire()

    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pointerdown', onPointerDown, { passive: true })

    return () => {
      isDisposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pointerdown', onPointerDown)
      sentinel?.release()
      sentinel = null
    }
  }, [isEnabled])
}
