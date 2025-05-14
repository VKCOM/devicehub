import { memo } from 'react'
import cn from 'classnames'
import { flexRender } from '@tanstack/react-table'

import { isDeviceInactive } from '@/lib/utils/is-device-inactive.util'

import styles from './device-table.module.css'

import type { Cell, VisibilityState } from '@tanstack/react-table'
import type { DeviceState } from '@/types/enums/device-state.enum'
import type { DeviceTableRow } from '@/types/device-table-row.type'

type TableRowProps = {
  cells: Cell<DeviceTableRow, unknown>[]
  rowSize: number
  transformValue: number
  deviceState: DeviceState
  isDataLoaded: boolean
  columnVisibility: VisibilityState
  needUpdate?: number
}

export const TableRow = memo(
  ({ cells, deviceState, rowSize, transformValue }: TableRowProps) => (
    <tr
      id='deviceTableRow'
      className={cn({
        [styles.inactive]: deviceState && isDeviceInactive(deviceState),
      })}
      style={{
        height: `${rowSize}px`,
        transform: `translateY(${transformValue}px)`,
      }}
    >
      {cells.map((cell) => (
        <td
          key={cell.id}
          id='deviceTableCell'
          style={{
            width: `${cell.column.getSize()}px`,
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  ),
  (prevProps, nextProps) =>
    prevProps.needUpdate === nextProps.needUpdate &&
    prevProps.deviceState === nextProps.deviceState &&
    prevProps.isDataLoaded === nextProps.isDataLoaded &&
    prevProps.transformValue === nextProps.transformValue &&
    prevProps.columnVisibility === nextProps.columnVisibility
)
