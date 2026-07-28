import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhTW from './locales/zh-TW'
import en from './locales/en'

// 所有介面文字都放在 locales/ 底下，程式碼裡不直接寫死任何一句話。
// 以後要加語言，只要多一個檔案並在這裡註冊，不用動到任何畫面程式碼。
export const resources = {
  'zh-TW': { translation: zhTW },
  en: { translation: en }
} as const

export const supportedLanguages = [
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' }
] as const

i18n.use(initReactI18next).init({
  resources,
  lng: 'zh-TW',
  fallbackLng: 'en',
  interpolation: {
    // React 本身就會處理跳脫，i18next 不需要再做一次
    escapeValue: false
  }
})

export default i18n
