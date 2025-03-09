import { ConditionalRender } from '@/components/lib/conditional-render'

import type { ReactNode } from 'react'

type CellWithEmptyValueProps = {
  value?: number | string | null
  children: ReactNode
}

export const CellWithEmptyValue = ({ value, children }: CellWithEmptyValueProps) => (
  <>
    <ConditionalRender conditions={[!!value]}>{children}</ConditionalRender>
    <ConditionalRender conditions={[!value]}>
      <span>&mdash;</span>
    </ConditionalRender>
  </>
)
