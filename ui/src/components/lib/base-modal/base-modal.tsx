import { ModalCard, ModalRoot } from '@vkontakte/vkui'

import { useMediaQuery } from '@/lib/hooks/use-media-query.hook'

import styles from './base-modal.module.css'

import type { ReactNode } from 'react'

export type BaseModalProps = {
  isOpen: boolean
  title: string
  icon?: ReactNode
  children?: ReactNode
  description?: string
  actions?: ReactNode
  onClose: () => void
}

/* NOTE: Narrower than the VKUI small tablet breakpoint the card takes the screen width */
const NARROW_SCREEN_QUERY = '(max-width: 767.98px)'

export const BaseModal = ({ isOpen, title, icon, description, children, onClose, actions }: BaseModalProps) => {
  const isNarrowScreen = useMediaQuery(NARROW_SCREEN_QUERY)

  return (
    <ModalRoot activeModal={isOpen ? 'modal-card' : null} usePortal onClose={onClose}>
      <ModalCard
        actions={actions}
        className={styles.baseModal}
        description={description}
        dismissButtonMode='inside'
        icon={icon}
        id='modal-card'
        open={isOpen}
        size={isNarrowScreen ? undefined : 900}
        title={title}
        onClose={onClose}
      >
        {children}
      </ModalCard>
    </ModalRoot>
  )
}
