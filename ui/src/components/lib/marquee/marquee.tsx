import cn from 'classnames'
import { DisplayTitle, useColorScheme } from '@vkontakte/vkui'

import styles from './marquee.module.css'

import type { ReactNode } from 'react'
import type { MarqueeVariant } from './types'

const MARQUEE_COLOR_MAP: Record<MarqueeVariant, string> = {
  ['Error']: styles.critical,
  ['Warn']: styles.warning,
  ['Info']: styles.information,
}

type MarqueeProps = {
  children: ReactNode
  variant: MarqueeVariant
}

export const Marquee = ({ children, variant }: MarqueeProps) => {
  const colorScheme = useColorScheme()

  return (
    <div className={cn(styles.marquee, MARQUEE_COLOR_MAP[variant])}>
      <DisplayTitle className={cn(styles.text, { [styles.lightColor]: colorScheme === 'light' })} level='3'>
        {children}
      </DisplayTitle>
      <DisplayTitle className={cn(styles.text, { [styles.lightColor]: colorScheme === 'light' })} level='3'>
        {children}
      </DisplayTitle>
    </div>
  )
}
