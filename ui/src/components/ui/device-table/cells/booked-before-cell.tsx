import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisText } from '@vkontakte/vkui'

import { dateToFormattedString } from '@/lib/utils/date-to-formatted-string.util'

import type { Device } from '@/generated/types'

const getExpireTime = (statusChangedAt: string, bookedBefore: number) =>
  new Date(new Date(statusChangedAt).getTime() + bookedBefore)

type BookedBeforeCellProps = {
  bookedBefore: Device['bookedBefore']
  statusChangedAt: Device['statusChangedAt']
}

export const BookedBeforeCell = memo(({ bookedBefore, statusChangedAt }: BookedBeforeCellProps) => {
  const { t } = useTranslation()

  return (
    <EllipsisText>
      {bookedBefore && statusChangedAt
        ? dateToFormattedString(getExpireTime(statusChangedAt, bookedBefore), true)
        : t('Not booked')}
    </EllipsisText>
  )
})
