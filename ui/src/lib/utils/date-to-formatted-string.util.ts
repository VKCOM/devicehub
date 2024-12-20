import { format } from 'date-fns'

type DateToFormattedString = {
  value: Date | string
  needTime?: boolean
  onlyTime?: boolean
}

export const dateToFormattedString = ({ value, needTime = false, onlyTime = false }: DateToFormattedString): string => {
  if (!value) return ''

  if (onlyTime) return format(value, 'HH:mm')

  return format(value, needTime ? 'dd MMMM yyyy HH:mm' : 'dd MMMM yyyy')
}
