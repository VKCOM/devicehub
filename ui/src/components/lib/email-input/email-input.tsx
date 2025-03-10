import { Input } from '@vkontakte/vkui'

import type { ReactNode } from 'react'

const emailRegex = '.+\\@.+\\..+'

type EmailInputProps = {
  value: string
  onChange: (value: string) => void
  onError: (error: string) => void
  placeholder?: string
  before?: ReactNode
}

export const EmailInput = ({ before, value, placeholder, onChange, onError }: EmailInputProps) => (
  <Input
    before={before}
    placeholder={placeholder}
    type='email'
    value={value}
    required
    onChange={(event) => {
      onError('')

      if (!new RegExp(emailRegex, 'i').test(event.target.value)) {
        onError('Invalid email')
      }

      onChange(event.target.value)
    }}
  />
)
