import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { Icon56SettingsOutline } from '@vkontakte/icons'
import { Button, FormItem, FormLayoutGroup, Input } from '@vkontakte/vkui'

import { BaseModal } from '@/components/lib/base-modal'

import type { UpdateUserGroupsQuotasParams } from '@/generated/types'

type UpdateGroupQuotaModalProps = {
  title: string
  isOpen: boolean
  defaultQuota: UpdateUserGroupsQuotasParams
  onClose: () => void
  onUpdateQuota: (data: UpdateUserGroupsQuotasParams) => void
}

export const UpdateGroupQuotaModal = observer(
  ({ title, isOpen, onClose, defaultQuota, onUpdateQuota }: UpdateGroupQuotaModalProps) => {
    const { t } = useTranslation()
    const [quota, setQuota] = useState<UpdateUserGroupsQuotasParams>(defaultQuota)

    const onSave = () => {
      onUpdateQuota(quota)

      onClose()
    }

    useEffect(() => {
      setQuota(defaultQuota)
    }, [defaultQuota])

    return (
      <BaseModal
        icon={<Icon56SettingsOutline />}
        isOpen={isOpen}
        title={title}
        actions={
          <Button
            disabled={!quota.number || !quota.duration || !quota.repetitions}
            mode='primary'
            size='l'
            type='submit'
            stretched
            onClick={onSave}
          >
            {t('Save')}
          </Button>
        }
        onClose={onClose}
      >
        <form>
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
          </FormLayoutGroup>
        </form>
      </BaseModal>
    )
  }
)
