import type { ColumnFilter } from '@tanstack/react-table'

type ResolveTableFilterValueReturn = {
  globalFilter: string
  columnFilters: ColumnFilter[]
}

export const resolveTableFilterValue = (value: string): ResolveTableFilterValueReturn => {
  let globalFilter = ''
  const columnFilters: ColumnFilter[] = []

  if (!value.includes(':')) {
    globalFilter = value

    return { globalFilter, columnFilters }
  }

  const splitValue = value.match(/(?:\w+:\s?\w+|\w+:\s?['"][^'"]*['"]|[^\s]+)/g)

  if (!splitValue) return { globalFilter, columnFilters }

  splitValue.forEach((item) => {
    const indexOfColon = item.indexOf(':')

    const filterId = item.slice(0, indexOfColon).trim()
    const filterValue = item
      .slice(indexOfColon + 1)
      .replace(/['"]/g, '')
      .trim()

    const isFilterIdContainsOnlyLetters = /^[a-zA-Z]+$/.test(filterId)

    if (indexOfColon === -1 || !isFilterIdContainsOnlyLetters) {
      globalFilter += ' ' + item

      return
    }

    if (indexOfColon && filterId && !filterValue) return

    if (indexOfColon && filterId && filterValue) {
      columnFilters.push({
        id: filterId,
        value: filterValue,
      })
    }
  })

  return { globalFilter: globalFilter.trim(), columnFilters }
}
