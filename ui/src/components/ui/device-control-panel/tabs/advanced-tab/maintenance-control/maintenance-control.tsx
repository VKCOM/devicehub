import { useState } from 'react'
import cn from 'classnames'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Button, Flex } from '@vkontakte/vkui'
import { Icon20WrenchOutline, Icon24RefreshOutline } from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { ContentCard } from '@/components/lib/content-card'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import styles from './maintenance-control.module.css'

type MaintenanceControlProps = {
  className?: string
  /* NOTE: One row that fits a sheet opened to 40% of a phone screen */
  isCompact?: boolean
}

export const MaintenanceControl = ({ className, isCompact = false }: MaintenanceControlProps) => {
  const { t } = useTranslation()
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)

  const confirmation = (
    <WarningModal
      description={`${t('Are you sure you want to reboot this device?')} ${t('The device will be unavailable for a moment')}`}
      isOpen={isConfirmationOpen}
      title={t('Warning')}
      onClose={() => setIsConfirmationOpen(false)}
      onOk={async () => {
        const rebootResult = await deviceControlStore.reboot()
        const { data } = await rebootResult.donePromise

        console.info(data)
      }}
    />
  )

  if (isCompact) {
    return (
      <div className={cn(styles.compact, className)}>
        <div className={styles.compactText}>
          <b>{t('Restart Device')}</b>
          <small>{t('The device will be unavailable for a moment')}</small>
        </div>
        <Button
          appearance='negative'
          aria-label={t('Restart Device')}
          before={<Icon24RefreshOutline />}
          className={styles.compactButton}
          size='l'
          stretched
          onClick={() => setIsConfirmationOpen(true)}
        />
        {confirmation}
      </div>
    )
  }

  return (
    <ContentCard before={<Icon20WrenchOutline />} className={className} title={t('Maintenance')}>
      <Flex align='center' justify='center'>
        <Button
          appearance='negative'
          className={styles.restartButton}
          size='m'
          stretched
          onClick={() => setIsConfirmationOpen(true)}
        >
          {t('Restart Device')}
        </Button>
        {confirmation}
      </Flex>
    </ContentCard>
  )
}
