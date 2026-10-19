import { useSyncExternalStore } from 'react'

export type UiLocale = 'en' | 'my'

const STORAGE_KEY = 'supermega.ui-locale.v1'
const listeners = new Set<() => void>()
let currentLocale: UiLocale = 'en'

function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'my'
}

type MyanmarLocaleModule = typeof import('./ui-locale-my.ts')
let myLocaleModule: MyanmarLocaleModule | null = null
let myLocaleLoad: Promise<MyanmarLocaleModule> | null = null
let myLocaleLoadError: unknown = null
let localeRequestVersion = 0

function loadMyLocaleModule(): Promise<MyanmarLocaleModule> {
  if (myLocaleModule) return Promise.resolve(myLocaleModule)
  if (!myLocaleLoad) {
    myLocaleLoad = import('./ui-locale-my.ts').then((module) => {
      myLocaleModule = module
      return module
    }).catch((error: unknown) => {
      myLocaleLoad = null
      throw error
    })
  }
  return myLocaleLoad
}

function applyUiLocale(next: UiLocale, persist: boolean): Promise<void> {
  const requestVersion = ++localeRequestVersion
  if (next === 'my' && !myLocaleModule) {
    return loadMyLocaleModule().then(() => {
      if (requestVersion !== localeRequestVersion) return
      myLocaleLoadError = null
      return commitUiLocale(next, persist)
    }).catch((error: unknown) => {
      if (requestVersion !== localeRequestVersion) return
      myLocaleLoadError = error
      // Keep the application usable if a deployment no longer has this chunk.
      commitUiLocale('en', persist)
    })
  }
  myLocaleLoadError = null
  commitUiLocale(next, persist)
  return Promise.resolve()
}

function commitUiLocale(next: UiLocale, persist: boolean): void {
  if (next === currentLocale) return
  currentLocale = next
  if (typeof document !== 'undefined') document.documentElement.lang = next
  if (persist) {
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* Keep this tab's choice. */ }
  }
  listeners.forEach((listener) => listener())
}

export function ensureUiLocaleReady(): Promise<void> {
  if (currentLocale !== 'my') return Promise.resolve()
  if (myLocaleLoadError) {
    commitUiLocale('en', true)
    return Promise.resolve()
  }
  const requestVersion = localeRequestVersion
  return loadMyLocaleModule().then(() => undefined).catch((error: unknown) => {
    myLocaleLoadError = error
    if (currentLocale === 'my' && requestVersion === localeRequestVersion) {
      commitUiLocale('en', true)
    }
  })
}

if (typeof window !== 'undefined') {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isUiLocale(saved)) currentLocale = saved
  } catch {
    // Language remains usable when browser storage is unavailable.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    const next = isUiLocale(event.newValue) ? event.newValue : 'en'
    return applyUiLocale(next, false).catch(() => undefined)
  })
}

// A saved Burmese preference blocks module evaluation until its dictionary is
// ready, so every consumer begins in one language. English sessions never fetch it.
if (currentLocale === 'my') {
  try {
    await loadMyLocaleModule()
  } catch (error: unknown) {
    myLocaleLoadError = error
    commitUiLocale('en', true)
  }
}

export function readUiLocale(): UiLocale { return currentLocale }

export function setUiLocale(next: UiLocale): Promise<void> {
  return isUiLocale(next) ? applyUiLocale(next, true) : Promise.resolve()
}

export function useUiLocale(): UiLocale {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    readUiLocale,
    () => 'en',
  )
}

export function uiText(english: string): string {
  return currentLocale === 'my' ? myLocaleModule?.UI_TRANSLATIONS[english] ?? english : english
}
