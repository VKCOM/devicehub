import { Tappable, EllipsisText } from '@vkontakte/vkui'
import { memo } from 'react'

import styles from './text-cell.module.css'

type TextCellProps = {
  textValue?: string | null
}

export const TextCell = memo(({ textValue }: TextCellProps) => {
  const onCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <>
      {textValue && (
        <Tappable className={styles.tappable} hasHover={false} onClick={() => onCopyText(textValue)}>
          <EllipsisText>{textValue}</EllipsisText>
        </Tappable>
      )}
    </>
  )
})
