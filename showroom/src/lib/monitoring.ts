const sentryDsn = (import.meta.env.VITE_SENTRY_DSN ?? '').trim()
const sentryEnabled = String(import.meta.env.VITE_SENTRY_ENABLED ?? '1').trim() !== '0'

let initialized = false

function numericEnv(value: unknown, fallback: number) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function monitoringEnabled() {
  return Boolean(sentryDsn && sentryEnabled)
}

export async function initMonitoring() {
  if (initialized || typeof window === 'undefined' || !sentryDsn || !sentryEnabled) {
    return
  }

  initialized = true

  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn: sentryDsn,
      environment: (import.meta.env.MODE ?? 'production').trim(),
      tracesSampleRate: numericEnv(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.01),
      sampleRate: numericEnv(import.meta.env.VITE_SENTRY_ERROR_SAMPLE_RATE, 0.2),
      sendDefaultPii: false,
      ignoreErrors: [
        'AbortError',
        'Failed to fetch',
        'Load failed',
        'NetworkError',
        'ResizeObserver loop completed with undelivered notifications.',
        'ResizeObserver loop limit exceeded',
        'Script error.',
      ],
      beforeSend(event, hint) {
        const exceptionText =
          typeof hint.originalException === 'string'
            ? hint.originalException
            : event.exception?.values?.map((item) => item.value ?? item.type ?? '').join(' ')
        const message = [exceptionText, event.message].filter(Boolean).join(' ')
        if (/extension|chrome-extension|moz-extension|safari-extension/i.test(message)) {
          return null
        }
        return event
      },
    })
  } catch {
    initialized = false
  }
}
