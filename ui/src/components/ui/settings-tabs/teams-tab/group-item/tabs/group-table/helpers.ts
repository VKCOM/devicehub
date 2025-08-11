import type { Row } from '@tanstack/react-table'
import type { DataWithGroupStatus } from '@/types/data-with-group-status.type'

export const isInGroupSorting = <T>(
  rowA: Row<DataWithGroupStatus<T>>,
  rowB: Row<DataWithGroupStatus<T>>,
  columnId: string
): number => {
  const isInGroupA = rowA.getValue<boolean>(columnId)
  const isInGroupB = rowB.getValue<boolean>(columnId)

  return Number(isInGroupB) - Number(isInGroupA)
}
