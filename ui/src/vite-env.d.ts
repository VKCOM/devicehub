/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

import '@tanstack/react-query'
import '@tanstack/react-table'

import type { ColumnGroup } from '@/types/column-group.type'

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: AxiosError
  }
}

declare module '@tanstack/react-table' {
  interface FilterFns {
    fuzzy: FilterFn<unknown>
  }
  interface FilterMeta {
    itemRank: RankingInfo
  }
  interface ColumnMeta {
    columnName: string
    columnGroup: ColumnGroup
  }
}
