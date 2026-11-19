import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Icon24KeyboardOutline } from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ToolsBadge } from './tools-badge'
import { BackNavIcon, HomeNavIcon, RecentsNavIcon } from './nav-icons'

import styles from './mobile-control.module.css'

import type { MobileLayout } from './mobile-layout'

type NavigationStripProps = {
  layout: MobileLayout
}

/* Navigation buttons under the stream, always dark like a part of the device */
export const NavigationStrip = observer(({ layout }: NavigationStripProps) => {
  const { t } = useTranslation()

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()
  const isIos = device?.manufacturer === 'Apple'

  return (
    <nav
      aria-hidden={!layout.isStripVisible}
      aria-label={t('Device navigation')}
      className={cn(styles.strip, { [styles.stripOff]: !layout.isStripVisible })}
    >
      <button
        aria-label={t('Keyboard')}
        aria-pressed={mobileControlStore.isKeyboardOpen}
        className={styles.stripButton}
        type='button'
        onClick={() => mobileControlStore.toggleKeyboard()}
      >
        <Icon24KeyboardOutline height={22} width={22} />
      </button>
      {!isIos && (
        <button
          aria-label={t('Back')}
          className={styles.stripButton}
          type='button'
          onClick={() => deviceControlStore.back()}
        >
          <BackNavIcon />
        </button>
      )}
      <button
        aria-label={t('Home')}
        className={styles.stripButton}
        type='button'
        onClick={() => deviceControlStore.home()}
      >
        <HomeNavIcon />
      </button>
      {!isIos && (
        <button
          aria-label={t('Recents')}
          className={styles.stripButton}
          type='button'
          onClick={() => deviceControlStore.appSwitch()}
        >
          <RecentsNavIcon />
        </button>
      )}
      <button
        aria-expanded={mobileControlStore.isSheetOpen}
        aria-label={t('Tools')}
        className={cn(styles.stripButton, styles.toolsButton)}
        type='button'
        onClick={() => mobileControlStore.toggleSheet()}
      >
        <ToolsBadge />
      </button>
    </nav>
  )
})
