import { useEffect } from 'react'
import { useInjection } from 'inversify-react'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

/* Takes the device when the control page shows it and cleans up when the page leaves */
export const useDeviceLifecycle = (): void => {
  const deviceLifecycleService = useInjection(CONTAINER_IDS.deviceLifecycleService)

  useEffect(() => {
    deviceLifecycleService.prepareDevice()

    return () => {
      deviceLifecycleService.cleanupDevice()
    }
  }, [])
}
