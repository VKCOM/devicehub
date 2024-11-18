import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@vkontakte/vkui'

type LinkCellProps = {
  url?: string | null
  text?: string
}

export const LinkCell = memo(({ url, text }: LinkCellProps) => (
  <Link to={url || ''}>
    <Button disabled={!url} mode='link' size='m'>
      {text}
    </Button>
  </Link>
))
