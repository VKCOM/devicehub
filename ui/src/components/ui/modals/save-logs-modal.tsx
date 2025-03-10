import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Icon40DownloadCircle } from '@vkontakte/icons'
import { Button, FormItem, FormLayoutGroup, Input, Spacing } from '@vkontakte/vkui'

import { BaseModal } from '@/components/lib/base-modal'
import { BaseSelect } from '@/components/lib/base-select'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import styles from './modal.module.css'

import type { FormEvent } from 'react'
import type { SelectOption } from '@/components/lib/base-select'
import type { BaseModalProps } from '@/components/lib/base-modal'
import type { LogsFileExtension } from '@/services/save-logs-service/types'

export const SaveLogsModal = observer(({ ...props }: Omit<BaseModalProps, 'title' | 'actions' | 'icon'>) => {
  const { t } = useTranslation()

  const fileExtensionOptions: SelectOption<LogsFileExtension>[] = useMemo(
    () => [
      { name: t('JSON file'), value: 'json' },
      { name: `${t('Raw lines')} (.log)`, value: 'log' },
    ],
    [t]
  )

  const saveLogsService = useInjection(CONTAINER_IDS.saveLogsService)

  const onSaveLogs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    saveLogsService.saveLogs()

    props.onClose()
  }

  return (
    <BaseModal {...props} icon={<Icon40DownloadCircle height={56} width={56} />} title={`${t('Export')} ${t('Logs')}`}>
      <Spacing size='2xl' />
      <form onSubmit={onSaveLogs}>
        <FormLayoutGroup>
          <FormItem top={t('File Name')}>
            <Input
              placeholder={t('File Name')}
              value={saveLogsService.logsFileName}
              onChange={(event) => saveLogsService.setLogsFileName(event.target.value)}
            />
          </FormItem>
          <FormItem top={t('File Extension')}>
            <BaseSelect
              options={fileExtensionOptions}
              value={saveLogsService.selectedExtension}
              onChange={(value) => {
                saveLogsService.setSelectedExtension(value as LogsFileExtension)
              }}
            />
          </FormItem>
          <Spacing />
          <FormItem>
            <Button
              className={styles.modalActions}
              disabled={!saveLogsService.logsFileName}
              mode='primary'
              size='l'
              type='submit'
            >
              {t('Export')}
            </Button>
          </FormItem>
        </FormLayoutGroup>
      </form>
    </BaseModal>
  )
})
