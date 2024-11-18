import i18n from 'i18next'
import Backend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'ja',
  'ko',
  'pl',
  'pt-BR',
  'ru-RU',
  'tt-RU',
  'kk-KZ',
  'zh-CN',
  'zh-Hant',
] as const

i18n
  .use(LanguageDetector)
  .use(Backend)
  .use(initReactI18next)
  .init({
    supportedLngs: SUPPORTED_LANGUAGES,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
