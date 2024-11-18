import type { ReactNode } from 'react'

export type ConditionalRenderProps = {
  conditions: boolean[]
  children: ReactNode
}

export const ConditionalRender = ({ conditions, children }: ConditionalRenderProps) => {
  const shouldRender = conditions.every((condition) => condition)

  return <>{shouldRender && children}</>
}
