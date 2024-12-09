import { memo } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { DeviceState } from '@/types/enums/device-state.enum'
import { isDeviceUsable } from '@/lib/utils/is-device-usable.util'
import { deviceConnection } from '@/store/device-connection'

import { getControlRoute } from '@/constants/route-paths'

import type { Device } from '@/generated/types'

type DeviceStatusCellProps = {
  status: Device['status']
  present: Device['present']
  ready: Device['ready']
  using: Device['using']
  serial: Device['serial']
  deviceState: DeviceState
  hasOwner: boolean
}

export const DeviceStatusCell = memo(
  ({ status, present, ready, hasOwner, using, serial, deviceState }: DeviceStatusCellProps) => {
    const { t } = useTranslation()

    const usable = isDeviceUsable({ status, present, ready, using, hasOwner })

    const onStopUsing = () => {
      if (!serial) return

      deviceConnection.stopUsingDevice(serial)
    }

    if (!!usable && !using) {
      return (
        <>
          {serial && (
            <Link to={getControlRoute(serial)}>
              <Button mode='outline' title={deviceState}>
                {t('Use')}
              </Button>
            </Link>
          )}
        </>
      )
    }

    return (
      <>
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
          <Button appearance='positive' mode='outline' title={deviceState}>
            {t('Stop Automation')}
          </Button>
        </ConditionalRender>
        <ConditionalRender conditions={[deviceState === DeviceState.USING]}>
          <Button appearance='positive' mode='primary' title={deviceState} onClick={onStopUsing}>
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
  }
)
