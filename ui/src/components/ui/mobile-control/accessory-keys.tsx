import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import {
  Icon24ArrowDownOutline,
  Icon24ArrowLeftOutline,
  Icon24ArrowRightOutline,
  Icon24ArrowUpOutline,
} from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { ReactNode } from 'react'
import type { AccessoryKeyId } from '@/store/mobile-control-store'

export type AccessoryKey = {
  /* NOTE: The full name, for screen readers and the row settings */
  label: string
  content: ReactNode
  onClick: () => void
}

/* Keys the row above the phone keyboard can show, the user picks them in the row settings */
export const useAccessoryKeys = (): Record<AccessoryKeyId, AccessoryKey> => {
  const { t } = useTranslation()

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)

  return {
    tab: { label: t('Tab'), content: t('Tab'), onClick: () => deviceControlStore.tab() },
    left: {
      label: t('Cursor left'),
      content: <Icon24ArrowLeftOutline height={19} width={19} />,
      onClick: () => deviceControlStore.dpadLeft(),
    },
    right: {
      label: t('Cursor right'),
      content: <Icon24ArrowRightOutline height={19} width={19} />,
      onClick: () => deviceControlStore.dpadRight(),
    },
    up: {
      label: t('Cursor up'),
      content: <Icon24ArrowUpOutline height={19} width={19} />,
      onClick: () => deviceControlStore.dpadUp(),
    },
    down: {
      label: t('Cursor down'),
      content: <Icon24ArrowDownOutline height={19} width={19} />,
      onClick: () => deviceControlStore.dpadDown(),
    },
    home: { label: t('Line start'), content: t('Home key'), onClick: () => deviceControlStore.moveHome() },
    end: { label: t('Line end'), content: t('End key'), onClick: () => deviceControlStore.moveEnd() },
    esc: { label: t('Esc'), content: t('Esc'), onClick: () => deviceControlStore.escape() },
    enter: { label: t('Enter'), content: t('Enter'), onClick: () => deviceControlStore.enter() },
    paste: {
      label: t('Paste text'),
      content: t('Paste text'),
      onClick: () => mobileControlStore.setPasteDialogOpen(true),
    },
  }
}
