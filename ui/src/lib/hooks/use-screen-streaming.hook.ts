import { useEffect } from 'react'
import { useErrorBoundary } from 'react-error-boundary'

import { DeviceScreenStore } from '@/store/device-screen-store/device-screen-store'
import { debounce } from '@/lib/utils/debounce.util'

import { useServiceLocator } from './use-service-locator.hook'

import type { RefObject } from 'react'

type UseScreenStreamingArgs = {
  canvasRef: RefObject<HTMLCanvasElement>
  canvasWrapperRef: RefObject<HTMLDivElement>
  serial?: string
}

export const useScreenStreaming = ({ canvasRef, canvasWrapperRef, serial }: UseScreenStreamingArgs): void => {
  const deviceScreenStore = useServiceLocator<DeviceScreenStore>(DeviceScreenStore.name)
  const { showBoundary } = useErrorBoundary()

  useEffect(() => {
    if (!canvasRef.current || !canvasWrapperRef.current || !serial || !deviceScreenStore) return undefined

    deviceScreenStore.startScreenStreaming(serial, canvasRef.current, canvasWrapperRef.current).catch(showBoundary)

    return (): void => {
      deviceScreenStore.stopScreenStreaming()
    }
  }, [deviceScreenStore])

  useEffect(() => {
    if (!canvasWrapperRef.current || !deviceScreenStore) return undefined

    const debouncedUpdateBounds = debounce(deviceScreenStore.updateBounds, 1000)

    const resizeObserver = new ResizeObserver(() => {
      debouncedUpdateBounds()
    })

    resizeObserver.observe(canvasWrapperRef.current)

    return (): void => {
      if (!canvasWrapperRef.current) return undefined

      resizeObserver.unobserve(canvasWrapperRef.current)

      return undefined
    }
  }, [deviceScreenStore])
}
