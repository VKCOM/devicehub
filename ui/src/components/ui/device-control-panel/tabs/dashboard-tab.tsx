import { Button, SimpleGrid } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import {
  Icon24Upload,
  Icon20BugOutline,
  Icon20CopyOutline,
  Icon20GlobeOutline,
  Icon20DeleteOutline,
  Icon28SettingsOutline,
  Icon28StopwatchOutline,
  Icon20AddSquareOutline,
  Icon20ChevronRightOutline,
} from '@vkontakte/icons'
import { useParams } from 'react-router'
import { observer } from 'mobx-react-lite'

import { DeviceControlCard } from '@/components/ui/device-control-panel/device-control-card'

import { BookingService } from '@/services/booking-service'

import { useServiceLocator } from '@/lib/hooks/use-service-locator.hook'

import { DeviceBookingControl } from './device-booking-control'

export const DashboardTab = observer(() => {
  const { t } = useTranslation()
  const { serial } = useParams()

  const bookingService = useServiceLocator<BookingService>(BookingService.name)

  return (
    <SimpleGrid columns={2} gap='l'>
      <DeviceControlCard before={<Icon28SettingsOutline height={20} width={20} />} title={t('Device Buttons')}>
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        after={<Button appearance='neutral' before={<Icon20CopyOutline />} mode='tertiary' />}
        afterTooltipText={t('Copy link')}
        before={<Icon20BugOutline />}
        helpTooltipText={t('Run the following on your command line to debug the device from your IDE')}
        title={t('Remote debug')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        after={<Button appearance='neutral' before={<Icon20DeleteOutline />} mode='tertiary' />}
        before={<Icon24Upload height={20} width={20} />}
        title={t('App Upload')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        after={<Button appearance='neutral' before={<Icon20DeleteOutline />} mode='tertiary' />}
        afterTooltipText={t('Reset all browser settings')}
        before={<Icon20GlobeOutline />}
        title={t('Open link or deeplink')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        after={<Button appearance='neutral' before={<Icon20DeleteOutline />} mode='tertiary' />}
        before={<Icon20ChevronRightOutline />}
        helpTooltipText={t('Executes remote shell commands')}
        title={t('Shell')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard before={<Icon20CopyOutline />} title={t('Clipboard')}>
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        afterTooltipText={t('Extend booking')}
        before={<Icon28StopwatchOutline height={20} width={20} />}
        title={t('Device booking')}
        after={
          <Button
            appearance='neutral'
            before={<Icon20AddSquareOutline />}
            mode='tertiary'
            onClick={() => {
              if (!serial) return

              bookingService?.reBookDevice(serial)
            }}
          />
        }
      >
        <DeviceBookingControl />
      </DeviceControlCard>
    </SimpleGrid>
  )
})
