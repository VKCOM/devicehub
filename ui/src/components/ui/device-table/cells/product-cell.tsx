import { Link } from 'react-router'
import { Button } from '@vkontakte/vkui'
import { memo } from 'react'

import { getControlRoute } from '@/constants/route-paths'

import type { Device } from '@/generated/types'

type ProductCellProps = {
  product: Device['product']
  serial: Device['serial']
  isDisabled?: boolean
}

export const ProductCell = memo(({ product, serial, isDisabled = false }: ProductCellProps) => (
  <>
    {serial && (
      <Link to={getControlRoute(serial)}>
        <Button disabled={isDisabled} mode='link' size='m'>
          {product}
        </Button>
      </Link>
    )}
  </>
))
