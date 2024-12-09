import { useErrorBoundary } from 'react-error-boundary'

export const useCallbackWithErrorHandling = (callback: (...args: any[]) => void) => {
  const { showBoundary } = useErrorBoundary()

  return (...args: any[]): void => {
    try {
      callback(...args)
    } catch (error) {
      showBoundary(error)
    }
  }
}
