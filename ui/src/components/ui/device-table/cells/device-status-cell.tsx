import { memo } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { DeviceState } from '@/types/enums/device-state.enum'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { getControlRoute } from '@/constants/route-paths'

import type { ListDevice } from '@/types/list-device.type'

type DeviceStatusCellProps = {
  serial: ListDevice['serial']
  channel: ListDevice['channel']
  deviceState: DeviceState
}

export const DeviceStatusCell = memo(({ serial, channel, deviceState }: DeviceStatusCellProps) => {
  const { t } = useTranslation()

  const deviceDisconnection = useInjection(CONTAINER_IDS.deviceDisconnection)

  const onStopUsing = () => {
    if (!channel) return

    deviceDisconnection.stopUsingDevice(serial, channel)
  }

  return (
    <>
      <ConditionalRender conditions={[deviceState === DeviceState.AVAILABLE]}>
        <Link to={getControlRoute(serial)}>
          <Button mode='outline' title={deviceState}>
            {t('Use')}
          </Button>
        </Link>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.ABSENT]}>
        <Button appearance='negative' mode='outline' title={deviceState} disabled>
          {t('Disconnected')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.OFFLINE]}>
        <Button appearance='negative' mode='outline' title={deviceState} disabled>
          {t('Offline')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.UNAUTHORIZED]}>
        <Button appearance='negative' mode='outline' title={deviceState} disabled>
          {t('Unauthorized')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.PREPARING]}>
        <Button appearance='neutral' mode='outline' title={deviceState} disabled>
          {t('Preparing')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.BUSY]}>
        <Button appearance='neutral' mode='outline' title={deviceState} disabled>
          {t('Busy')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.AUTOMATION]}>
        <Button appearance='positive' mode='outline' title={deviceState} onClick={onStopUsing}>
          {t('Stop Automation')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.USING]}>
        <Button appearance='positive' id={`stopUsing_${serial}`} mode='primary' title={deviceState} onClick={onStopUsing}>
          {t('Stop Using')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.PRESENT]}>
        <Button appearance='neutral' mode='outline' title={deviceState}>
          {t('Connected')}
        </Button>
      </ConditionalRender>
      <ConditionalRender conditions={[deviceState === DeviceState.UNHEALTHY]}>
        <Button appearance='negative' mode='outline' title={deviceState} disabled>
          {t('Unhealthy')}
        </Button>
      </ConditionalRender>
    </>
  )
})
