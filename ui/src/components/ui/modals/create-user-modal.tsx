import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { Icon56UserAddBadgeOutline } from '@vkontakte/icons'
import { Button, FormItem, FormLayoutGroup, Input, Spacing } from '@vkontakte/vkui'

import { BaseModal } from '@/components/lib/base-modal'
import { EmailInput } from '@/components/lib/email-input'

import { useCreateUser } from '@/lib/hooks/use-create-user.hook'

import type { ChangeEvent, FormEvent } from 'react'

const nameRegex = '^[0-9a-zA-Z\\-_\\. ]{1,50}$'

type CreateUserModalProps = {
  isOpen: boolean
  onClose: () => void
}

export const CreateUserModal = observer(({ isOpen, onClose }: CreateUserModalProps) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const { mutate: createUser } = useCreateUser()

  const onNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNameError('')

    if (!new RegExp(nameRegex, 'i').test(event.target.value)) {
      setNameError('Only latin letters, numbers, -, _, ., (1–50 chars)')
    }

    setName(event.target.value)
  }

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    createUser({ email, name })

    setName('')
    setEmail('')

    onClose()
  }

  return (
    <BaseModal icon={<Icon56UserAddBadgeOutline />} isOpen={isOpen} title={t('Create new user')} onClose={onClose}>
      <form onSubmit={onSave}>
        <FormLayoutGroup>
          <FormItem bottom={nameError} status={nameError ? 'error' : undefined} top={t('Name')}>
            <Input placeholder='E.g. User' value={name} required onChange={onNameChange} />
          </FormItem>
          <FormItem bottom={emailError} status={emailError ? 'error' : undefined} top={t('Email')}>
            <EmailInput
              placeholder='E.g. user@mail.com'
              value={email}
              onChange={(value) => setEmail(value)}
              onError={(error) => setEmailError(error)}
            />
          </FormItem>
          <Spacing />
          <FormItem>
            <Button
              disabled={!name || !email || !!nameError || !!emailError}
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
    </BaseModal>
  )
})
