import { Link } from 'react-router'
import { Button, EllipsisText } from '@vkontakte/vkui'
import { memo } from 'react'

import { getControlRoute } from '@/constants/route-paths'

import { CellWithEmptyValue } from './cell-with-empty-value'

import type { ListDevice } from '@/types/list-device.type'

type ProductCellProps = {
  product: ListDevice['product']
  serial: ListDevice['serial']
  isDisabled?: boolean
}

export const ProductCell = memo(({ product, serial, isDisabled = false }: ProductCellProps) => (
  <CellWithEmptyValue value={product}>
    <Link to={getControlRoute(serial)}>
      <Button align='left' disabled={isDisabled} mode='link' size='m'>
        <EllipsisText maxLines={3}>{product}</EllipsisText>
      </Button>
    </Link>
  </CellWithEmptyValue>
))
