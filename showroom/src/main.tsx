import { Component, StrictMode, Suspense, lazy, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initAnalytics } from './lib/analytics'
import { initMonitoring } from './lib/monitoring'

function normalizeHostToken(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '')
}

function hostMatches(hostname: string, expectedHost: string) {
  const normalizedHostname = normalizeHostToken(hostname)
  const normalizedExpectedHost = normalizeHostToken(expectedHost)
  return normalizedHostname === normalizedExpectedHost || normalizedHostname.endsWith(`.${normalizedExpectedHost}`)
}

function shouldLoadYtfApp() {
  const deployTarget = import.meta.env.VITE_SUPERMEGA_DEPLOY_TARGET?.trim().toLowerCase()
  if (typeof window === 'undefined') {
    return deployTarget === 'ytf'
  }

  const hostname = normalizeHostToken(window.location.hostname)
  const localHost = hostname === 'localhost' || hostname === '127.0.0.1'
  const ytfHost = hostMatches(hostname, 'ytf.supermega.dev') || hostMatches(hostname, 'ytf-plant-a.supermega.dev')
  const productHost = hostMatches(hostname, 'app.supermega.dev')
    || hostMatches(hostname, 'pos.supermega.dev')
    || hostMatches(hostname, 'supermega.dev')

  if (ytfHost) return true
  if (localHost || productHost) return false
  return deployTarget === 'ytf'
}

function shouldLoadPosApp() {
  const deployTarget = import.meta.env.VITE_SUPERMEGA_DEPLOY_TARGET?.trim().toLowerCase()
  if (typeof window === 'undefined') {
    return deployTarget === 'pos'
  }
  const hostname = normalizeHostToken(window.location.hostname)
  const pathname = window.location.pathname.trim().toLowerCase()
  const posHost = hostMatches(hostname, 'pos.supermega.dev')
  const posPath = pathname === '/pos' || pathname.startsWith('/pos/')
  if (posHost) return true
  if (posPath) return true
  return deployTarget === 'pos'
}

function resolveFallbackLoginHref() {
  if (typeof window === 'undefined') {
    return '/login?next=/app/manager-system'
  }
  const hostname = normalizeHostToken(window.location.hostname)
  if (hostMatches(hostname, 'pos.supermega.dev')) {
    return '/pos/login'
  }
  return '/login?next=/app/manager-system'
}

function lazyWithTimeout<T extends ComponentType<unknown>>(
  label: string,
  load: () => Promise<{ default: T }>,
  timeoutMs = 15_000,
) {
  return lazy(async () => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} load timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    try {
      return await Promise.race([load(), timeoutPromise])
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  })
}

const SharedApp = lazyWithTimeout('Shared app', () => import('./App.tsx'), 45_000)
const YtfApp = lazyWithTimeout('YTF app', () => import('./YtfApp.tsx'), 60_000)

const loadYtfApp = shouldLoadYtfApp()
const loadPosApp = !loadYtfApp && shouldLoadPosApp()
const posAppPreloadPromise = loadPosApp ? import('./PosApp.tsx') : null
const PosApp = lazyWithTimeout('POS app', () => posAppPreloadPromise ?? import('./PosApp.tsx'), 15_000)

const App = loadYtfApp ? YtfApp : loadPosApp ? PosApp : SharedApp
const appLoadingLabel = loadPosApp ? 'Opening POS workspace...' : 'Loading workspace...'

initAnalytics()
void initMonitoring()

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void error
    void errorInfo
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="sm-route-loading sm-route-error">
        <strong>Could not open workspace.</strong>
        <span>Refresh the page. If it still fails, return to login.</span>
        <div>
          <button onClick={() => window.location.reload()} type="button">
            Refresh
          </button>
          <a href={resolveFallbackLoginHref()}>Login</a>
        </div>
      </div>
    )
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hostname = normalizeHostToken(window.location.hostname)
    const ytfHost = hostMatches(hostname, 'ytf.supermega.dev') || hostMatches(hostname, 'ytf-plant-a.supermega.dev')
    const dynamicAppHost = hostMatches(hostname, 'app.supermega.dev') || hostMatches(hostname, 'pos.supermega.dev')
    if (ytfHost || dynamicAppHost) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined)
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<div className="sm-route-loading">{appLoadingLabel}</div>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
)
