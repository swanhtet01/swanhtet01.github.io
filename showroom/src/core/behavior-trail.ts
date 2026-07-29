export const BEHAVIOR_TRAIL_KEY = 'supermega.behavior-trail.v1'

export type BehaviorProductId = 'commerce' | 'production' | 'website' | 'ecommerce' | 'unknown'

export type BehaviorTrailEvent =
  | 'home_opened'
  | 'product_opened'
  | 'setup_opened'
  | 'settings_opened'
  | 'agent_job_seen'
  | 'agent_job_chosen'

export type BehaviorTrailEntry = {
  id: string
  event: BehaviorTrailEvent
  product: BehaviorProductId
  route: string
  detail: string
  createdAt: string
}

type BehaviorPreferenceProduct = Exclude<BehaviorProductId, 'unknown'>

export type BehaviorPreferenceSnapshot = {
  contract: 'supermega.behavior_preference.v1'
  version: 1
  chosenSignals: number
  productCount: number
  preferred: {
    product: BehaviorPreferenceProduct
    detail: string
    chosenCount: number
    lastChosenAt: string
  } | null
  latest: {
    product: BehaviorPreferenceProduct
    detail: string
    createdAt: string
  } | null
}

const behaviorTrailLimit = 80

function behaviorId() {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `BEHAVIOR-${random}`.slice(0, 80)
}

function boundedText(value: unknown, fallback: string, limit: number) {
  const text = typeof value === 'string' && value.trim() ? value.trim() : fallback
  return text.slice(0, limit)
}

function normalizeBehaviorTrail(value: unknown): BehaviorTrailEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const source = entry as Partial<BehaviorTrailEntry>
      const event = source.event === 'home_opened'
        || source.event === 'product_opened'
        || source.event === 'setup_opened'
        || source.event === 'settings_opened'
        || source.event === 'agent_job_seen'
        || source.event === 'agent_job_chosen'
        ? source.event
        : null
      if (!event) return null
      const product = source.product === 'commerce'
        || source.product === 'production'
        || source.product === 'website'
        || source.product === 'ecommerce'
        ? source.product
        : 'unknown'
      return {
        id: boundedText(source.id, behaviorId(), 80),
        event,
        product,
        route: boundedText(source.route, '/', 120),
        detail: boundedText(source.detail, 'Local workspace activity', 160),
        createdAt: boundedText(source.createdAt, new Date().toISOString(), 40),
      }
    })
    .filter((entry): entry is BehaviorTrailEntry => Boolean(entry))
    .slice(-behaviorTrailLimit)
}

export function readBehaviorTrail(storage: Storage): BehaviorTrailEntry[] {
  try {
    const raw = storage.getItem(BEHAVIOR_TRAIL_KEY)
    return raw ? normalizeBehaviorTrail(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function summarizeBehaviorPreferences(entries: BehaviorTrailEntry[]): BehaviorPreferenceSnapshot {
  const chosen = entries.filter((entry): entry is BehaviorTrailEntry & { product: BehaviorPreferenceProduct } => (
    entry.event === 'agent_job_chosen' && entry.product !== 'unknown'
  ))
  const grouped = new Map<string, BehaviorPreferenceSnapshot['preferred']>()
  chosen.forEach((entry) => {
    const key = `${entry.product}:${entry.detail}`
    const current = grouped.get(key)
    grouped.set(key, {
      product: entry.product,
      detail: entry.detail,
      chosenCount: (current?.chosenCount ?? 0) + 1,
      lastChosenAt: !current || entry.createdAt > current.lastChosenAt ? entry.createdAt : current.lastChosenAt,
    })
  })
  const preferred = [...grouped.values()]
    .filter((entry): entry is NonNullable<BehaviorPreferenceSnapshot['preferred']> => Boolean(entry))
    .sort((left, right) => (
      right.chosenCount - left.chosenCount
      || right.lastChosenAt.localeCompare(left.lastChosenAt)
      || left.product.localeCompare(right.product)
      || left.detail.localeCompare(right.detail)
    ))[0] ?? null
  const latestEntry = [...chosen].sort((left, right) => (
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
  ))[0]

  return {
    contract: 'supermega.behavior_preference.v1',
    version: 1,
    chosenSignals: chosen.length,
    productCount: new Set(chosen.map((entry) => entry.product)).size,
    preferred,
    latest: latestEntry
      ? { product: latestEntry.product, detail: latestEntry.detail, createdAt: latestEntry.createdAt }
      : null,
  }
}

export function recordBehaviorSignal(storage: Storage, entry: Omit<BehaviorTrailEntry, 'id' | 'createdAt'>) {
  try {
    const current = readBehaviorTrail(storage)
    const normalized = normalizeBehaviorTrail([{
      ...entry,
      id: behaviorId(),
      createdAt: new Date().toISOString(),
    }])[0]
    if (!normalized) return
    const previous = current.at(-1)
    if (previous && previous.event === normalized.event && previous.route === normalized.route && previous.product === normalized.product && previous.detail === normalized.detail) return
    storage.setItem(BEHAVIOR_TRAIL_KEY, JSON.stringify([...current, normalized].slice(-behaviorTrailLimit)))
  } catch {
    // Behavior learning remains optional when browser storage is unavailable.
  }
}
