// Local-only browser instrumentation. No outbound calls, no external library.
// All PII exclusion is structural: fields not in MetricEvent cannot be emitted.
// See hq/research/analytics-design-2026-08.md for full design and go/no-go conditions.

export type MetricProduct = 'shop' | 'plant' | 'website' | 'ecommerce' | 'hq'

export type MetricEvent = {
  product: MetricProduct
  capability: string | null
  action: string
  ts: number
}

export type LocalProductActivity = {
  product: Exclude<MetricProduct, 'hq'>
  eventCount: number
  latestAt: string | null
}

export type LocalActivityLifecycle = {
  contract: 'supermega.local_activity_lifecycle.v1'
  scope: 'device_local_activity'
  source: 'bounded_device_record'
  spansEarlierSessions: true
  eventCount: number
  productEventCount: number
  hqEventCount: number
  atCapacity: boolean
  products: LocalProductActivity[]
  externalTelemetryObserved: false
  customerEvidenceProven: false
  commercialPerformanceProven: false
  productionOperationProven: false
}

// Persistence. The key is reserved in core/local-workspace-storage.ts and is listed in
// company-backup.ts as deliberately NOT portable: these are counters about THIS device, and
// re-asserting them on another one would describe activity that never happened there.
//
// Until this existed the collector held events in a module array, so every reload erased the
// record. A pilot whose whole purpose is evidence would have produced none.
export const LOCAL_METRICS_STORAGE_KEY = 'supermega.hq.local-metrics.v1'
export const LOCAL_METRICS_SCHEMA = 'supermega.local_metrics.v1' as const
// A shop trades for months on one device. Keep the newest events and let the tail go rather
// than growing without bound in a storage area shared with the business records.
export const LOCAL_METRICS_MAX_EVENTS = 500

const METRIC_PRODUCTS: readonly MetricProduct[] = ['shop', 'plant', 'website', 'ecommerce', 'hq']

type MetricsStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function metricsStorage(): MetricsStorage | undefined {
  try { return globalThis.localStorage as MetricsStorage | undefined } catch { return undefined }
}

export function validMetricEvent(value: unknown): value is MetricEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<MetricEvent>
  if (!METRIC_PRODUCTS.includes(event.product as MetricProduct)) return false
  if (typeof event.action !== 'string' || !event.action || event.action.length > 120) return false
  if (typeof event.ts !== 'number' || !Number.isSafeInteger(event.ts) || !Number.isFinite(new Date(event.ts).getTime())) return false
  if (event.capability !== null && (typeof event.capability !== 'string' || event.capability.length > 120)) return false
  // Structural PII exclusion: a stored record carrying anything beyond the four known fields
  // is not ours, so refuse it rather than let an unknown field survive a reload.
  return Object.keys(event).every((key) => key === 'product' || key === 'capability' || key === 'action' || key === 'ts')
}

const LOCAL_ACTIVITY_PRODUCTS: readonly Exclude<MetricProduct, 'hq'>[] = ['shop', 'plant', 'website', 'ecommerce']

export function projectLocalActivityLifecycle(events: readonly unknown[]): LocalActivityLifecycle {
  const accepted = events.filter(validMetricEvent).slice(-LOCAL_METRICS_MAX_EVENTS)
  return {
    contract: 'supermega.local_activity_lifecycle.v1',
    scope: 'device_local_activity',
    source: 'bounded_device_record',
    spansEarlierSessions: true,
    eventCount: accepted.length,
    productEventCount: accepted.filter((event) => event.product !== 'hq').length,
    hqEventCount: accepted.filter((event) => event.product === 'hq').length,
    atCapacity: accepted.length === LOCAL_METRICS_MAX_EVENTS,
    products: LOCAL_ACTIVITY_PRODUCTS.map((product) => {
      const productEvents = accepted.filter((event) => event.product === product)
      const latestTimestamp = productEvents.reduce((latest, event) => Math.max(latest, event.ts), Number.NEGATIVE_INFINITY)
      return {
        product,
        eventCount: productEvents.length,
        latestAt: Number.isFinite(latestTimestamp) ? new Date(latestTimestamp).toISOString() : null,
      }
    }),
    externalTelemetryObserved: false,
    customerEvidenceProven: false,
    commercialPerformanceProven: false,
    productionOperationProven: false,
  }
}

export function readStoredMetrics(storage: MetricsStorage | undefined = metricsStorage()): MetricEvent[] {
  if (!storage) return []
  let raw: string | null
  try { raw = storage.getItem(LOCAL_METRICS_STORAGE_KEY) } catch { return [] }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { schema?: unknown; events?: unknown }
    if (parsed?.schema !== LOCAL_METRICS_SCHEMA || !Array.isArray(parsed.events)) return []
    // Drop individually malformed events instead of discarding the whole history: partial
    // measurement is still measurement, and analytics must never be the reason data is lost.
    return parsed.events.filter(validMetricEvent).slice(-LOCAL_METRICS_MAX_EVENTS)
  } catch {
    return []
  }
}

export function writeStoredMetrics(events: readonly MetricEvent[], storage: MetricsStorage | undefined = metricsStorage()): boolean {
  if (!storage) return false
  const bounded = events.slice(-LOCAL_METRICS_MAX_EVENTS)
  try {
    storage.setItem(LOCAL_METRICS_STORAGE_KEY, JSON.stringify({ schema: LOCAL_METRICS_SCHEMA, version: 1, events: bounded }))
    return true
  } catch {
    // Quota, private mode, or a disabled store. Instrumentation must never break the till,
    // so this is swallowed deliberately and the in-memory record continues.
    return false
  }
}

const SESSION_EVENTS: MetricEvent[] = []

const SURFACE_MAP: Record<string, { product: MetricProduct; surface: string }> = {
  '/shop': { product: 'shop', surface: 'sell' },
  '/shop/orders': { product: 'shop', surface: 'orders' },
  '/shop/stock': { product: 'shop', surface: 'stock' },
  '/plant': { product: 'plant', surface: 'jobs' },
  '/plant/problems': { product: 'plant', surface: 'problems' },
  '/website': { product: 'website', surface: 'preview' },
  '/website/edit': { product: 'website', surface: 'edit' },
  '/ecommerce': { product: 'ecommerce', surface: 'store' },
  '/ecommerce/cart': { product: 'ecommerce', surface: 'cart' },
  '/work': { product: 'hq', surface: 'work' },
  '/settings': { product: 'hq', surface: 'settings' },
}

// Exported for the client error reporter (core/client-error-reporter.ts), which reuses
// this closed map so an error event can carry a coarse surface label without ever
// touching the raw hash or its query params.
export function surfaceFromHash(): { product: MetricProduct; surface: string } | null {
  const hash = location.hash.replace('#', '').split('?')[0]
  const sorted = Object.keys(SURFACE_MAP).sort((a, b) => b.length - a.length)
  for (const prefix of sorted) {
    if (hash.startsWith(prefix)) return SURFACE_MAP[prefix]
  }
  if (!hash || hash === '/') return { product: 'hq', surface: 'home' }
  return null
}

function pushEvent(evt: MetricEvent) {
  if (!validMetricEvent(evt)) return
  SESSION_EVENTS.push(evt)
  if (SESSION_EVENTS.length > LOCAL_METRICS_MAX_EVENTS) SESSION_EVENTS.splice(0, SESSION_EVENTS.length - LOCAL_METRICS_MAX_EVENTS)
  writeStoredMetrics(SESSION_EVENTS)
}

export function startMetricsCollector(): void {
  // Continue the existing record rather than beginning a new one on every reload.
  if (SESSION_EVENTS.length === 0) SESSION_EVENTS.push(...readStoredMetrics())

  window.addEventListener('supermega:metric', (e) => {
    const detail = (e as CustomEvent<MetricEvent>).detail
    pushEvent(detail)
  })

  const onNavigate = () => {
    const resolved = surfaceFromHash()
    if (!resolved) return
    pushEvent({ product: resolved.product, capability: null, action: `surface.${resolved.surface}.visited`, ts: Date.now() })
  }

  window.addEventListener('hashchange', onNavigate)
  onNavigate()
}

export function getSessionEvents(): readonly MetricEvent[] {
  return SESSION_EVENTS
}

/** Everything recorded on this device, including events from earlier sessions. */
export function getRecordedEvents(): readonly MetricEvent[] {
  return SESSION_EVENTS
}

export function emitMetric(detail: MetricEvent): void {
  window.dispatchEvent(new CustomEvent('supermega:metric', { detail }))
}
