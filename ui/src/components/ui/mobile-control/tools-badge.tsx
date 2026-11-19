import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { Icon24SlidersVerticalOutline } from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import styles from './mobile-control.module.css'

const RING_LENGTH = 100.5

/* Tools icon with the progress of a long operation, or a dot for a new global alert */
export const ToolsBadge = observer(() => {
  const settingsService = useInjection(CONTAINER_IDS.settingsService)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const applicationInstallationService = useInjection(CONTAINER_IDS.applicationInstallationService)

  const { isInstalling, progress } = applicationInstallationService
  const hasNewAlert = settingsService.isAlertMessageActive && !mobileControlStore.isAlertSeen

  return (
    <>
      <Icon24SlidersVerticalOutline height={22} width={22} />
      <span className={styles.toolsBadge}>
        {isInstalling && (
          <svg aria-hidden='true' className={styles.progressRing} viewBox='0 0 40 40'>
            <circle className={styles.progressTrack} cx='20' cy='20' r='16' />
            <circle
              className={styles.progressValue}
              cx='20'
              cy='20'
              r='16'
              strokeDashoffset={(RING_LENGTH * (1 - Math.min(100, Math.max(0, progress)) / 100)).toFixed(1)}
            />
          </svg>
        )}
        {!isInstalling && hasNewAlert && <i className={styles.alertDot} />}
      </span>
    </>
  )
})
