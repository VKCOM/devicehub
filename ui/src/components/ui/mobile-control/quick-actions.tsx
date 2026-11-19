import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import {
  Icon24CameraOutline,
  Icon24KeyboardOutline,
  Icon24OnOffOutline,
  Icon24TextOutline,
  Icon28MuteOutline,
  Icon28RotateRightOutline,
  Icon28VolumeOutline,
  Icon28VolumeAlt,
} from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { BackNavIcon, HomeNavIcon, RecentsNavIcon } from './nav-icons'

import styles from './tools-sheet.module.css'

import type { ReactNode } from 'react'

type QuickAction = {
  id: string
  icon: ReactNode
  title: string
  isPressed?: boolean
  onClick: () => void
}

/* Most used device buttons, a horizontally scrollable row visible in the half sheet */
export const QuickActions = observer(() => {
  const { t } = useTranslation()

  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()
  const isIos = device?.manufacturer === 'Apple'

  // NOTE: Without the navigation strip its buttons come first here
  const navigationActions: QuickAction[] = mobileControlStore.isStripEnabled
    ? []
    : [
        ...(isIos
          ? []
          : [{ id: 'back', icon: <BackNavIcon />, title: t('Back'), onClick: () => deviceControlStore.back() }]),
        { id: 'home', icon: <HomeNavIcon />, title: t('Home'), onClick: () => deviceControlStore.home() },
        ...(isIos
          ? []
          : [
              {
                id: 'recents',
                icon: <RecentsNavIcon />,
                title: t('Recents'),
                onClick: () => deviceControlStore.appSwitch(),
              },
            ]),
      ]

  const actions: QuickAction[] = [
    ...navigationActions,
    { id: 'power', icon: <Icon24OnOffOutline />, title: t('Power'), onClick: () => deviceControlStore.power() },
    {
      id: 'volume-down',
      icon: <Icon28VolumeOutline height={22} width={22} />,
      title: t('Vol −'),
      onClick: () => deviceControlStore.volumeDown(),
    },
    {
      id: 'volume-up',
      icon: <Icon28VolumeAlt height={22} width={22} />,
      title: t('Vol +'),
      onClick: () => deviceControlStore.volumeUp(),
    },
    {
      id: 'mute',
      icon: <Icon28MuteOutline height={22} width={22} />,
      title: t('Mute'),
      onClick: () => deviceControlStore.mute(),
    },
    {
      id: 'camera',
      icon: <Icon24CameraOutline />,
      title: t('Camera'),
      onClick: () => deviceControlStore.camera(),
    },
    {
      id: 'rotate',
      icon: <Icon28RotateRightOutline height={22} width={22} />,
      title: t('Rotate'),
      onClick: () => deviceControlStore.tryToRotate(deviceScreenStore.isScreenRotated ? 'portrait' : 'landscape'),
    },
    {
      id: 'keyboard',
      icon: <Icon24KeyboardOutline />,
      title: t('Keyboard'),
      isPressed: mobileControlStore.isKeyboardOpen,
      onClick: () => mobileControlStore.toggleKeyboard(),
    },
    {
      id: 'send-text',
      icon: <Icon24TextOutline />,
      title: t('Send text'),
      onClick: () => mobileControlStore.setPasteDialogOpen(true),
    },
  ]

  return (
    <div className={styles.quickActions}>
      {actions.map((action) => (
        <button
          key={action.id}
          aria-pressed={action.isPressed}
          className={styles.quickAction}
          type='button'
          onClick={action.onClick}
        >
          <span className={styles.quickActionIcon}>{action.icon}</span>
          <span className={styles.quickActionLabel}>{action.title}</span>
        </button>
      ))}
    </div>
  )
})
