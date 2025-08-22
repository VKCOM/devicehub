import type { Row } from '@tanstack/react-table'
import type { DataWithTeamStatus } from '@/types/data-with-team-status.type'

export const isInTeamSorting = <T>(
  rowA: Row<DataWithTeamStatus<T>>,
  rowB: Row<DataWithTeamStatus<T>>,
  columnId: string
): number => {
  const isInTeamA = rowA.getValue<boolean>(columnId)
  const isInTeamB = rowB.getValue<boolean>(columnId)

  return Number(isInTeamB) - Number(isInTeamA)
}
