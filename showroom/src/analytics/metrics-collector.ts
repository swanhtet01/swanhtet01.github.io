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
  if (!evt.product || !evt.action || typeof evt.ts !== 'number') return
  SESSION_EVENTS.push(evt)
}

export function startMetricsCollector(): void {
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

export function emitMetric(detail: MetricEvent): void {
  window.dispatchEvent(new CustomEvent('supermega:metric', { detail }))
}
