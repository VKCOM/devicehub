import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { MiniInfoCell } from '@vkontakte/vkui'

import { BookingService } from '@/services/booking-service'

import { dateToFormattedString } from '@/lib/utils/date-to-formatted-string.util'
import { useServiceLocator } from '@/lib/hooks/use-service-locator.hook'

export const DeviceBookingControl = observer(() => {
  const { t } = useTranslation()

  const bookingService = useServiceLocator<BookingService>(BookingService.name)

  return (
    <MiniInfoCell>
      {t('Booked before')}
      {': '}
      <time>{dateToFormattedString({ value: bookingService?.bookedBeforeTime || '', onlyTime: true })}</time>
    </MiniInfoCell>
  )
})
