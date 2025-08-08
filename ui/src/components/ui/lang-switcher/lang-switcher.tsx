import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseSelect } from '@/components/lib/base-select'

import { SUPPORTED_LANGUAGES } from '@/config/i18n/i18n'

import type { SelectOption } from '@/components/lib/base-select'

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
  ['be-BY']: 'Беларуская',
  ['tt-RU']: 'Татар',
  ['kk-KZ']: 'Қазақ',
  ['zh-CN']: '简体中文',
  ['zh-Hant']: '繁體中文',
}

const LANGUAGES_OPTIONS: SelectOption<SupportedLanguages>[] = SUPPORTED_LANGUAGES.map((language) => ({
  value: language,
  name: OPTION_NAMES[language],
}))

export const LangSwitcher = () => {
  const { i18n } = useTranslation()

  const defaultLanguage =
    LANGUAGES_OPTIONS.find((option) => option.value === i18n.language)?.value || LANGUAGES_OPTIONS[0].value

  const [currentLanguage, setCurrentLanguage] = useState(defaultLanguage)

  const onSwitcherChange = (value: string) => {
    setCurrentLanguage(value as SupportedLanguages)

    i18n.changeLanguage(value)
  }

  return <BaseSelect options={LANGUAGES_OPTIONS} value={currentLanguage} onChange={onSwitcherChange} />
}
