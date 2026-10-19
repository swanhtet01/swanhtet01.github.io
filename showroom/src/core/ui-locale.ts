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

async function applyUiLocale(next: UiLocale, persist: boolean): Promise<void> {
  if (next === 'my') await loadMyLocaleModule()
  if (next === currentLocale) return
  currentLocale = next
  if (typeof document !== 'undefined') document.documentElement.lang = next
  if (persist) {
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* Keep this tab's choice. */ }
  }
  listeners.forEach((listener) => listener())
}

export function ensureUiLocaleReady(): Promise<void> {
  return currentLocale === 'my' ? loadMyLocaleModule().then(() => undefined) : Promise.resolve()
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
