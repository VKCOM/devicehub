/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

import '@tanstack/react-query'
import '@tanstack/react-table'
import 'reflect-metadata'

import type { ColumnGroup } from '@/types/column-group.type'

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: AxiosError
  }
}

declare module '@tanstack/react-table' {
  interface TableOptions<TData extends RowData>
    extends PartialKeys<TableOptionsResolved<TData>, 'state' | 'onStateChange' | 'renderFallbackValue'> {
    filterFns?: FilterFns
  }

  interface FilterFns {
    fuzzy: FilterFn<unknown>
  }
  interface FilterMeta {
    itemRank: RankingInfo
  }
  interface ColumnMeta {
    columnName?: string
    columnGroup?: ColumnGroup
    filterPlaceholder?: string
  }
}

// W3C Spec Draft http://wicg.github.io/netinfo/
// Edition: Draft Community Group Report 20 February 2019

declare global {
  interface Navigator {
    readonly connection?: NetworkInformation
  }

  interface WorkerNavigator {
    readonly connection?: NetworkInformation
  }

  interface Element {
    _save_scroll?: number
  }

  interface Window {
    _save_scroll?: number
  }
}

// http://wicg.github.io/netinfo/#connection-types
type ConnectionType = 'bluetooth' | 'cellular' | 'ethernet' | 'mixed' | 'none' | 'other' | 'unknown' | 'wifi' | 'wimax'
// http://wicg.github.io/netinfo/#effectiveconnectiontype-enum
type EffectiveConnectionType = '2g' | '3g' | '4g' | 'slow-2g'
// http://wicg.github.io/netinfo/#dom-megabit
type Megabit = number
// http://wicg.github.io/netinfo/#dom-millisecond
type Millisecond = number

// http://wicg.github.io/netinfo/#networkinformation-interface
interface NetworkInformation extends EventTarget {
  // http://wicg.github.io/netinfo/#type-attribute
  readonly type?: ConnectionType
  // http://wicg.github.io/netinfo/#effectivetype-attribute
  readonly effectiveType?: EffectiveConnectionType
  // http://wicg.github.io/netinfo/#downlinkmax-attribute
  readonly downlinkMax?: Megabit
  // http://wicg.github.io/netinfo/#downlink-attribute
  readonly downlink?: Megabit
  // http://wicg.github.io/netinfo/#rtt-attribute
  readonly rtt?: Millisecond
  // http://wicg.github.io/netinfo/#savedata-attribute
  readonly saveData?: boolean
  // http://wicg.github.io/netinfo/#handling-changes-to-the-underlying-connection
  onchange?: EventListener
}
