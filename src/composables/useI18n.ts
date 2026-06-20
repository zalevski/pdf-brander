import { computed, ref, watch } from 'vue'
import en from '../../locales/en.json'
import pl from '../../locales/pl.json'
import de from '../../locales/de.json'
import type { AppLanguage } from '../../shared/types'

const STORAGE_KEY = 'pdf-letterhead-language'
const dictionaries = {
  en,
  pl,
  de
} as const

type Dictionary = typeof en
type TranslationParams = Record<string, string | number>

function resolvePath(dictionary: Dictionary, key: string): string | undefined {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (value && typeof value === 'object' && segment in value) {
      return (value as Record<string, unknown>)[segment]
    }

    return undefined
  }, dictionary) as string | undefined
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? ''))
}

async function getInitialLanguage(): Promise<AppLanguage> {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'pl' || stored === 'de') {
    return stored
  }

  const locale = navigator.language.toLowerCase()
  if (locale.startsWith('pl')) {
    return 'pl'
  }
  if (locale.startsWith('de')) {
    return 'de'
  }
  return 'en'
}

export async function useI18n() {
  const locale = ref<AppLanguage>('en')
  const ready = ref(false)

  locale.value = await getInitialLanguage()
  ready.value = true

  watch(locale, (value) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }, { immediate: true })

  const dictionary = computed(() => dictionaries[locale.value])

  function t(key: string, params?: TranslationParams): string {
    const fallback = resolvePath(en, key) ?? key
    const localized = resolvePath(dictionary.value, key) ?? fallback
    return interpolate(localized, params)
  }

  function setLocale(nextLocale: AppLanguage): void {
    locale.value = nextLocale
  }

  return {
    locale,
    ready,
    setLocale,
    t
  }
}
