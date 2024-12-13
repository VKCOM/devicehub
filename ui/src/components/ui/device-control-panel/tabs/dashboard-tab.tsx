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

import { DeviceControlCard } from '@/components/ui/device-control-panel/device-control-card'

import { DeviceButtonsControl } from './device-buttons-control'

export const DashboardTab = () => {
  const { t } = useTranslation()

  return (
    <SimpleGrid columns={2} gap='l'>
      <DeviceControlCard before={<Icon28SettingsOutline height={20} width={20} />} title={t('Device Buttons')}>
        <DeviceButtonsControl />
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
        after={<Button appearance='neutral' before={<Icon20AddSquareOutline />} mode='tertiary' />}
        afterTooltipText={t('Extend booking')}
        before={<Icon28StopwatchOutline height={20} width={20} />}
        title={t('Device booking')}
      >
        Stub
      </DeviceControlCard>
    </SimpleGrid>
  )
}
