import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button, Tappable } from '@vkontakte/vkui'
import {
  Icon16MailOutline,
  Icon16HelpOutline,
  Icon28DevicesOutline,
  Icon28SettingsOutline,
  Icon16DoorEnterArrowRightOutline,
  Icon56WebDeviceOutline,
} from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { DynamicLogo } from '@/components/lib/dynamic-logo'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { useGetAuthUrl } from '@/lib/hooks/use-get-auth-url.hook'
import { useGetAuthDocs } from '@/lib/hooks/use-get-auth-docs.hook'
import { useGetAuthContact } from '@/lib/hooks/use-get-auth-contact.hook'
import { useGetAdditionalUrl } from '@/lib/hooks/use-get-additional-url.hook'
import { authStore } from '@/store/auth-store'

import { getAuthRoute, getDevicesRoute, getMainRoute, getSettingsRoute } from '@/constants/route-paths'

import styles from './header.module.css'

export const Header = () => {
  const { t } = useTranslation()
  const { data: authUrl } = useGetAuthUrl()
  const { data: authDocs } = useGetAuthDocs()
  const { data: additionalUrl } = useGetAdditionalUrl()
  const { data: authContact } = useGetAuthContact()
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)

  const onLogout = () => {
    if (authUrl?.includes('openid')) {
      setIsConfirmationOpen(true)
    }

    if (!authUrl?.includes('openid')) {
      authStore.logout()
      window.location.assign(getAuthRoute())
    }
  }

  return (
    <header className={styles.header} id='mainPageHeader'>
      <div className={styles.leftSide}>
        <Link className={styles.logoLink} to={getMainRoute()}>
          <Tappable activeMode='opacity' focusVisibleMode='outside' hoverMode='opacity' onClick={() => {}}>
            <DynamicLogo className={styles.logo} height={32} width={120} />
          </Tappable>
        </Link>
        <ConditionalRender conditions={[!!additionalUrl?.length]}>
          <Link className={styles.navLink} to={additionalUrl || ''}>
            <Button before={<Icon56WebDeviceOutline height={28} width={28} />} mode='tertiary' size='l'>
              {t('Browsers')}
            </Button>
          </Link>
        </ConditionalRender>
        <Link className={styles.navLink} to={getDevicesRoute()}>
          <Button before={<Icon28DevicesOutline />} mode='tertiary' size='l'>
            {t('Devices')}
          </Button>
        </Link>
        <Link className={styles.navLink} to={getSettingsRoute()}>
          <Button before={<Icon28SettingsOutline />} mode='tertiary' size='l'>
            {t('Settings')}
          </Button>
        </Link>
      </div>
      <div className={styles.rightSide}>
        <Button
          before={<Icon16MailOutline />}
          Component='a'
          disabled={!authContact}
          href={authContact}
          mode='tertiary'
          size='m'
          target='_blank'
        >
          {t('DeviceHub Support')}
        </Button>
        <Button
          before={<Icon16HelpOutline />}
          Component='a'
          disabled={!authDocs}
          href={authDocs}
          mode='tertiary'
          size='m'
          target='_blank'
        >
          {t('Help')}
        </Button>
        <Button before={<Icon16DoorEnterArrowRightOutline />} mode='tertiary' size='m' onClick={onLogout}>
          {t('Logout')}
        </Button>
      </div>
      <WarningModal
        description={t('You are authenticated via an automatic login method')}
        isCancelShown={false}
        isOpen={isConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsConfirmationOpen(false)}
        onOk={async () => {
          window.location.assign(getMainRoute())
        }}
      />
    </header>
  )
}
