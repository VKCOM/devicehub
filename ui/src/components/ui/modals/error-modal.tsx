import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, ButtonGroup } from '@vkontakte/vkui'
import { Icon20ErrorCircleFillRed } from '@vkontakte/icons'

import { BaseModal } from '@/components/lib/base-modal'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { getDevicesRoute } from '@/constants/route-paths'

import styles from './modal.module.css'

import type { BaseModalProps } from '@/components/lib/base-modal'

export const ErrorModal = ({ ...props }: Omit<BaseModalProps, 'actions' | 'icon'>) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)
  const deviceDisconnection = useInjection(CONTAINER_IDS.deviceDisconnection)

  const { data: device } = deviceBySerialStore.deviceQueryResult()

  return (
    <BaseModal
      {...props}
      icon={<Icon20ErrorCircleFillRed height={56} width={56} />}
      actions={
        <ButtonGroup className={styles.modalActions} stretched>
          <Button mode={'secondary'} size='l' stretched onClick={() => navigate(0)}>
            {t('Try to reconnect')}
          </Button>
          <Button
            mode='primary'
            size='l'
            stretched
            onClick={() => {
              if (!device?.serial) return

              deviceDisconnection.stopUsingDevice(device.serial)

              navigate(getDevicesRoute(), { replace: true })
            }}
          >
            {t('Go to Device List')}
          </Button>
        </ButtonGroup>
      }
    />
  )
}
