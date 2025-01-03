import { SimpleGrid } from '@vkontakte/vkui'
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
import { observer } from 'mobx-react-lite'

import { DeviceControlCard } from '@/components/ui/device-control-panel/device-control-card'

import { BookingService } from '@/services/booking-service'
import { ApplicationInstallationService } from '@/services/application-installation/application-installation-service'

import { useServiceLocator } from '@/lib/hooks/use-service-locator.hook'

import { AppUploadControl } from './app-upload-control'
import { ClipboardControl } from './clipboard-control'
import { DeviceButtonsControl } from './device-buttons-control'
import { DeviceBookingControl } from './device-booking-control'

export const DashboardTab = observer(() => {
  const { t } = useTranslation()

  const bookingService = useServiceLocator<BookingService>(BookingService.name)
  const applicationInstallationService = useServiceLocator<ApplicationInstallationService>(
    ApplicationInstallationService.name
  )

  return (
    <SimpleGrid columns={2} gap='l'>
      <DeviceControlCard before={<Icon28SettingsOutline height={20} width={20} />} title={t('Device Buttons')}>
        <DeviceButtonsControl />
      </DeviceControlCard>
      <DeviceControlCard
        afterButtonIcon={<Icon20CopyOutline />}
        afterTooltipText={t('Copy link')}
        before={<Icon20BugOutline />}
        helpTooltipText={t('Run the following on your command line to debug the device from your IDE')}
        title={t('Remote debug')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        afterButtonIcon={<Icon20DeleteOutline />}
        before={<Icon24Upload height={20} width={20} />}
        title={t('App Upload')}
        onAfterButtonClick={() => applicationInstallationService?.clear()}
      >
        <AppUploadControl />
      </DeviceControlCard>
      <DeviceControlCard
        afterButtonIcon={<Icon20DeleteOutline />}
        afterTooltipText={t('Reset all browser settings')}
        before={<Icon20GlobeOutline />}
        title={t('Open link or deeplink')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard
        afterButtonIcon={<Icon20DeleteOutline />}
        before={<Icon20ChevronRightOutline />}
        helpTooltipText={t('Executes remote shell commands')}
        title={t('Shell')}
      >
        Stub
      </DeviceControlCard>
      <DeviceControlCard before={<Icon20CopyOutline />} title={t('Clipboard')}>
        <ClipboardControl />
      </DeviceControlCard>
      <DeviceControlCard
        afterButtonIcon={<Icon20AddSquareOutline />}
        afterTooltipText={t('Extend booking')}
        before={<Icon28StopwatchOutline height={20} width={20} />}
        title={t('Device booking')}
        onAfterButtonClick={() => {
          bookingService?.reBookDevice()
        }}
      >
        <DeviceBookingControl />
      </DeviceControlCard>
    </SimpleGrid>
  )
})
