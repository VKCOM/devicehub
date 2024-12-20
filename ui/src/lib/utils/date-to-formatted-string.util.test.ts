import { dateToFormattedString } from './date-to-formatted-string.util'

describe('dateToFormattedString util', () => {
  test('only date', () => {
    expect(dateToFormattedString({ value: '2024-12-19T08:09:59.291Z' })).toBe('19 December 2024')
  })

  test('needTime arg', () => {
    expect(dateToFormattedString({ value: '2024-12-19T08:09:59.291Z', needTime: true })).toBe('19 December 2024 08:09')
  })

  test('onlyTime arg', () => {
    expect(dateToFormattedString({ value: '2024-12-19T08:09:59.291Z', onlyTime: true })).toBe('08:09')
  })

  test('needTime & onlyTime args', () => {
    expect(dateToFormattedString({ value: '2024-12-19T08:09:59.291Z', needTime: true, onlyTime: true })).toBe('08:09')
  })
})
