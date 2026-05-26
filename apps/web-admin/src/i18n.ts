import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'
import ja from './locales/ja.json'

export type Locale = 'zh' | 'en' | 'ja'

export const LOCALES: { value: Locale; label: string; native: string }[] = [
  { value: 'zh', label: '中文', native: '中文' },
  { value: 'en', label: 'English', native: 'EN' },
  { value: 'ja', label: '日本語', native: 'JP' },
]

const saved = (localStorage.getItem('ds-locale') as Locale) || 'zh'

export const i18n = createI18n({
  legacy: false,
  locale: saved,
  fallbackLocale: 'zh',
  messages: { zh, en, ja },
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  localStorage.setItem('ds-locale', locale)
  document.documentElement.lang = locale
}
