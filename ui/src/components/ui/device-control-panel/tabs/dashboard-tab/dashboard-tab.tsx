import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ClipboardControl } from './clipboard-control'
import { AppUploadControl } from './app-upload-control'
import { RemoteDebugControl } from './remote-debug-control'
import { ShellControl } from './shell-control'
import { DeviceButtonsControl } from './device-buttons-control'
import { DeviceBookingControl } from './device-booking-control'
import { LinkOpenerControl } from './link-opener-control'

import styles from './dashboard-tab.module.css'

export const DashboardTab = observer(() => {
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()

  return (
    <div className={styles.dashboardTabContainer}>
      <div className={styles.dashboardTab}>
        <DeviceButtonsControl className={styles.deviceButtons} />
        <RemoteDebugControl className={styles.remoteDebug} />
        <AppUploadControl className={styles.appUpload} />
        <LinkOpenerControl className={styles.linkOpener} />
        <ConditionalRender conditions={[!device?.ios]}>
          <ShellControl className={styles.shell} />
        </ConditionalRender>
        <ClipboardControl className={styles.clipboard} />
        {/* https://developer.apple.com/forums/thread/706761?answerId=714896022#714896022 */}
        <DeviceBookingControl className={styles.deviceBooking} />
      </div>
    </div>
  )
})
