const sentryDsn = (import.meta.env.VITE_SENTRY_DSN ?? '').trim()

let initialized = false

export function monitoringEnabled() {
  return Boolean(sentryDsn)
}

export async function initMonitoring() {
  if (initialized || typeof window === 'undefined' || !sentryDsn) {
    return
  }

  initialized = true

  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn: sentryDsn,
      environment: (import.meta.env.MODE ?? 'production').trim(),
      tracesSampleRate: 0.05,
      sendDefaultPii: false,
    })
  } catch {
    initialized = false
  }
}
