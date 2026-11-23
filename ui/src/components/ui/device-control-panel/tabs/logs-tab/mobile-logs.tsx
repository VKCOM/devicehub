import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, Input, Placeholder, SegmentedControl } from '@vkontakte/vkui'
import {
  Icon24ArrowDownOutline,
  Icon24ArrowUpOutline,
  Icon24DeleteOutline,
  Icon24DownloadOutline,
  Icon24Filter,
  Icon24Play,
  Icon24Stop,
} from '@vkontakte/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getCoreRowModel, getFilteredRowModel, useReactTable } from '@tanstack/react-table'

import { SaveLogsModal } from '@/components/ui/modals'
import { fuzzyFilter } from '@/components/ui/device-table/helpers'

import { logsTableState } from '@/store/logs-table-state'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { LogPriority } from '@/types/enums/log-priority.enum'
import { timestampToTimeString } from '@/lib/utils/timestamp-to-time-string.util'

import { LOGS_COLUMNS } from './logs-table/columns'
import { LogsTableColumnIds } from './logs-table/types'

import styles from './mobile-logs.module.css'

const PRIORITY_LETTER: Partial<Record<LogPriority, string>> = {
  [LogPriority.VERBOSE]: 'V',
  [LogPriority.DEBUG]: 'D',
  [LogPriority.INFO]: 'I',
  [LogPriority.WARN]: 'W',
  [LogPriority.ERROR]: 'E',
  [LogPriority.FATAL]: 'F',
}

const PRIORITY_CLASS: Partial<Record<LogPriority, string>> = {
  [LogPriority.VERBOSE]: styles.verbose,
  [LogPriority.DEBUG]: styles.debug,
  [LogPriority.INFO]: styles.info,
  [LogPriority.WARN]: styles.warn,
  [LogPriority.ERROR]: styles.error,
  [LogPriority.FATAL]: styles.error,
}

const PRIORITY_FILTERS = [LogPriority.VERBOSE, LogPriority.DEBUG, LogPriority.INFO, LogPriority.WARN, LogPriority.ERROR]

/* NOTE: Pixels from the bottom within which the list keeps following new lines */
const FOLLOW_THRESHOLD = 48
/* NOTE: A two-line row; real heights are measured, long messages wrap to more lines */
const ESTIMATED_ROW_HEIGHT = 52

/* NOTE: Where the scrolled log is, for the jump buttons; "none" while everything fits */
type ScrollPosition = 'none' | 'top' | 'middle' | 'bottom'

const getScrollPosition = (element: HTMLElement): ScrollPosition => {
  const scrollable = element.scrollHeight - element.clientHeight

  if (scrollable < FOLLOW_THRESHOLD) return 'none'

  if (element.scrollTop < FOLLOW_THRESHOLD) return 'top'

  if (scrollable - element.scrollTop < FOLLOW_THRESHOLD) return 'bottom'

  return 'middle'
}

const getScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  let node = element?.parentElement ?? null

  while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement

  return node
}

/* Logcat for a phone: two-line rows and a sticky toolbar, the same store and filters as the desktop table */
export const MobileLogs = observer(() => {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const [isFiltersShown, setIsFiltersShown] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>('none')

  const logcatService = useInjection(CONTAINER_IDS.logcatService)

  const table = useReactTable({
    data: logcatService.visibleLogs,
    columns: LOGS_COLUMNS,
    state: {
      columnFilters: logsTableState.columnFilters,
      globalFilter: logsTableState.globalFilter,
    },
    onColumnFiltersChange: logsTableState.setColumnFilters,
    onGlobalFilterChange: logsTableState.setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    globalFilterFn: 'fuzzy',
    filterFns: {
      fuzzy: fuzzyFilter,
    },
  })

  const rows = table.getRowModel().rows
  const priorityColumn = table.getColumn(LogsTableColumnIds.PRIORITY)
  const tagColumn = table.getColumn(LogsTableColumnIds.TAG)
  const pidColumn = table.getColumn(LogsTableColumnIds.PID)

  /*
   * NOTE: Only the rows on screen are in the DOM: logcat streams thousands of lines, and every new
   * one re-rendered the whole list. The sheet body is the scroll element, the toolbar and the
   * filters above the list are its scroll margin.
   */
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)
  const [listOffset, setListOffset] = useState(0)

  useLayoutEffect(() => {
    setScrollParent(getScrollParent(listRef.current))
  }, [])

  useLayoutEffect(() => {
    if (!scrollParent || !listRef.current) return

    setListOffset(
      listRef.current.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
    )
  }, [scrollParent, isFiltersShown])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  })

  /* NOTE: Follow new lines while the list is scrolled to its end */
  const lastRowId = rows[rows.length - 1]?.id

  useEffect(() => {
    if (!scrollParent) return

    const distance = scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight

    if (distance < FOLLOW_THRESHOLD * 4) scrollParent.scrollTop = scrollParent.scrollHeight
  }, [lastRowId, scrollParent])

  useEffect(() => {
    if (!scrollParent) return undefined

    const update = () => setScrollPosition(getScrollPosition(scrollParent))

    update()
    scrollParent.addEventListener('scroll', update, { passive: true })

    return () => scrollParent.removeEventListener('scroll', update)
  }, [scrollParent])

  useEffect(() => {
    if (scrollParent) setScrollPosition(getScrollPosition(scrollParent))
  }, [rows.length, scrollParent])

  const scrollTo = (edge: 'top' | 'bottom') => {
    scrollParent?.scrollTo({ top: edge === 'top' ? 0 : scrollParent.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className={styles.mobileLogs}>
      <div className={styles.toolbar}>
        {/* NOTE: The icon says it all, the search gets the width */}
        {logcatService.isLogcatStarted ? (
          <Button
            appearance='negative'
            aria-label={t('Stop')}
            before={<Icon24Stop height={20} width={20} />}
            className={styles.startButton}
            mode='secondary'
            size='l'
            onClick={() => logcatService.stopLogcat()}
          />
        ) : (
          <Button
            aria-label={t('Start')}
            before={<Icon24Play height={20} width={20} />}
            className={styles.startButton}
            size='l'
            onClick={() => logcatService.startLogcat()}
          />
        )}
        <Input
          aria-label={t('Search logs')}
          className={styles.search}
          placeholder={t('Search')}
          value={logsTableState.globalFilter}
          onChange={(event) => logsTableState.setGlobalFilter(event.target.value)}
        />
        <button
          aria-label={t('Filters')}
          aria-pressed={isFiltersShown}
          className={styles.toolButton}
          type='button'
          onClick={() => setIsFiltersShown(!isFiltersShown)}
        >
          <Icon24Filter />
        </button>
        <button
          aria-label={t('Clear')}
          className={styles.toolButton}
          disabled={logcatService.isLogsEmpty}
          type='button'
          onClick={() => logcatService.clearLogs()}
        >
          <Icon24DeleteOutline />
        </button>
        <button
          aria-label={t('Export')}
          className={styles.toolButton}
          disabled={logcatService.isLogsEmpty}
          type='button'
          onClick={() => setIsModalOpen(true)}
        >
          <Icon24DownloadOutline />
        </button>
      </div>
      {isFiltersShown && (
        <div className={styles.filters}>
          <SegmentedControl
            // NOTE: The desktop filter semantics: Verbose shows all lines, any other level only its own
            value={(priorityColumn?.getFilterValue() as LogPriority | undefined) ?? LogPriority.VERBOSE}
            options={PRIORITY_FILTERS.map((priority) => ({
              label: priority === LogPriority.VERBOSE ? t('All') : PRIORITY_LETTER[priority],
              value: priority,
            }))}
            onChange={(value) => priorityColumn?.setFilterValue(Number(value))}
          />
          <div className={styles.filterRow}>
            <Input
              aria-label={t('Tag')}
              placeholder={t('Tag')}
              value={(tagColumn?.getFilterValue() as string | undefined) ?? ''}
              onChange={(event) => tagColumn?.setFilterValue(event.target.value)}
            />
            <Input
              aria-label={t('Pid')}
              inputMode='numeric'
              placeholder={t('Pid')}
              value={(pidColumn?.getFilterValue() as string | undefined) ?? ''}
              onChange={(event) => pidColumn?.setFilterValue(event.target.value)}
            />
          </div>
        </div>
      )}
      <div
        ref={listRef}
        className={styles.list}
        style={rows.length ? { height: virtualizer.getTotalSize() } : undefined}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          const log = row.original

          return (
            <div
              key={row.id}
              ref={virtualizer.measureElement}
              className={cn(styles.row, PRIORITY_CLASS[log.priority], { [styles.firstRow]: item.index === 0 })}
              data-index={item.index}
              style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
            >
              <div className={styles.meta}>
                <span className={styles.level}>{PRIORITY_LETTER[log.priority] ?? '?'}</span>
                {timestampToTimeString(log.date)}
                <b>{log.tag}</b>
                {log.pid}
              </div>
              <div className={styles.message}>{log.message}</div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <Placeholder className={styles.placeholder}>
            {logcatService.isLogsEmpty && logcatService.isLogcatStarted && t('Waiting for logs')}
            {logcatService.isLogsEmpty &&
              !logcatService.isLogcatStarted &&
              t('No lines. Press Start to stream logcat.')}
            {!logcatService.isLogsEmpty && t('Empty')}
          </Placeholder>
        )}
      </div>
      {scrollPosition !== 'none' && (
        <div className={styles.jump}>
          <div className={styles.jumpButtons}>
            {scrollPosition !== 'top' && (
              <button
                aria-label={t('Scroll to the first line')}
                className={styles.jumpButton}
                type='button'
                onClick={() => scrollTo('top')}
              >
                <Icon24ArrowUpOutline />
              </button>
            )}
            {scrollPosition !== 'bottom' && (
              <button
                aria-label={t('Scroll to the last line')}
                className={styles.jumpButton}
                type='button'
                onClick={() => scrollTo('bottom')}
              >
                <Icon24ArrowDownOutline />
              </button>
            )}
          </div>
        </div>
      )}
      <SaveLogsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
})
