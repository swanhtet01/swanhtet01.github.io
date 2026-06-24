import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { getInitialLanguage, UiLanguageContext, useUiLanguage, type UiLanguage, type UiLanguageContextValue } from './uiLanguageContext'

export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => getInitialLanguage())

  useEffect(() => {
    document.documentElement.lang = language === 'my' ? 'my' : 'en'
    window.localStorage.setItem('supermega-ui-language', language)
  }, [language])

  const value = useMemo<UiLanguageContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (copy) => copy[language],
    }),
    [language],
  )

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useUiLanguage()

  return (
    <div className={compact ? 'sm-language-toggle is-compact' : 'sm-language-toggle'} aria-label="Language">
      <button className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')} type="button">
        EN
      </button>
      <button className={language === 'my' ? 'is-active' : ''} onClick={() => setLanguage('my')} type="button">
        MM
      </button>
    </div>
  )
}
