import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisText } from '@vkontakte/vkui'

type BookedBeforeCellProps = {
  formattedDate?: string
}

export const BookedBeforeCell = memo(({ formattedDate }: BookedBeforeCellProps) => {
  const { t } = useTranslation()

  return <EllipsisText maxLines={3}>{formattedDate ? formattedDate : t('Not booked')}</EllipsisText>
})
