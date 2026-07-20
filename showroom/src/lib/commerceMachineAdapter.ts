export type CommerceCatalogItem = {
  id: string
  name: string
  price: number
  stock: number
  unit: string
}

export type CommerceCatalogSource = 'shop-api' | 'client-import' | 'demo'

export type CommerceCatalog = {
  items: CommerceCatalogItem[]
  source: CommerceCatalogSource
  checkedAt: string
}

export type CommerceMachinePolicy = {
  language: string
  fulfillment: string
  approvalThreshold: number
  autoReply: boolean
}

export type CommerceMachineBlueprint = {
  version: 1
  kind: 'supermega-commerce-machine'
  businessName: string
  channel: string
  catalogSource: CommerceCatalogSource
  policy: CommerceMachinePolicy
  catalog: CommerceCatalogItem[]
  enabledWorkers: string[]
  approvalRules: string[]
}

export const COMMERCE_CATALOG_ENDPOINT = '/api/shop/catalog'

export function normalizeCommerceCatalog(input: unknown): CommerceCatalogItem[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || ''),
      price: Number(item.price),
      stock: Number(item.stock),
      unit: String(item.unit || 'item'),
    }))
    .filter((item) => item.id && item.name && Number.isFinite(item.price) && Number.isFinite(item.stock))
}

export async function loadShopCatalog(signal?: AbortSignal): Promise<CommerceCatalog | null> {
  try {
    const response = await fetch(COMMERCE_CATALOG_ENDPOINT, { headers: { Accept: 'application/json' }, signal })
    if (!response.ok) return null
    const payload = await response.json() as { items?: unknown }
    const items = normalizeCommerceCatalog(payload.items ?? payload)
    return items.length ? { items, source: 'shop-api', checkedAt: new Date().toISOString() } : null
  } catch {
    return null
  }
}

export function catalogExport(items: CommerceCatalogItem[]) {
  return JSON.stringify(items, null, 2)
}

export function normalizeCommerceMachineBlueprint(input: unknown): CommerceMachineBlueprint | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (value.kind !== 'supermega-commerce-machine' || value.version !== 1) return null
  const catalog = normalizeCommerceCatalog(value.catalog)
  const policy = value.policy && typeof value.policy === 'object' ? value.policy as Record<string, unknown> : null
  if (!catalog.length || !policy) return null
  return {
    version: 1,
    kind: 'supermega-commerce-machine',
    businessName: String(value.businessName || 'Client shop'),
    channel: String(value.channel || 'Messenger'),
    catalogSource: value.catalogSource === 'shop-api' || value.catalogSource === 'client-import' ? value.catalogSource : 'client-import',
    policy: {
      language: String(policy.language || 'Myanmar + English'),
      fulfillment: String(policy.fulfillment || 'Delivery or pickup'),
      approvalThreshold: Math.max(0, Number(policy.approvalThreshold) || 0),
      autoReply: policy.autoReply !== false,
    },
    catalog,
    enabledWorkers: Array.isArray(value.enabledWorkers) ? value.enabledWorkers.map(String).filter(Boolean) : ['Commerce Closer', 'Ops Watch', 'Owner Brief'],
    approvalRules: Array.isArray(value.approvalRules) ? value.approvalRules.map(String).filter(Boolean) : [],
  }
}
