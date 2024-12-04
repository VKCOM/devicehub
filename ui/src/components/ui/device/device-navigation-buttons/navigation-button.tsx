import { Button } from '@vkontakte/vkui'

import styles from './device-navigation-buttons.module.css'

import type { ReactNode } from 'react'

type NavigationButtonProps = {
  beforeIcon: ReactNode
  title: string
  onClick: () => void
}

export const NavigationButton = ({ title, beforeIcon, onClick }: NavigationButtonProps) => (
  <Button
    appearance='neutral'
    before={beforeIcon}
    borderRadiusMode='inherit'
    className={styles.navigationButton}
    mode='tertiary'
    title={title}
    onClick={onClick}
  />
)
