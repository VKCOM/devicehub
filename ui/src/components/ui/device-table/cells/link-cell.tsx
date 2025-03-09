import { memo } from 'react'
import { Link } from 'react-router'
import { Button, EllipsisText } from '@vkontakte/vkui'

import { CellWithEmptyValue } from './cell-with-empty-value'

type LinkCellProps = {
  url?: string | null
  text?: string
}

export const LinkCell = memo(({ url, text }: LinkCellProps) => (
  <CellWithEmptyValue value={text}>
    <Link to={url || ''}>
      <Button align='left' disabled={!url} mode='link' size='m'>
        <EllipsisText maxLines={3}>{text}</EllipsisText>
      </Button>
    </Link>
  </CellWithEmptyValue>
))
