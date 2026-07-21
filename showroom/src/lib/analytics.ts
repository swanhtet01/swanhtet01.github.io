type EventPayload = Record<string, unknown> | undefined

const BLOCKED_PROPERTY = /(text|body|content|message|name|email|phone|address|credential|password|token|secret|source|file|url|payload|note)/i

function sanitizeEventPayload(properties: EventPayload): EventPayload {
  if (!properties) return undefined
  const safe: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (BLOCKED_PROPERTY.test(key)) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') safe[key] = value
  }
  return Object.keys(safe).length ? safe : undefined
}

const posthogKey = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const posthogHost = (import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com').trim()
const firstPartyEventsEndpoint = (import.meta.env.VITE_FIRST_PARTY_EVENTS_ENDPOINT ?? '').trim()

let initialized = false
let loadingPromise: Promise<void> | null = null
let posthogClient: {
  capture: (event: string, properties?: EventPayload) => void
  identify: (userId: string, properties?: EventPayload) => void
  init: (key: string, options: Record<string, unknown>) => void
} | null = null
const queuedEvents: Array<{ event: string; properties?: EventPayload }> = []
const queuedIdentities: Array<{ userId: string; properties?: EventPayload }> = []

const FIRST_PARTY_EVENT_TYPES: Record<string, string> = {
  page_viewed: 'page_viewed',
  commerce_template_edited: 'setup_started',
  commerce_channel_selected: 'setup_started',
  commerce_worker_toggled: 'setup_started',
  commerce_conversation_parsed: 'setup_started',
  commerce_catalog_imported: 'setup_started',
  commerce_blueprint_imported: 'setup_started',
  commerce_stage_advanced: 'cta_clicked',
  commerce_handoff_exported: 'lead_form_submitted',
  commerce_blueprint_exported: 'template_clicked',
  commerce_catalog_template_downloaded: 'template_clicked',
  commerce_catalog_exported: 'template_clicked',
  commerce_demo_reset: 'setup_started',
}

function recordFirstPartyEvent(event: string) {
  const eventType = FIRST_PARTY_EVENT_TYPES[event]
  if (!eventType || typeof window === 'undefined' || !firstPartyEventsEndpoint) return
  const entrySource = new URLSearchParams(window.location.search).get('source')
  const allowedEntrySource = entrySource && ['agent-product', 'demo', 'public-site'].includes(entrySource) ? entrySource : undefined
  const payload = {
    event_type: eventType,
    page_path: window.location.pathname,
    template_id: event.startsWith('commerce_') ? 'commerce-machine' : undefined,
    component: event,
    utm_source: allowedEntrySource,
    user_device_mode: window.innerWidth < 640 ? 'phone' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
  }
  void fetch(firstPartyEventsEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined)
}

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
    capture_pageleave: false,
    // Workflow events are explicitly named in product code; never collect form text or DOM content.
    autocapture: false,
    disable_session_recording: true,
    respect_dnt: true,
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
  recordFirstPartyEvent(event)
  if (!posthogKey) {
    return
  }

  const safeProperties = sanitizeEventPayload(properties)
  if (posthogClient) {
    posthogClient.capture(event, safeProperties)
    return
  }

  queuedEvents.push({ event, properties: safeProperties })
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

  const safeProperties = sanitizeEventPayload(properties)

  if (posthogClient) {
    posthogClient.identify(userId, safeProperties)
    return
  }

  queuedIdentities.push({ userId, properties: safeProperties })
  if (!loadingPromise && initialized) {
    loadingPromise = loadPosthog().catch(() => {
      loadingPromise = null
    })
  }
}
