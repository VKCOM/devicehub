import { useLayoutEffect, useRef } from 'react'

import { StickyTableHeader } from '@/services/sticky-table-header'

import styles from './table-with-sticky-header.module.css'

import type { ReactNode } from 'react'

type TableWithStickyHeaderProps = {
  children: ReactNode
  offsetTop: number
  tableHeight?: string
  className?: string
}

export const TableWithStickyHeader = ({ children, offsetTop, tableHeight, className }: TableWithStickyHeaderProps) => {
  const tableRef = useRef<HTMLTableElement>(null)
  const tableCloneRef = useRef<HTMLTableElement>(null)

  useLayoutEffect(() => {
    if (tableRef.current && tableCloneRef.current) {
      const sticky = new StickyTableHeader(tableRef.current, tableCloneRef.current, { max: offsetTop })

      return () => sticky.destroy()
    }

    return undefined
  }, [])

  return (
    <>
      <div className={styles.tableContainer} style={{ height: tableHeight }}>
        <table ref={tableRef} className={className}>
          {children}
        </table>
      </div>
      <div className={styles.tableContainer}>
        <table ref={tableCloneRef} className={className} />
      </div>
    </>
  )
}
