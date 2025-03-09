import cn from 'classnames'
import { flexRender } from '@tanstack/react-table'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

import { isDeviceInactive } from '@/lib/utils/is-device-inactive.util'

import { ROW_HEIGHT } from './constants'

import styles from './device-table.module.css'

import type { Row } from '@tanstack/react-table'
import type { DeviceState } from '@/types/enums/device-state.enum'
import type { ListDevice } from '@/types/list-device.type'

type TableBodyProps = {
  rows: Row<ListDevice>[]
}

export const TableBody = ({ rows }: TableBodyProps) => {
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    scrollMargin: 0,
  })

  return (
    <tbody>
      {virtualizer.getVirtualItems().map((virtualRow, index) => {
        const row = rows[virtualRow.index]
        const deviceState = row.getValue<DeviceState>('state')

        return (
          <tr
            key={row.id}
            className={cn({
              [styles.inactive]: deviceState && isDeviceInactive(deviceState),
            })}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start - index * virtualRow.size}px)`,
            }}
          >
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                style={{
                  width: `${cell.column.getSize()}px`,
                }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        )
      })}
    </tbody>
  )
}
