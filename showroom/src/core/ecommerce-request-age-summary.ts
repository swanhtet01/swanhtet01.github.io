import type {
  EcommerceBuyingState,
  EcommerceFulfilment,
  EcommerceOrderRequestV2,
} from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type RequestAgeBucket = {
  count: number
  totalMmk: number
}

export type EcommerceRequestAgeSummary = {
  totalPending: number
  byAge: {
    fresh: RequestAgeBucket
    aging: RequestAgeBucket
    stale: RequestAgeBucket
  }
  oldestRequestAgeHours: number | null
  pendingReturnIntents: number
  pendingCancellationIntents: number
}

export function projectEcommerceRequestAgeSummary(
  buying: EcommerceBuyingState,
  asOf: string,
): EcommerceRequestAgeSummary {
  const now = Date.parse(asOf)
  const fresh: RequestAgeBucket = { count: 0, totalMmk: 0 }
  const aging: RequestAgeBucket = { count: 0, totalMmk: 0 }
  const stale: RequestAgeBucket = { count: 0, totalMmk: 0 }
  let oldestAgeHours: number | null = null

  for (const req of buying.requests) {
    const ageMs = now - Date.parse(req.createdAt)
    const ageHours = Math.floor(ageMs / (1000 * 3600))
    if (oldestAgeHours === null || ageHours > oldestAgeHours) oldestAgeHours = ageHours
    if (ageHours < 24) {
      fresh.count += 1
      fresh.totalMmk += req.totalMmk
    } else if (ageHours < 168) {
      aging.count += 1
      aging.totalMmk += req.totalMmk
    } else {
      stale.count += 1
      stale.totalMmk += req.totalMmk
    }
  }

  // returnIntents has no resolution marker of its own — a return only resolves via a
  // Shop CommerceOrder's .returns array (see projectEcommerceReturnOutcome), which this
  // projection doesn't receive, so it cannot exclude resolved returns here.
  const cancellationDecisionIntentIds = new Set(buying.cancellationDecisions.map((d) => d.intentId))
  const pendingCancellationIntents = buying.cancellationIntents
    .filter((c) => !cancellationDecisionIntentIds.has(c.id)).length

  return {
    totalPending: buying.requests.length,
    byAge: { fresh, aging, stale },
    oldestRequestAgeHours: oldestAgeHours,
    pendingReturnIntents: buying.returnIntents.length,
    pendingCancellationIntents,
  }
}

export type StaleRequestQueueEntry = {
  id: string
  createdAt: string
  customerReference: string
  fulfilment: EcommerceFulfilment
  totalMmk: number
  ageHours: number
  tier: 'aging' | 'stale'
}

// Same fresh/aging/stale boundaries as projectEcommerceRequestAgeSummary's byAge buckets
// (< 24h fresh, 24h-167h aging, >= 168h stale) — this just keeps the individual requests
// behind those two non-fresh buckets instead of collapsing them into counts, sorted
// oldest-first, so a Shop operator can see which specific pending requests need a manual
// follow-up. Fresh requests are excluded: they are not yet late enough to need one.
export function projectEcommerceStaleRequestQueue(
  requests: EcommerceOrderRequestV2[],
  asOf: string,
): StaleRequestQueueEntry[] {
  const now = Date.parse(asOf)
  const entries: StaleRequestQueueEntry[] = []

  for (const req of requests) {
    const ageMs = now - Date.parse(req.createdAt)
    const ageHours = Math.floor(ageMs / (1000 * 3600))
    if (ageHours < 24) continue
    entries.push({
      id: req.id,
      createdAt: req.createdAt,
      customerReference: req.customerReference,
      fulfilment: req.fulfilment,
      totalMmk: req.totalMmk,
      ageHours,
      tier: ageHours < 168 ? 'aging' : 'stale',
    })
  }

  return entries.sort((a, b) => b.ageHours - a.ageHours)
}
