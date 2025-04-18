import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { type FormEvent, useState } from 'react'
import { Button, FormItem, FormLayoutGroup, Input, Spacing } from '@vkontakte/vkui'

import styles from '../../users-tab.module.css'

import type { UpdateUserGroupsQuotasParams, UserGroupsQuotas } from '@/generated/types'

interface QuotaTabProps {
  quotas?: UserGroupsQuotas
  onUpdate: (data: UpdateUserGroupsQuotasParams) => void
}

export const QuotaTab = observer(({ quotas, onUpdate }: QuotaTabProps) => {
  const { t } = useTranslation()
  const [quota, setQuota] = useState<UpdateUserGroupsQuotasParams>({
    number: quotas?.allocated?.number || 0,
    duration: quotas?.allocated?.duration || 0,
    repetitions: quotas?.repetitions || 0,
  })

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    onUpdate(quota)
  }

  return (
    <form className={styles.quotaForm} onSubmit={onSave}>
      <FormLayoutGroup>
        <FormItem top={t('Number of groups')}>
          <Input
            min={0}
            placeholder='E.g. 5'
            type='number'
            value={quota.number}
            required
            onChange={(event) => setQuota((prev) => ({ ...prev, number: event.target.valueAsNumber }))}
          />
        </FormItem>
        <FormItem top={t('Total duration of groups')}>
          <Input
            min={0}
            placeholder='E.g. 5000 (in ms)'
            type='number'
            value={quota.duration}
            required
            onChange={(event) => setQuota((prev) => ({ ...prev, duration: event.target.valueAsNumber }))}
          />
        </FormItem>
        <FormItem top={t('Number of repetitions per group')}>
          <Input
            min={0}
            placeholder='E.g. 10'
            type='number'
            value={quota.repetitions}
            required
            onChange={(event) => setQuota((prev) => ({ ...prev, repetitions: event.target.valueAsNumber }))}
          />
        </FormItem>
        <Spacing />
        <FormItem>
          <Button
            disabled={!quota.number || !quota.duration || !quota.repetitions}
            mode='primary'
            size='l'
            type='submit'
            stretched
          >
            {t('Save')}
          </Button>
        </FormItem>
      </FormLayoutGroup>
    </form>
  )
})
