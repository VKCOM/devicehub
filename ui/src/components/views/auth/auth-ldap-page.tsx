import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon20UserOutline, Icon20KeyOutline } from '@vkontakte/icons'
import { Button, Div, FormItem, FormLayoutGroup, FormStatus, Group, Input, Panel, Spacing, View } from '@vkontakte/vkui'

import { DynamicLogo } from '@/components/lib/dynamic-logo'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { authStore } from '@/store/auth-store'
import { useLdapAuth } from '@/lib/hooks/use-ldap-auth.hook'
import { useGetAuthContact } from '@/lib/hooks/use-get-auth-contact.hook'

import styles from './auth-page.module.css'

import type { ChangeEvent, FormEvent } from 'react'

export const AuthLdapPage = () => {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')
  const { data: authData, error, mutate: auth, isSuccess } = useLdapAuth()
  const { data: authContact } = useGetAuthContact()

  const onFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    auth({ username, password })
  }

  const onUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsernameError('')
    setFormError('')

    setUsername(event.target.value)
  }

  const onPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPasswordError('')
    setFormError('')

    setPassword(event.target.value)
  }

  useEffect(() => {
    if (isSuccess) {
      authStore.login(authData.jwt)
      window.location.assign(authData.redirect)
    }
  }, [authData])

  useEffect(() => {
    if (error?.response?.data.error === 'ValidationError') {
      for (const item of error.response.data.validationErrors) {
        if (item.param === 'username') {
          setUsernameError(item.msg)
        }

        if (item.param === 'password') {
          setPasswordError(item.msg)
        }
      }

      return
    }

    if (error?.response?.data.error === 'InvalidCredentialsError') {
      setFormError('Incorrect login details')

      return
    }

    if (error?.response?.data.error) {
      setFormError('We do not recognize you. Please check your spelling and try again or use another login option')
    }
  }, [error])

  return (
    <View activePanel='main'>
      <Panel id='main' centered>
        <Group className={styles.authPage} separator='hide'>
          <div>
            <form autoComplete='on' className={styles.form} onSubmit={onFormSubmit}>
              <DynamicLogo className={styles.logo} height={55} width={225} />
              <FormLayoutGroup>
                <FormItem bottom={usernameError} status={usernameError ? 'error' : undefined} top={t('Username')}>
                  <Input
                    autoComplete='username'
                    before={<Icon20UserOutline />}
                    name='username'
                    placeholder={t('Please enter your login')}
                    value={username}
                    onChange={onUsernameChange}
                  />
                </FormItem>
                <FormItem bottom={passwordError} status={passwordError ? 'error' : undefined} top={t('Password')}>
                  <Input
                    autoComplete='current-password'
                    before={<Icon20KeyOutline />}
                    name='password'
                    placeholder={t('Please enter your password')}
                    type='password'
                    value={password}
                    onChange={onPasswordChange}
                  />
                </FormItem>
                <ConditionalRender conditions={[!!formError]}>
                  <Div>
                    <FormStatus mode='error'>{formError}</FormStatus>
                  </Div>
                </ConditionalRender>
                <Spacing size='xl' />
                <FormItem>
                  <Button
                    disabled={!username || !password || !!usernameError || !!passwordError || !!formError}
                    size='l'
                    type='submit'
                    stretched
                  >
                    {t('Log In')}
                  </Button>
                </FormItem>
              </FormLayoutGroup>
              <ConditionalRender conditions={[!!authContact, authContact != 'example.com']}>
                <Button className={styles.contactButton} href={authContact} mode='link'>
                  {t('Contact Support')}
                </Button>
              </ConditionalRender>
            </form>
          </div>
        </Group>
      </Panel>
    </View>
  )
}
