import { computed, ref } from 'vue'
import pl, { type I18nKey } from './locales/pl'
import en from './locales/en'
import de from './locales/de'

export type { I18nKey }
export type LocaleCode = 'pl' | 'en' | 'de'

export interface LocaleOption {
  code: LocaleCode
  flag: string
  label: string
  nativeName: string
  bcp47: string
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: 'pl', flag: '🇵🇱', label: 'Polski', nativeName: 'Polski', bcp47: 'pl-PL' },
  { code: 'en', flag: '🇬🇧', label: 'English', nativeName: 'English', bcp47: 'en-GB' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch', nativeName: 'Deutsch', bcp47: 'de-DE' },
]

const STORAGE_KEY = 'fantaski_locale'
const validCodes = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code))

const detectInitialLocale = (): LocaleCode => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && validCodes.has(saved)) return saved as LocaleCode
  }
  return 'pl'
}

const currentLocale = ref<LocaleCode>(detectInitialLocale())

const DICT: Record<LocaleCode, Record<I18nKey, string>> = {
  pl,
  en,
  de,
}

const applyDomLocale = (code: LocaleCode) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code
    document.title = DICT[code]['app.docTitle'] || DICT.pl['app.docTitle']
  }
}

applyDomLocale(currentLocale.value)

export const setAppLocale = (code: LocaleCode) => {
  if (!validCodes.has(code)) return
  currentLocale.value = code
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, code)
  }
  applyDomLocale(code)
}

export const getCurrentBcp47 = (): string => {
  const found = SUPPORTED_LOCALES.find((l) => l.code === currentLocale.value)
  return found?.bcp47 || 'pl-PL'
}

export const translate = (
  key: I18nKey | string,
  params?: Record<string, string | number>,
  fallback?: string,
): string => {
  const langMap = DICT[currentLocale.value] as Record<string, string>
  const plMap = DICT.pl as Record<string, string>
  let raw = langMap[key] || plMap[key] || fallback || key
  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      raw = raw.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal))
    }
  }
  return raw
}

const pluralLookup = (
  n: number,
  k1: I18nKey,
  k2: I18nKey,
  k5: I18nKey,
): string => {
  const abs = Math.abs(Number(n || 0))
  const loc = currentLocale.value
  if (loc === 'pl') {
    if (abs === 1) return translate(k1)
    const mod10 = abs % 10
    const mod100 = abs % 100
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return translate(k2)
    return translate(k5)
  }
  return abs === 1 ? translate(k1) : translate(k5)
}

export function useI18n() {
  const locale = computed(() => currentLocale.value)
  const bcp47Locale = computed(() => getCurrentBcp47())
  const currentOption = computed(
    () => SUPPORTED_LOCALES.find((l) => l.code === currentLocale.value) || SUPPORTED_LOCALES[0]!,
  )

  const t = (
    key: I18nKey | string,
    params?: Record<string, string | number>,
    fallback?: string,
  ): string => translate(key, params, fallback)

  const formatSessionType = (raw?: string | null): string => {
    const code = String(raw || '').toUpperCase()
    const key = `session.${code}` as I18nKey
    if ((DICT.pl as Record<string, string>)[key]) return translate(key)
    return raw || translate('session.UNKNOWN')
  }

  const formatHillType = (raw?: string | null, size?: number | null, full = false): string => {
    const s = Number(size || 0)
    let code = String(raw || '').toUpperCase()
    if (s > 0 && s < 85) code = 'MEDIUM'
    else if (s >= 85 && s <= 109 && code === 'LARGE') code = 'NORMAL'
    if (full) {
      const fullKey = `hill.${code.toLowerCase()}Full` as I18nKey
      if ((DICT.pl as Record<string, string>)[fullKey]) return translate(fullKey)
    }
    const key = `hill.${code}` as I18nKey
    if ((DICT.pl as Record<string, string>)[key]) return translate(key)
    return raw || translate('hill.NORMAL')
  }

  const formatCategory = (code?: string | null): string => {
    const c = String(code || '').toUpperCase()
    const key = `cat.${c}` as I18nKey
    if ((DICT.pl as Record<string, string>)[key]) return translate(key)
    return code || ''
  }

  const formatStarts = (n: number): string =>
    `${n} ${pluralLookup(n, 'common.start1', 'common.start2', 'common.start5')}`

  const formatSessionsCount = (n: number): string =>
    `${n} ${pluralLookup(n, 'common.session1', 'common.session2', 'common.session5')}`

  const formatJumpersCount = (n: number): string =>
    `${n} ${pluralLookup(n, 'common.jumper1', 'common.jumper2', 'common.jumper5')}`

  const formatLocaleDate = (raw?: string | Date | null, options?: Intl.DateTimeFormatOptions): string => {
    if (!raw) return '-'
    try {
      const d = raw instanceof Date ? raw : new Date(raw)
      if (Number.isNaN(d.getTime())) return String(raw)
      return d.toLocaleDateString(bcp47Locale.value, options)
    } catch {
      return String(raw)
    }
  }

  return {
    locale,
    bcp47Locale,
    currentOption,
    locales: SUPPORTED_LOCALES,
    setLocale: setAppLocale,
    t,
    formatSessionType,
    formatHillType,
    formatCategory,
    formatStarts,
    formatSessionsCount,
    formatJumpersCount,
    formatLocaleDate,
  }
}
