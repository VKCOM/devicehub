import { format } from 'date-fns'

export const dateToFormattedString = (value: Date | string, needTime: boolean = false): string => {
  if (!value) return ''

  return format(value, needTime ? 'dd MMMM yyyy HH:mm' : 'dd MMMM yyyy')
}
