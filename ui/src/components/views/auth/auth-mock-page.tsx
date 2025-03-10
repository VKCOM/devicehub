import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon20MailOutline, Icon20UserOutline } from '@vkontakte/icons'
import { Button, Div, FormItem, FormLayoutGroup, FormStatus, Group, Input, Panel, Spacing, View } from '@vkontakte/vkui'

import { EmailInput } from '@/components/lib/email-input'
import { DynamicLogo } from '@/components/lib/dynamic-logo'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { authStore } from '@/store/auth-store'
import { useMockAuth } from '@/lib/hooks/use-mock-auth.hook'
import { useGetAuthContact } from '@/lib/hooks/use-get-auth-contact.hook'

import styles from './auth-page.module.css'

import type { FormEvent } from 'react'

export const AuthMockPage = () => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [formError, setFormError] = useState('')
  const { data: authData, error: authError, mutate: auth, isSuccess } = useMockAuth()
  const { data: authContact } = useGetAuthContact()

  const onFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    auth({ name, email })
  }

  useEffect(() => {
    if (isSuccess) {
      authStore.login(authData.jwt)
      window.location.assign(authData.redirect)
    }
  }, [authData])

  useEffect(() => {
    if (authError?.response?.data.error === 'ValidationError') {
      for (const item of authError.response.data.validationErrors) {
        if (item.param === 'name') {
          setNameError(item.msg)
        }

        if (item.param === 'email') {
          setEmailError(item.msg)
        }
      }

      return
    }

    if (authError?.response?.data.error === 'InvalidCredentialsError') {
      setFormError('Incorrect login details')

      return
    }

    if (authError?.response?.data.error) {
      setFormError('We do not recognize you. Please check your spelling and try again or use another login option')
    }
  }, [authError])

  return (
    <View activePanel='main'>
      <Panel id='main' centered>
        <Group className={styles.authPage} separator='hide'>
          <div>
            <form className={styles.form} onSubmit={onFormSubmit}>
              <DynamicLogo className={styles.logo} height={55} width={225} />
              <FormLayoutGroup>
                <FormItem bottom={nameError} status={nameError ? 'error' : undefined} top={t('Name')}>
                  <Input
                    before={<Icon20UserOutline />}
                    placeholder='Please enter your name'
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </FormItem>
                <FormItem bottom={emailError} status={emailError ? 'error' : undefined} top={t('Email')}>
                  <EmailInput
                    before={<Icon20MailOutline />}
                    placeholder='Please enter your email'
                    value={email}
                    onChange={(value) => setEmail(value)}
                    onError={(error) => setEmailError(error)}
                  />
                </FormItem>
                <Spacing size='xl' />
                <FormItem>
                  <Button disabled={!name || !email || !!emailError} size='l' type='submit' stretched>
                    {t('Log In')}
                  </Button>
                </FormItem>
              </FormLayoutGroup>
              <ConditionalRender conditions={[!!formError]}>
                <Div>
                  <FormStatus mode='error'>{formError}</FormStatus>
                </Div>
              </ConditionalRender>
              <Button className={styles.contactButton} href={authContact} mode='link'>
                {t('Contact Support')}
              </Button>
            </form>
          </div>
        </Group>
      </Panel>
    </View>
  )
}
