type EventPayload = Record<string, unknown> | undefined

const posthogKey = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const posthogHost = (import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com').trim()

let initialized = false
let loadingPromise: Promise<void> | null = null
let posthogClient: {
  capture: (event: string, properties?: EventPayload) => void
  identify: (userId: string, properties?: EventPayload) => void
  init: (key: string, options: Record<string, unknown>) => void
} | null = null
const queuedEvents: Array<{ event: string; properties?: EventPayload }> = []
const queuedIdentities: Array<{ userId: string; properties?: EventPayload }> = []

export function analyticsEnabled() {
  return Boolean(posthogKey)
}

async function loadPosthog() {
  if (!posthogKey || posthogClient) {
    return
  }

  const module = await import('posthog-js')
  const client = module.default
  client.init(posthogKey, {
    api_host: posthogHost,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: 'localStorage+cookie',
  })

  posthogClient = client
  for (const identity of queuedIdentities.splice(0)) {
    client.identify(identity.userId, identity.properties)
  }
  for (const entry of queuedEvents.splice(0)) {
    client.capture(entry.event, entry.properties)
  }
}

export function initAnalytics() {
  if (initialized || typeof window === 'undefined' || !posthogKey) {
    return
  }

  initialized = true
  loadingPromise = loadPosthog().catch(() => {
    loadingPromise = null
  })
}

export function trackEvent(event: string, properties?: EventPayload) {
  if (!posthogKey) {
    return
  }

  if (posthogClient) {
    posthogClient.capture(event, properties)
    return
  }

  queuedEvents.push({ event, properties })
  if (!loadingPromise && initialized) {
    loadingPromise = loadPosthog().catch(() => {
      loadingPromise = null
    })
  }
}

export function identifyUser(userId: string, properties?: EventPayload) {
  if (!posthogKey || !userId) {
    return
  }

  if (posthogClient) {
    posthogClient.identify(userId, properties)
    return
  }

  queuedIdentities.push({ userId, properties })
  if (!loadingPromise && initialized) {
    loadingPromise = loadPosthog().catch(() => {
      loadingPromise = null
    })
  }
}
