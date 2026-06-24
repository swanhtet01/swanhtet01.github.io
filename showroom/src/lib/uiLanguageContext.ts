import { createContext, useContext } from 'react'

export type UiLanguage = 'en' | 'my'

export type UiLanguageContextValue = {
  language: UiLanguage
  setLanguage: (language: UiLanguage) => void
  t: (copy: { en: string; my: string }) => string
}

export const UiLanguageContext = createContext<UiLanguageContextValue | null>(null)

export function getInitialLanguage(): UiLanguage {
  if (typeof window === 'undefined') {
    return 'en'
  }
  const saved = window.localStorage.getItem('supermega-ui-language')
  return saved === 'my' ? 'my' : 'en'
}

export function useUiLanguage() {
  const context = useContext(UiLanguageContext)
  if (!context) {
    return {
      language: 'en' as UiLanguage,
      setLanguage: () => undefined,
      t: (copy: { en: string; my: string }) => copy.en,
    }
  }
  return context
}
