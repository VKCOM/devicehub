import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, ButtonGroup, Placeholder } from '@vkontakte/vkui'
import { Icon28ClockOutline, Icon28UserSquareOutline } from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { deviceAccessStore } from '@/store/device-access-store'
import { isOriginGroup } from '@/lib/utils/is-origin-group.util'

import { getDevicesRoute } from '@/constants/route-paths'

import styles from './device-access-screen.module.css'

import type { GroupPayloadClass } from '@/generated/types'

type DeviceAccessScreenProps = {
  /* NOTE: Re-creates the control page, which takes the device again if it is free */
  onTakeAgain: () => void
}

/* Shown instead of the device when it is busy or was released while this page was hidden */
export const DeviceAccessScreen = observer(({ onTakeAgain }: DeviceAccessScreenProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()
  const { state } = deviceAccessStore

  if (!state) return null

  const deviceName = device?.marketName || device?.model || device?.serial || ''
  const isBooked = !!device?.group?.class && !isOriginGroup(device.group.class as GroupPayloadClass)

  const toDevices = () => {
    deviceAccessStore.clear()
    navigate(getDevicesRoute(), { replace: true })
  }

  const isReleased = state.kind !== 'busy'

  return (
    <div className={styles.deviceAccessScreen} role='alert'>
      <Placeholder
        icon={<span className={styles.icon}>{isReleased ? <Icon28ClockOutline /> : <Icon28UserSquareOutline />}</span>}
        action={
          <ButtonGroup className={styles.actions} gap='s' mode='vertical' stretched>
            <Button size='l' stretched onClick={onTakeAgain}>
              {isReleased ? t('Take again') : t('Try again')}
            </Button>
            <Button mode='secondary' size='l' stretched onClick={toDevices}>
              {t('Back to devices')}
            </Button>
          </ButtonGroup>
        }
        title={
          isReleased
            ? t('{{name}} was released', { name: deviceName })
            : t('{{name}} is busy', { name: deviceName || t('Device') })
        }
      >
        {isReleased && t('This tab was hidden for more than 5 minutes, so the device went back to the pool.')}
        {isReleased && isBooked && ` ${t('Your booking is still active.')}`}
        {!isReleased &&
          (state.ownerName
            ? t('{{owner}} is using this device right now.', { owner: state.ownerName })
            : t('Another user is using this device right now.'))}
      </Placeholder>
    </div>
  )
})
