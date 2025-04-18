import { useTranslation } from 'react-i18next'
import { Button, ButtonGroup } from '@vkontakte/vkui'
import { Icon20ErrorCircleFillYellow } from '@vkontakte/icons'

import { BaseModal } from '@/components/lib/base-modal'
import { ConditionalRender } from '@/components/lib/conditional-render'

import styles from './modal.module.css'

import type { BaseModalProps } from '@/components/lib/base-modal'

type WarningModalProps = {
  isCancelShown?: boolean
  onOk?: () => Promise<void>
}

export const WarningModal = ({
  onOk,
  isCancelShown = true,
  ...props
}: Omit<BaseModalProps, 'icon'> & WarningModalProps) => {
  const { t } = useTranslation()

  const onOkClick = () => {
    onOk?.()

    props.onClose()
  }

  return (
    <BaseModal
      icon={<Icon20ErrorCircleFillYellow height={56} width={56} />}
      actions={
        <ButtonGroup align='right' className={styles.modalActions}>
          <Button mode={isCancelShown ? 'secondary' : 'primary'} size='l' onClick={onOkClick}>
            OK
          </Button>
          <ConditionalRender conditions={[isCancelShown]}>
            <Button mode='primary' size='l' onClick={props.onClose}>
              {t('Cancel')}
            </Button>
          </ConditionalRender>
        </ButtonGroup>
      }
      {...props}
    />
  )
}
