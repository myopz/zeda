import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

export const SUPPORTED_LANGS = ['zh-CN', 'en', 'zh-TW'] as const
export type AppLang = (typeof SUPPORTED_LANGS)[number]

const LANG_KEY = 'zeda.lang'

export function getStoredLang(): AppLang {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) {
    return stored as AppLang
  }
  return 'zh-CN'
}

export function setStoredLang(lang: AppLang) {
  localStorage.setItem(LANG_KEY, lang)
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
    'zh-TW': { translation: zhTW },
  },
  lng: getStoredLang(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n
