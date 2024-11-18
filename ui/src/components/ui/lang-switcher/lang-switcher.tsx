import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NativeSelect } from '@vkontakte/vkui'

import { SUPPORTED_LANGUAGES } from '@/config/i18n/i18n'

import styles from './lang-switcher.module.css'

import type { ChangeEvent } from 'react'

type SupportedLanguages = (typeof SUPPORTED_LANGUAGES)[number]

const OPTION_NAMES: Record<SupportedLanguages, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어',
  pl: 'Język polski',
  ['pt-BR']: 'Português (Brasil)',
  ['ru-RU']: 'Русский',
  ['tt-RU']: 'Татар',
  ['kk-KZ']: 'Қазақ',
  ['zh-CN']: '简体中文',
  ['zh-Hant']: '繁體中文',
}

const LANGUAGES_OPTIONS = SUPPORTED_LANGUAGES.map((language) => ({
  id: language,
  name: OPTION_NAMES[language],
}))

export const LangSwitcher = () => {
  const { i18n } = useTranslation()

  const defaultLanguage = LANGUAGES_OPTIONS.find((option) => option.id === i18n.language)?.id || LANGUAGES_OPTIONS[0].id

  const [currentLanguage, setCurrentLanguage] = useState(defaultLanguage)

  const onSwitcherChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCurrentLanguage(event.target.value as SupportedLanguages)

    i18n.changeLanguage(event.target.value)
  }

  return (
    <NativeSelect className={styles.langSwitcher} value={currentLanguage} onChange={onSwitcherChange}>
      {LANGUAGES_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </NativeSelect>
  )
}
