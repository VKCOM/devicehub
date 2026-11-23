import { cloneElement } from 'react'
import cn from 'classnames'
import { Button, Tooltip } from '@vkontakte/vkui'

import { useIsMobileControl } from '@/lib/hooks/use-is-mobile-control.hook'

import styles from './device-buttons-control.module.css'

import type { ReactElement } from 'react'

type ButtonControlProps = {
  icon?: ReactElement
  iconWidth?: number
  iconHeight?: number
  tooltipText: string
  /* NOTE: On a phone the icon is enough (media keys), the name stays for screen readers */
  isIconOnly?: boolean
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
  isIconOnly = false,
  className,
  onClick,
  iconWidth = 20,
  iconHeight = 20,
}: ButtonControlProps) => {
  // NOTE: 44px labelled buttons on a phone
  const isMobileControl = useIsMobileControl()

  if (isMobileControl) {
    return (
      <Button
        align='center'
        appearance={appearance}
        aria-label={isIconOnly ? tooltipText : undefined}
        before={icon ? cloneElement(icon, { width: iconWidth, height: iconHeight }) : undefined}
        className={styles.mobileButton}
        mode='secondary'
        size='l'
        stretched
        onClick={onClick}
      >
        {/* NOTE: The tooltip text is the full name ("Disable DKA"), the desktop short label relies on styling */}
        {isIconOnly ? undefined : tooltipText}
      </Button>
    )
  }

  return (
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
}
