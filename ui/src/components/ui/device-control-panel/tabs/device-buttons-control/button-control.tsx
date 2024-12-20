import { cloneElement } from 'react'
import cn from 'classnames'
import { Button, Tooltip } from '@vkontakte/vkui'

import styles from './device-buttons-control.module.css'

import type { ReactElement } from 'react'

type ButtonControlProps = {
  icon?: ReactElement
  iconWidth?: number
  iconHeight?: number
  tooltipText: string
  children?: string
  className?: string
  appearance?: 'accent' | 'neutral' | 'positive' | 'negative' | 'overlay' | 'accent-invariable'
  onClick?: () => void
}

export const ButtonControl = ({
  icon,
  appearance,
  children,
  tooltipText,
  className,
  onClick,
  iconWidth = 20,
  iconHeight = 20,
}: ButtonControlProps) => (
  <Tooltip appearance='accent' description={tooltipText} offsetByMainAxis={2} placement='top'>
    <Button
      appearance={appearance}
      before={icon ? cloneElement(icon, { width: iconWidth, height: iconHeight }) : undefined}
      className={cn(styles.buttonTooltip, className)}
      label={tooltipText}
      mode='secondary'
      onClick={onClick}
    >
      {children}
    </Button>
  </Tooltip>
)
