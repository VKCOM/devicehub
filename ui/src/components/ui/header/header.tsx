import { Button, Tappable, useAppearance } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import cn from 'classnames'
import {
  Icon16MailOutline,
  Icon16HelpOutline,
  Icon28DevicesOutline,
  Icon28SettingsOutline,
  Icon16DoorEnterArrowRightOutline,
} from '@vkontakte/icons'

import DeviceHubIcon from '@/assets/device-hub.svg?react'

import { useGetAuthDocs } from '@/lib/hooks/use-get-auth-docs.hook'
import { useGetAuthContact } from '@/lib/hooks/use-get-auth-contact.hook'

import { getDevicesRoute, getMainRoute, getSettingsRoute } from '@/constants/route-paths'

import styles from './header.module.css'

export const Header = () => {
  const { t } = useTranslation()
  const appearance = useAppearance()
  const { data: authDocs } = useGetAuthDocs()
  const { data: authContact } = useGetAuthContact()

  return (
    <header className={styles.header}>
      <div className={styles.leftSide}>
        <Link className={styles.logoLink} to={getMainRoute()}>
          <Tappable activeMode='opacity' focusVisibleMode='outside' hoverMode='opacity' onClick={() => {}}>
            <DeviceHubIcon className={cn({ [styles.logo]: appearance === 'dark' })} />
          </Tappable>
        </Link>
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
        <Button before={<Icon16DoorEnterArrowRightOutline />} mode='tertiary' size='m'>
          {t('Sign Out')}
        </Button>
      </div>
    </header>
  )
}
