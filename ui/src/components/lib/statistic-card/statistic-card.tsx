import { ContentBadge, Counter, Skeleton, Spacing } from '@vkontakte/vkui'
import cn from 'classnames'
import {
  Icon28CheckCircleDeviceOutline,
  Icon28Users3Outline,
  Icon28UserCircleOutline,
  Icon28DevicesOutline,
} from '@vkontakte/icons'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { StatisticCardIcon } from './types'

import styles from './statistic-card.module.css'

const STATISTIC_ICON_MAP = {
  [StatisticCardIcon.DEVICES_OUTLINE]: <Icon28DevicesOutline height={20} width={20} />,
  [StatisticCardIcon.CHECK_CIRCLE_DEVICE_OUTLINE]: <Icon28CheckCircleDeviceOutline height={20} width={20} />,
  [StatisticCardIcon.USERS_OUTLINE]: <Icon28Users3Outline height={20} width={20} />,
  [StatisticCardIcon.USER_CIRCLE_OUTLINE]: <Icon28UserCircleOutline height={20} width={20} />,
}

type StatisticCardProps = {
  icon?: StatisticCardIcon
  text?: string
  value?: string | number
  className?: string
}

export const StatisticCard = ({
  text,
  value,
  className,
  icon = StatisticCardIcon.DEVICES_OUTLINE,
}: StatisticCardProps) => (
  <ContentBadge
    appearance='neutral'
    capsule={false}
    className={cn(className, styles.statisticCard)}
    mode='primary'
    size='l'
  >
    <ContentBadge.SlotIcon>{STATISTIC_ICON_MAP[icon]}</ContentBadge.SlotIcon>
    <Spacing />
    <ConditionalRender conditions={[!!text]}>{text}</ConditionalRender>
    <ConditionalRender conditions={[!text]}>
      <Skeleton height={18} width={120} />
    </ConditionalRender>
    <Spacing />
    <ConditionalRender conditions={[value !== undefined]}>
      <Counter mode='secondary' size='s'>
        {value}
      </Counter>
    </ConditionalRender>
    <ConditionalRender conditions={[value === undefined]}>
      <Skeleton borderRadius='50%' height={18} width={18} />
    </ConditionalRender>
  </ContentBadge>
)
