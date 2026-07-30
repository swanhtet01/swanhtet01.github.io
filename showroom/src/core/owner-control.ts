import {
  buildBusinessCommandAnswer,
  rankBusinessAttention,
  type BusinessCommandAnswer,
  type BusinessCommandIntent,
  type LocalBusinessSnapshot,
} from './business-command.ts'

export const OWNER_CONTROL_ACKNOWLEDGEMENTS_KEY = 'supermega.owner-control-acknowledgements.v1'

export type LocalOwnerControlAcknowledgement = {
  contract: 'supermega.local_owner_control_acknowledgement.v1'
  runKey: string
  sourceFingerprint: string
  itemId: string
  product: 'shop' | 'plant' | 'website' | 'ecommerce'
  acknowledgedAt: string
}

export type OwnerControlItem = {
  itemId: string
  intent: Exclude<BusinessCommandIntent, 'attention'>
  product: 'shop' | 'plant' | 'website' | 'ecommerce'
  priority: 'critical' | 'high' | 'routine'
  title: string
  summary: string
  facts: BusinessCommandAnswer['facts']
  nextAction: BusinessCommandAnswer['nextAction']
  status: 'pending' | 'acknowledged'
}

export type LocalOwnerControlRun = {
  contract: 'supermega.local_owner_control_run.v1'
  runKey: string
  sourceFingerprint: string
  sourceCount: number
  pendingCount: number
  acknowledgedCount: number
  title: string
  summary: string
  items: OwnerControlItem[]
  primary: OwnerControlItem | null
  externalWritesPerformed: false
}

type OwnerControlStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const productOrder = ['shop', 'plant', 'website', 'ecommerce'] as const

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function isProduct(value: unknown): value is LocalOwnerControlAcknowledgement['product'] {
  return productOrder.some((product) => product === value)
}

function normalizeAcknowledgements(value: unknown): LocalOwnerControlAcknowledgement[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: LocalOwnerControlAcknowledgement[] = []
  for (const candidate of value.slice(-120).reverse()) {
    if (!candidate || typeof candidate !== 'object') continue
    const source = candidate as Partial<LocalOwnerControlAcknowledgement>
    const runKey = boundedText(source.runKey, 80)
    const sourceFingerprint = boundedText(source.sourceFingerprint, 2048)
    const itemId = boundedText(source.itemId, 80)
    const acknowledgedAt = boundedText(source.acknowledgedAt, 40)
    if (source.contract !== 'supermega.local_owner_control_acknowledgement.v1'
      || !runKey.startsWith('local:')
      || !sourceFingerprint.startsWith('{"contract":"supermega.local_business_snapshot.v1"')
      || !itemId.startsWith('control:')
      || !isProduct(source.product)
      || !Number.isFinite(Date.parse(acknowledgedAt))) continue
    const key = `${runKey}:${itemId}:${sourceFingerprint}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({
      contract: 'supermega.local_owner_control_acknowledgement.v1',
      runKey,
      sourceFingerprint,
      itemId,
      product: source.product,
      acknowledgedAt,
    })
    if (normalized.length === 60) break
  }
  return normalized.reverse()
}

export function readLocalOwnerControlAcknowledgements(storage: Pick<OwnerControlStorage, 'getItem'>) {
  try {
    const raw = storage.getItem(OWNER_CONTROL_ACKNOWLEDGEMENTS_KEY)
    return raw ? normalizeAcknowledgements(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function itemPriority(level: number): OwnerControlItem['priority'] {
  if (level >= 4) return 'critical'
  if (level >= 2) return 'high'
  return 'routine'
}

export function buildLocalOwnerControlRun(
  snapshot: LocalBusinessSnapshot,
  acknowledgements: LocalOwnerControlAcknowledgement[],
): LocalOwnerControlRun {
  if (snapshot.contract !== 'supermega.local_business_snapshot.v1') throw new Error('Owner control snapshot contract is invalid.')
  const sourceCount = [snapshot.shop, snapshot.plant, snapshot.website, snapshot.ecommerce].filter((source) => source.status === 'ready').length
  const sourceFingerprint = JSON.stringify(snapshot)
  const runKey = `local:${stableHash(sourceFingerprint)}`
  const acknowledgedItems = new Set(
    normalizeAcknowledgements(acknowledgements)
      .filter((acknowledgement) => acknowledgement.runKey === runKey)
      .filter((acknowledgement) => acknowledgement.sourceFingerprint === sourceFingerprint)
      .map((acknowledgement) => acknowledgement.itemId),
  )
  const ranked = rankBusinessAttention(snapshot)
  const selected = ranked.length
    ? ranked.slice(0, 3)
    : [{ intent: 'shop_inventory' as const, level: 0, load: 0, order: 0 }]
  const items = selected.map(({ intent, level }): OwnerControlItem => {
    const answer = buildBusinessCommandAnswer(snapshot, intent)
    const product = answer.nextAction.product
    if (!isProduct(product)) throw new Error('Owner control action product is invalid.')
    const itemId = `control:${stableHash(`${runKey}:${intent}:${answer.nextAction.path}:${answer.nextAction.label}`)}`
    return {
      itemId,
      intent,
      product,
      priority: itemPriority(level),
      title: answer.title,
      summary: answer.summary,
      facts: answer.facts,
      nextAction: answer.nextAction,
      status: acknowledgedItems.has(itemId) ? 'acknowledged' : 'pending',
    }
  })
  const pending = items.filter((item) => item.status === 'pending')
  const noSources = sourceCount === 0
  return {
    contract: 'supermega.local_owner_control_run.v1',
    runKey,
    sourceFingerprint,
    sourceCount,
    pendingCount: pending.length,
    acknowledgedCount: items.length - pending.length,
    title: noSources
      ? 'Start with one trusted business source'
      : pending.length
        ? `${pending.length} owner review${pending.length === 1 ? '' : 's'} ready`
        : 'Current control run is clear',
    summary: noSources
      ? 'Load a sample or import real records. SuperMega will rank the first owner review without inventing business facts.'
      : pending.length
        ? 'SuperMega ranked the current validated exceptions. Open the first workflow, then acknowledge the exact evidence reviewed.'
        : 'Every item from this exact source revision has an owner acknowledgement. Changed records automatically open a new run.',
    items,
    primary: pending[0] ?? null,
    externalWritesPerformed: false,
  }
}

export function acknowledgeLocalOwnerControlItem(
  storage: OwnerControlStorage,
  run: LocalOwnerControlRun,
  item: OwnerControlItem,
) {
  if (!run.items.some((candidate) => candidate.itemId === item.itemId && candidate.product === item.product)) {
    throw new Error('Owner control item does not belong to this run.')
  }
  const current = readLocalOwnerControlAcknowledgements(storage).filter((acknowledgement) => (
    acknowledgement.runKey !== run.runKey || acknowledgement.itemId !== item.itemId
  ))
  const next: LocalOwnerControlAcknowledgement = {
    contract: 'supermega.local_owner_control_acknowledgement.v1',
    runKey: run.runKey,
    sourceFingerprint: run.sourceFingerprint,
    itemId: item.itemId,
    product: item.product,
    acknowledgedAt: new Date().toISOString(),
  }
  const normalized = normalizeAcknowledgements([...current, next])
  storage.setItem(OWNER_CONTROL_ACKNOWLEDGEMENTS_KEY, JSON.stringify(normalized))
  return normalized
}
