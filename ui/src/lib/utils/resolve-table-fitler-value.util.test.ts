import { resolveTableFilterValue } from './resolve-table-filter-value.util'

describe('resolveFilterValue', () => {
  test('version column filter', () => {
    expect(resolveTableFilterValue('version:2')).toEqual({
      globalFilter: '',
      columnFilters: [
        {
          id: 'version',
          value: '2',
        },
      ],
    })
  })

  test('complex case', () => {
    expect(
      resolveTableFilterValue(
        'Android state: available model:"ATD built for x86_64" serial: "10.154.62.198:3389" version:"2" sdk test:'
      )
    ).toEqual({
      globalFilter: 'Android sdk',
      columnFilters: [
        {
          id: 'state',
          value: 'available',
        },
        {
          id: 'model',
          value: 'ATD built for x86_64',
        },
        {
          id: 'serial',
          value: '10.154.62.198:3389',
        },
        {
          id: 'version',
          value: '2',
        },
      ],
    })
  })

  test('global filter', () => {
    expect(resolveTableFilterValue('version')).toEqual({
      globalFilter: 'version',
      columnFilters: [],
    })
  })

  test('empty column filter', () => {
    expect(resolveTableFilterValue('version:')).toEqual({
      globalFilter: '',
      columnFilters: [],
    })
  })

  test('column filter with space', () => {
    expect(resolveTableFilterValue('version: 2')).toEqual({
      globalFilter: '',
      columnFilters: [
        {
          id: 'version',
          value: '2',
        },
      ],
    })
  })

  test('column filter phrase', () => {
    expect(resolveTableFilterValue('model: "ATD built for x86_64"')).toEqual({
      globalFilter: '',
      columnFilters: [
        {
          id: 'model',
          value: 'ATD built for x86_64',
        },
      ],
    })
  })

  test('both global and column filters', () => {
    expect(resolveTableFilterValue('version:2 Android')).toEqual({
      globalFilter: 'Android',
      columnFilters: [
        {
          id: 'version',
          value: '2',
        },
      ],
    })
  })

  test('global and 2 column filters', () => {
    expect(resolveTableFilterValue('model:sdk_gphone_x86_64 Android version:2')).toEqual({
      globalFilter: 'Android',
      columnFilters: [
        {
          id: 'model',
          value: 'sdk_gphone_x86_64',
        },
        {
          id: 'version',
          value: '2',
        },
      ],
    })
  })

  test('2 global and 1 column filter', () => {
    expect(resolveTableFilterValue('Android version:2 iOS')).toEqual({
      globalFilter: 'Android iOS',
      columnFilters: [
        {
          id: 'version',
          value: '2',
        },
      ],
    })

    expect(resolveTableFilterValue('Android version: iOS')).toEqual({
      globalFilter: 'Android',
      columnFilters: [
        {
          id: 'version',
          value: 'iOS',
        },
      ],
    })

    expect(resolveTableFilterValue('Android version iOS')).toEqual({
      globalFilter: 'Android version iOS',
      columnFilters: [],
    })
  })

  test('empty global filter', () => {
    expect(resolveTableFilterValue('')).toEqual({
      globalFilter: '',
      columnFilters: [],
    })
  })

  test('serial global filter', () => {
    expect(resolveTableFilterValue('10.154.62.198:3389')).toEqual({
      globalFilter: '10.154.62.198:3389',
      columnFilters: [],
    })
  })
})
