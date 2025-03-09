import { memo } from 'react'
import { EllipsisText, Flex } from '@vkontakte/vkui'
import { Icon56AndroidDeviceOutline, Icon56AppleDeviceOutline, Icon56DevicesOutline } from '@vkontakte/icons'

import { CellWithEmptyValue } from '../cell-with-empty-value'

import styles from './model-cell.module.css'

import type { ReactElement } from 'react'
import type { ListDevice } from '@/types/list-device.type'

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
  model: ListDevice['model']
  platform: ListDevice['platform']
}

export const ModelCell = memo(({ model, platform }: ModelCellProps) => (
  <Flex align='center' justify='start' noWrap>
    <CellWithEmptyValue value={model}>
      <span>{platform && PLATFORM_ICON_MAP[platform]}</span>
      <EllipsisText maxLines={3}>{model}</EllipsisText>
    </CellWithEmptyValue>
  </Flex>
))
