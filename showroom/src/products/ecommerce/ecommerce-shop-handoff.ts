import type { CommerceItem } from '../../core/commerce-workspace.ts'
import {
  validateStorefrontOrderRequest,
  type StorefrontOrderRequest,
} from './storefront-request.ts'

export const ECOMMERCE_SHOP_DRAFT_SCHEMA = 'supermega.ecommerce.shop_draft.v1' as const

export type EcommerceShopDraft = {
  schema: typeof ECOMMERCE_SHOP_DRAFT_SCHEMA
  mode: 'browser-memory-shop-draft'
  state: 'review_required'
  id: string
  sourceRequestId: string
  sourcePreviewDigest: string
  createdAt: string
  confirmedAt: string
  customerReference: string
  fulfilment: 'pickup' | 'delivery'
  currency: 'MMK'
  line: {
    sku: string
    name: string
    variant: string | null
    quantity: number
    unitPriceMmk: number
  }
  totalMmk: number
  evidenceReference: string
}

const draftIdPattern = /^ESD-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const requestIdPattern = /^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const digestPattern = /^sha256:[a-f0-9]{64}$/
let drafts: EcommerceShopDraft[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function isIsoTimestamp(value: unknown) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
}

function isCanonicalText(value: unknown, maximum: number) {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= maximum
}

function parseEcommerceShopDraft(value: unknown): EcommerceShopDraft | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'mode', 'state', 'id', 'sourceRequestId', 'sourcePreviewDigest', 'createdAt', 'confirmedAt', 'customerReference', 'fulfilment', 'currency', 'line', 'totalMmk', 'evidenceReference'])
    || value.schema !== ECOMMERCE_SHOP_DRAFT_SCHEMA
    || value.mode !== 'browser-memory-shop-draft'
    || value.state !== 'review_required'
    || typeof value.id !== 'string'
    || !draftIdPattern.test(value.id)
    || typeof value.sourceRequestId !== 'string'
    || !requestIdPattern.test(value.sourceRequestId)
    || value.id !== `ESD-${value.sourceRequestId.slice(4)}`
    || typeof value.sourcePreviewDigest !== 'string'
    || !digestPattern.test(value.sourcePreviewDigest)
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.confirmedAt)
    || Date.parse(String(value.confirmedAt)) < Date.parse(String(value.createdAt))
    || !isCanonicalText(value.customerReference, 80)
    || value.fulfilment !== 'pickup' && value.fulfilment !== 'delivery'
    || value.currency !== 'MMK'
    || !isRecord(value.line)
    || !hasExactKeys(value.line, ['sku', 'name', 'variant', 'quantity', 'unitPriceMmk'])
    || !isCanonicalText(value.line.sku, 80)
    || !isCanonicalText(value.line.name, 180)
    || value.line.variant !== null && !isCanonicalText(value.line.variant, 180)
    || !Number.isSafeInteger(value.line.quantity)
    || Number(value.line.quantity) < 1
    || Number(value.line.quantity) > 99
    || !Number.isSafeInteger(value.line.unitPriceMmk)
    || Number(value.line.unitPriceMmk) < 1
    || !Number.isSafeInteger(value.totalMmk)
    || Number(value.totalMmk) !== Number(value.line.quantity) * Number(value.line.unitPriceMmk)
    || typeof value.evidenceReference !== 'string'
    || value.evidenceReference !== `ECOMMERCE:${value.sourceRequestId}:${value.sourcePreviewDigest}`) return null
  return value as EcommerceShopDraft
}

function sameRequestIntent(draft: EcommerceShopDraft, request: StorefrontOrderRequest) {
  return draft.sourceRequestId === request.id
    && draft.sourcePreviewDigest === request.sourcePreviewDigest
    && draft.createdAt === request.createdAt
    && draft.customerReference === request.customerReference
    && draft.fulfilment === request.fulfilment
    && draft.currency === request.currency
    && draft.line.sku === request.line.sku
    && draft.line.name === request.line.name
    && draft.line.variant === request.line.variant
    && draft.line.quantity === request.line.quantity
    && draft.line.unitPriceMmk === request.line.unitPriceMmk
    && draft.totalMmk === request.totalMmk
}

function matchingCatalogItem(draft: EcommerceShopDraft, catalog: CommerceItem[]) {
  const matches = catalog.filter((item) => item.sku === draft.line.sku)
  if (matches.length !== 1) return null
  const item = matches[0]
  return item.name === draft.line.name
    && (item.variant ?? null) === draft.line.variant
    && item.price === draft.line.unitPriceMmk
    && item.onHand >= draft.line.quantity
    ? item
    : null
}

export function recordEcommerceShopDraft(input: {
  request: StorefrontOrderRequest
  currentCatalog: CommerceItem[]
  confirmedAt: string
}) {
  const request = validateStorefrontOrderRequest(input.request)
  if (!isIsoTimestamp(input.confirmedAt) || Date.parse(input.confirmedAt) < Date.parse(request.createdAt)) {
    throw new Error('Shop handoff confirmation time is invalid.')
  }
  const existing = drafts.find((candidate) => candidate.sourceRequestId === request.id)
  if (existing) {
    if (!sameRequestIntent(existing, request)) throw new Error('This request ID conflicts with an existing Shop draft.')
    return existing
  }
  const draft: EcommerceShopDraft = {
    schema: ECOMMERCE_SHOP_DRAFT_SCHEMA,
    mode: 'browser-memory-shop-draft',
    state: 'review_required',
    id: `ESD-${request.id.slice(4)}`,
    sourceRequestId: request.id,
    sourcePreviewDigest: request.sourcePreviewDigest,
    createdAt: request.createdAt,
    confirmedAt: input.confirmedAt,
    customerReference: request.customerReference,
    fulfilment: request.fulfilment,
    currency: 'MMK',
    line: { ...request.line },
    totalMmk: request.totalMmk,
    evidenceReference: `ECOMMERCE:${request.id}:${request.sourcePreviewDigest}`,
  }
  const validated = parseEcommerceShopDraft(draft)
  if (!validated || !matchingCatalogItem(validated, input.currentCatalog)) {
    throw new Error('The Ecommerce Shop draft failed its final integrity check.')
  }
  drafts = [validated, ...drafts].slice(0, 20)
  return validated
}

export function readLatestEcommerceShopDraft() {
  return drafts[0] ?? null
}

export function ecommerceShopDraftMatchesCatalog(value: unknown, catalog: CommerceItem[]): value is EcommerceShopDraft {
  const draft = parseEcommerceShopDraft(value)
  return Boolean(draft && matchingCatalogItem(draft, catalog))
}

export function dismissEcommerceShopDraft(id: string) {
  const before = drafts.length
  drafts = drafts.filter((draft) => draft.id !== id)
  return drafts.length !== before
}
