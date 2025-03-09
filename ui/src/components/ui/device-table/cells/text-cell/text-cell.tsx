import { memo } from 'react'
import { Tappable, EllipsisText } from '@vkontakte/vkui'

import { CellWithEmptyValue } from '../cell-with-empty-value'

import styles from './text-cell.module.css'

type TextCellProps = {
  textValue?: string | null
}

export const TextCell = memo(({ textValue }: TextCellProps) => {
  const onCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <CellWithEmptyValue value={textValue}>
      <Tappable className={styles.tappable} hasHover={false} onClick={() => onCopyText(textValue || '')}>
        <EllipsisText maxLines={3}>{textValue}</EllipsisText>
      </Tappable>
    </CellWithEmptyValue>
  )
})
