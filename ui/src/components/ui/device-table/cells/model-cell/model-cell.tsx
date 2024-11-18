import { EllipsisText } from '@vkontakte/vkui'
import { memo } from 'react'
import { Icon56AndroidDeviceOutline, Icon56AppleDeviceOutline, Icon56DevicesOutline } from '@vkontakte/icons'

import styles from './model-cell.module.css'

import type { ReactElement } from 'react'
import type { Device } from '@/generated/types'

enum PlatformIcon {
  ANDROID = 'Android',
  IOS = 'iOS',
  TV_OS = 'tvOS',
}

const PLATFORM_ICON_MAP: Record<string, ReactElement> = {
  [PlatformIcon.ANDROID]: <Icon56AndroidDeviceOutline className={styles.icon} height={25} width={25} />,
  [PlatformIcon.IOS]: <Icon56AppleDeviceOutline className={styles.icon} height={25} width={25} />,
  [PlatformIcon.TV_OS]: <Icon56DevicesOutline className={styles.icon} height={25} width={25} />,
}

type ModelCellProps = {
  model: Device['model']
  platform: Device['platform']
}

export const ModelCell = memo(({ model, platform }: ModelCellProps) => (
  <div className={styles.modelCell}>
    {platform && PLATFORM_ICON_MAP[platform]}
    <EllipsisText>{model}</EllipsisText>
  </div>
))
