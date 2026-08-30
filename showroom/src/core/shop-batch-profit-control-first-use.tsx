import { useEffect, useMemo, useRef, useState } from 'react'

import type { CommerceOrder, CommerceState } from './commerce-workspace'
import { collectLocalWorkspaceBackup } from './local-workspace-backup'
import {
  projectShopBatchProfitControl,
  type ShopBatchProfitControlInput,
  type ShopBatchProfitControlProjection,
} from './shop-batch-profit-control'

export const SHOP_BATCH_FIRST_USE_STORAGE_KEY = 'supermega.shop.batch-profit-control.local-workspace.v1'
export const SHOP_BATCH_FIRST_USE_STORAGE_CONTRACT = 'supermega.shop.batch_profit_control.local_workspace.v1'
export const SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES = 2_000_000
// The origin-wide key is legal only for the one confirmed browser-local Shop. Managed and
// identity-unconfirmed shops fail before reading it, so tenant evidence can never enter it.
export const SHOP_BATCH_FIRST_USE_LOCAL_SCOPE = 'confirmed-local' as const

const LOCAL_RECORD_CONTRACT = 'supermega.shop.batch_profit_control.local_record.v1'
const COMMERCE_SOURCE_SNAPSHOT_CONTRACT = 'supermega.shop.batch_profit_control.commerce_source_snapshot.v1'
const STORAGE_LOCK_NAME = `${SHOP_BATCH_FIRST_USE_STORAGE_KEY}.exclusive-write`
const LOCAL_OPERATING_CLASSIFICATION = 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof'
const MAX_RECORDS = 100
const MAX_COUNT = 100_000
const MAX_MMK = 1_000_000_000_000
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/

type JsonObject = Record<string, unknown>

export type ShopBatchFirstUseStorage = Pick<Storage, 'getItem' | 'key' | 'length' | 'setItem'>
export type ShopBatchFirstUseLockManager = Pick<LockManager, 'request'>
export type ShopBatchFirstUseWorkspaceScope = typeof SHOP_BATCH_FIRST_USE_LOCAL_SCOPE

export type ShopBatchEligibleSaleLine = {
  selectionId: string
  sku: string
  itemName: string
  variant: string | null
  completedAt: string
  sourceBusinessDate: string
  netUnits: number
  netValueMmk: number
  sourceLine: ShopBatchProfitControlInput['sourceRecordSet']['saleLines'][number]
}

export type ShopBatchEligibleSaleEvidence = {
  lines: ShopBatchEligibleSaleLine[]
  blocked: {
    incompleteEvidence: number
    invalidAdjustments: number
    missingLines: number
    sampleOrSynthetic: number
  }
}

export type ShopBatchFirstUseItemInput = {
  producedUnits: number
  leftoverUnits: number
  wastedUnits: number
  remakeUnits: number
  preorderUnits: number
  reviewedUnitCostEstimateMmk: number
  ownerReviewed: boolean
}

export type ShopBatchFirstUseDraft = {
  batchId: string
  businessDate: string
  selectedLineDigests: string[]
  itemInputs: Record<string, ShopBatchFirstUseItemInput>
  packagingCostMmk: number
  deliveryCostMmk: number
  otherReviewedBatchCostMmk: number
  otherReviewedBatchCostReason: 'none' | 'fuel' | 'market_fee' | 'temporary_labor' | 'other_reviewed'
  overheadOwnerReviewed: boolean
}

type ShopBatchPersistedInputLeaves = Omit<ShopBatchProfitControlInput, 'workspaceHistorySnapshot' | 'workspaceHistoryReceipt'>

type ShopBatchLocalRecord = {
  contract: typeof LOCAL_RECORD_CONTRACT
  recordRevision: number
  priorRecordDigest: string | null
  createdAt: string
  batchId: string
  commerceSourceSnapshotDigest: string
  workspaceSnapshotDigest: string
  inputLeaves: ShopBatchPersistedInputLeaves
  projectionDigest: string
  recordDigest: string
}

type ShopBatchLocalStore = {
  contract: typeof SHOP_BATCH_FIRST_USE_STORAGE_CONTRACT
  version: 1
  records: ShopBatchLocalRecord[]
  headRecordDigest: string | null
  controls: {
    appendOnly: true
    currentShopWorkspaceMutated: false
    paymentWrite: false
    stockWrite: false
    supplierWrite: false
    accountingWrite: false
    customerWrite: false
    hostedWrite: false
    providerWrite: false
    modelUsed: false
    pilotEvidenceCreated: false
    commercialProofCreated: false
  }
}

const STORE_CONTROLS: ShopBatchLocalStore['controls'] = {
  appendOnly: true,
  currentShopWorkspaceMutated: false,
  paymentWrite: false,
  stockWrite: false,
  supplierWrite: false,
  accountingWrite: false,
  customerWrite: false,
  hostedWrite: false,
  providerWrite: false,
  modelUsed: false,
  pilotEvidenceCreated: false,
  commercialProofCreated: false,
}

function fail(code: string): never {
  throw new Error(code)
}

function assertLocalWorkspaceScope(scope: unknown): asserts scope is ShopBatchFirstUseWorkspaceScope {
  if (scope !== SHOP_BATCH_FIRST_USE_LOCAL_SCOPE) fail('shop_batch_first_use_managed_workspace_blocked')
}

function asObject(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(code)
  return value as JsonObject
}

function exactKeys(value: unknown, expected: readonly string[], code: string) {
  const keys = Object.keys(asObject(value, code)).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) fail(code)
}

function safeWhole(value: unknown, code: string, maximum = MAX_MMK) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) fail(code)
  return Number(value)
}

function safeTimestamp(value: unknown, code: string) {
  if (typeof value !== 'string') fail(code)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) fail(code)
  return parsed
}

function safeDate(value: unknown, code: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(code)
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) fail(code)
  return value
}

function safeDigest(value: unknown, code: string) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code)
  return value
}

function normalizeCanonical(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.normalize('NFC')
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('shop_batch_first_use_canonical_number_invalid')
    return value
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeCanonical(entry, seen))
  const source = asObject(value, 'shop_batch_first_use_canonical_object_invalid')
  if (seen.has(source)) fail('shop_batch_first_use_canonical_cycle')
  seen.add(source)
  const normalized: JsonObject = {}
  const sourceKeys = Object.keys(source)
  const keys = sourceKeys.map((key) => key.normalize('NFC')).sort()
  if (new Set(keys).size !== keys.length) fail('shop_batch_first_use_canonical_key_collision')
  for (const key of keys) {
    const sourceKey = sourceKeys.find((candidate) => candidate.normalize('NFC') === key)
    if (!sourceKey || source[sourceKey] === undefined) fail('shop_batch_first_use_canonical_value_invalid')
    normalized[key] = normalizeCanonical(source[sourceKey], seen)
  }
  seen.delete(source)
  return normalized
}

function canonicalJson(value: unknown) {
  return JSON.stringify(normalizeCanonical(value))
}

async function canonicalDigest(value: unknown) {
  if (!globalThis.crypto?.subtle) fail('shop_batch_first_use_digest_unavailable')
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function withoutField(value: unknown, field: string) {
  const source = asObject(value, 'shop_batch_first_use_digest_body_invalid')
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== field))
}

function yangonDate(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestampMs))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function syntheticMarker(value: string | undefined) {
  const marker = String(value ?? '').toUpperCase()
  return marker.startsWith('ACT-DEMO-') || marker.startsWith('SETUP-') || marker.startsWith('SEED-')
}

function sampleOrder(order: CommerceOrder, sampleOrderIds: ReadonlySet<string>) {
  return order.id.startsWith('SETUP-SAMPLE-')
    || sampleOrderIds.has(order.id)
    || syntheticMarker(order.sourceRecordId)
    || syntheticMarker(order.evidenceReference)
    || syntheticMarker(order.completion?.actionId)
    || syntheticMarker(order.completion?.evidenceReference)
    || syntheticMarker(order.paymentReconciliationActionId)
    || syntheticMarker(order.paymentEvidenceReference)
}

function allocateWholeAmount(total: number, weights: number[]) {
  safeWhole(total, 'shop_batch_first_use_discount_invalid')
  for (const weight of weights) safeWhole(weight, 'shop_batch_first_use_line_value_invalid')
  const weightTotal = weights.reduce((sum, weight) => sum + BigInt(weight), 0n)
  if (weightTotal === 0n) {
    if (total) fail('shop_batch_first_use_discount_without_value')
    return weights.map(() => 0)
  }
  if (BigInt(total) > weightTotal) fail('shop_batch_first_use_discount_exceeds_value')
  const rows = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight)
    return { index, value: Number(numerator / weightTotal), remainder: numerator % weightTotal }
  })
  let remainder = total - rows.reduce((sum, row) => sum + row.value, 0)
  const ranked = [...rows].sort((left, right) => left.remainder === right.remainder
    ? left.index - right.index
    : left.remainder > right.remainder ? -1 : 1)
  for (let index = 0; remainder > 0; index += 1, remainder -= 1) rows[ranked[index].index].value += 1
  return rows.sort((left, right) => left.index - right.index).map((row) => row.value)
}

function safeItemName(value: unknown) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120 || /@|https?:|\\/iu.test(value)) fail('shop_batch_first_use_item_name_invalid')
  return value.normalize('NFC')
}

function safeSku(value: unknown) {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) fail('shop_batch_first_use_sku_invalid')
  return value
}

// eslint-disable-next-line react-refresh/only-export-components -- source-owned receipt derivation is tested through this action-loaded boundary
export async function deriveShopBatchEligibleSaleLines(commerce: CommerceState): Promise<ShopBatchEligibleSaleEvidence> {
  if (!commerce || !Array.isArray(commerce.orders) || !Array.isArray(commerce.movements)) fail('shop_batch_first_use_workspace_invalid')
  if (commerce.orders.length > MAX_COUNT || commerce.movements.length > MAX_COUNT) fail('shop_batch_first_use_workspace_too_large')
  const sampleOrderIds = new Set<string>()
  for (const movement of commerce.movements) {
    if (movement.orderId && (syntheticMarker(movement.actionId) || syntheticMarker(movement.evidenceReference))) sampleOrderIds.add(movement.orderId)
  }
  const blocked = { incompleteEvidence: 0, invalidAdjustments: 0, missingLines: 0, sampleOrSynthetic: 0 }
  const lines: ShopBatchEligibleSaleLine[] = []
  let eligibleLineCount = 0
  const ordered = [...commerce.orders].sort((left, right) => left.id.localeCompare(right.id))
  for (const order of ordered) {
    if (sampleOrder(order, sampleOrderIds)) {
      blocked.sampleOrSynthetic += 1
      continue
    }
    if (order.status !== 'completed' || order.paymentStatus !== 'reconciled' || !order.paymentReconciledAt || !order.completion) {
      if (order.status === 'completed') blocked.incompleteEvidence += 1
      continue
    }
    const completion = order.completion
    const paymentReconciledAt = order.paymentReconciledAt
    const completionMs = safeTimestamp(completion.capturedAt, 'shop_batch_first_use_completion_invalid')
    const reconciliationMs = safeTimestamp(paymentReconciledAt, 'shop_batch_first_use_payment_review_invalid')
    if (completionMs < reconciliationMs) fail('shop_batch_first_use_completion_before_payment_review')
    if ((order.returns?.length ?? 0) > 0 || (order.corrections?.length ?? 0) > 0 || order.refundStatus !== 'none') {
      blocked.invalidAdjustments += 1
      continue
    }
    if (!order.lines?.length) {
      blocked.missingLines += 1
      continue
    }
    eligibleLineCount += order.lines.length
    if (eligibleLineCount > MAX_COUNT) fail('shop_batch_first_use_workspace_too_large')
    const itemNames: string[] = []
    const variants: Array<string | null> = []
    const listedValues = order.lines.map((line) => {
      safeSku(line.sku)
      itemNames.push(safeItemName(line.name))
      variants.push(line.variant ? safeItemName(line.variant) : null)
      const quantity = safeWhole(line.quantity, 'shop_batch_first_use_sale_units_invalid', MAX_COUNT)
      const unitPrice = safeWhole(line.unitPriceMmk, 'shop_batch_first_use_unit_price_invalid')
      const value = BigInt(quantity) * BigInt(unitPrice)
      if (value > BigInt(MAX_MMK)) fail('shop_batch_first_use_line_value_invalid')
      return Number(value)
    })
    const listedSubtotal = listedValues.reduce((sum, value) => sum + BigInt(value), 0n)
    const promotion = order.promotionDecision
    let discountMmk = 0
    if (promotion) {
      const promotionGross = safeWhole(promotion.grossSubtotalMmk, 'shop_batch_first_use_promotion_gross_invalid')
      const promotionDiscount = safeWhole(promotion.discountMmk, 'shop_batch_first_use_discount_invalid')
      const promotionNet = safeWhole(promotion.netSubtotalMmk, 'shop_batch_first_use_promotion_net_invalid')
      const reviewedAtMs = safeTimestamp(promotion.reviewedAt, 'shop_batch_first_use_promotion_review_invalid')
      if (BigInt(promotionGross) !== listedSubtotal
        || BigInt(promotionNet) !== listedSubtotal - BigInt(promotionDiscount)
        || reviewedAtMs > completionMs
        || (promotion.status !== 'approved' && promotionDiscount !== 0)) {
        blocked.invalidAdjustments += 1
        continue
      }
      discountMmk = promotion.status === 'approved' ? promotionDiscount : 0
    }
    const discounts = allocateWholeAmount(discountMmk, listedValues)
    const expectedSubtotal = listedSubtotal - BigInt(discountMmk)
    const recordedSubtotal = order.calculation?.subtotalMmk ?? order.total
    safeWhole(recordedSubtotal, 'shop_batch_first_use_subtotal_invalid')
    if (expectedSubtotal !== BigInt(recordedSubtotal)) {
      blocked.invalidAdjustments += 1
      continue
    }
    const sourceBusinessDate = yangonDate(completionMs)
    const orderLines = await Promise.all(order.lines.map(async (line, index) => {
      const netUnits = line.quantity
      const netValueMmk = listedValues[index] - discounts[index]
      const [orderLineBindingDigest, completionBindingDigest, adjustmentBindingDigest] = await Promise.all([
        canonicalDigest({
          contract: 'supermega.shop.batch_profit_control.commerce_order_line_binding.v1',
          orderId: order.id,
          lineIndex: index,
          sku: line.sku,
          itemName: itemNames[index],
          variant: variants[index],
          quantity: line.quantity,
          unitPriceMmk: line.unitPriceMmk,
          netUnits,
          netValueMmk,
        }),
        canonicalDigest({
          contract: 'supermega.shop.batch_profit_control.commerce_completion_binding.v1',
          orderId: order.id,
          completion,
          paymentStatus: order.paymentStatus,
          paymentReconciledAt,
          paymentReconciliationActionId: order.paymentReconciliationActionId ?? null,
          paymentReconciledBy: order.paymentReconciledBy ?? null,
          paymentReconciliationReason: order.paymentReconciliationReason ?? null,
          paymentEvidenceReference: order.paymentEvidenceReference ?? null,
        }),
        canonicalDigest({
          contract: 'supermega.shop.batch_profit_control.commerce_adjustment_binding.v1',
          orderId: order.id,
          promotionDecision: order.promotionDecision ?? null,
          refundStatus: order.refundStatus,
          returns: [],
          corrections: [],
        }),
      ])
      const sourceLine: ShopBatchEligibleSaleLine['sourceLine'] = {
        sku: line.sku,
        orderLineBindingDigest,
        completionBindingDigest,
        completedAt: completion.capturedAt,
        sourceBusinessDate,
        netUnits,
        netValueMmk,
        nonSample: true,
        paymentReconciled: true,
        completionPresent: true,
        returnCount: 0,
        refundCount: 0,
        correctionCount: 0,
        discountCount: discounts[index] > 0 ? 1 : 0,
        adjustmentBindingDigest,
      }
      return {
        selectionId: orderLineBindingDigest,
        sku: line.sku,
        itemName: itemNames[index],
        variant: variants[index],
        completedAt: completion.capturedAt,
        sourceBusinessDate,
        netUnits,
        netValueMmk,
        sourceLine,
      }
    }))
    lines.push(...orderLines)
  }
  lines.sort((left, right) => left.selectionId.localeCompare(right.selectionId))
  if (new Set(lines.map((line) => line.selectionId)).size !== lines.length) fail('shop_batch_first_use_sale_allocation_ambiguous')
  return { lines, blocked }
}

function emptyStore(): ShopBatchLocalStore {
  return {
    contract: SHOP_BATCH_FIRST_USE_STORAGE_CONTRACT,
    version: 1,
    records: [],
    headRecordDigest: null,
    controls: { ...STORE_CONTROLS },
  }
}

function readRaw(storage: ShopBatchFirstUseStorage) {
  try {
    return storage.getItem(SHOP_BATCH_FIRST_USE_STORAGE_KEY)
  } catch {
    fail('shop_batch_first_use_storage_unavailable')
  }
}

function candidateBackupStorage(storage: ShopBatchFirstUseStorage, serializedBatchStore: string) {
  // Weigh the exact post-append device without committing it. The source-owned backup
  // collector remains the single authority for registered keys, envelope bytes, and count.
  const keys: string[] = []
  const values = new Map<string, string>()
  try {
    const length = storage.length
    if (!Number.isInteger(length) || length < 0) fail('shop_batch_first_use_workspace_backup_capacity_unavailable')
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index)
      if (typeof key !== 'string' || keys.includes(key)) continue
      keys.push(key)
      if (key !== SHOP_BATCH_FIRST_USE_STORAGE_KEY) {
        const value = storage.getItem(key)
        if (value !== null) values.set(key, value)
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'shop_batch_first_use_workspace_backup_capacity_unavailable') throw error
    fail('shop_batch_first_use_workspace_backup_capacity_unavailable')
  }
  if (!keys.includes(SHOP_BATCH_FIRST_USE_STORAGE_KEY)) keys.push(SHOP_BATCH_FIRST_USE_STORAGE_KEY)
  return {
    get length() { return keys.length },
    key(index: number) { return keys[index] ?? null },
    getItem(key: string) {
      return key === SHOP_BATCH_FIRST_USE_STORAGE_KEY ? serializedBatchStore : values.get(key) ?? null
    },
  }
}

function assertWorkspaceBackupCapacity(storage: ShopBatchFirstUseStorage, serializedBatchStore: string, createdAt: string) {
  let backup
  try {
    backup = collectLocalWorkspaceBackup(candidateBackupStorage(storage, serializedBatchStore), createdAt)
  } catch {
    fail('shop_batch_first_use_workspace_backup_capacity_unavailable')
  }
  if (!backup) fail('shop_batch_first_use_workspace_backup_capacity_exceeded')
}

function parseStore(raw: string | null): ShopBatchLocalStore {
  if (raw === null) return emptyStore()
  if (new TextEncoder().encode(raw).byteLength > SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES) fail('shop_batch_first_use_storage_size_exceeded')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { fail('shop_batch_first_use_storage_invalid') }
  exactKeys(parsed, ['contract', 'version', 'records', 'headRecordDigest', 'controls'], 'shop_batch_first_use_storage_shape_invalid')
  const store = parsed as ShopBatchLocalStore
  if (store.contract !== SHOP_BATCH_FIRST_USE_STORAGE_CONTRACT || store.version !== 1) fail('shop_batch_first_use_storage_contract_invalid')
  if (!Array.isArray(store.records) || store.records.length > MAX_RECORDS) fail('shop_batch_first_use_storage_record_count_invalid')
  if (store.headRecordDigest !== null) safeDigest(store.headRecordDigest, 'shop_batch_first_use_storage_head_invalid')
  exactKeys(store.controls, Object.keys(STORE_CONTROLS), 'shop_batch_first_use_storage_controls_invalid')
  for (const [key, expected] of Object.entries(STORE_CONTROLS)) if (store.controls[key as keyof typeof STORE_CONTROLS] !== expected) fail('shop_batch_first_use_storage_controls_invalid')
  return store
}

function historyRecord(record: ShopBatchLocalRecord): ShopBatchProfitControlInput['workspaceHistorySnapshot']['records'][number] {
  return {
    envelope: structuredClone(record.inputLeaves.batchEnvelope),
    saleAllocationLedger: structuredClone(record.inputLeaves.saleAllocationLedger),
    retainedEvidenceReceipt: structuredClone(record.inputLeaves.retainedEvidenceReceipt),
  }
}

async function hydrateInput(
  inputLeaves: ShopBatchPersistedInputLeaves,
  priorRecords: ShopBatchLocalRecord[],
): Promise<ShopBatchProfitControlInput> {
  const projectionAt = inputLeaves.dispositionCore.projectionAt
  const candidateBatchId = inputLeaves.batchEnvelope.batchId
  const candidateRevision = inputLeaves.batchEnvelope.revision
  const records = priorRecords.map(historyRecord).sort((left, right) => {
    const leftKey = `${left.envelope.batchId}\u0000${String(left.envelope.revision).padStart(6, '0')}`
    const rightKey = `${right.envelope.batchId}\u0000${String(right.envelope.revision).padStart(6, '0')}`
    return leftKey.localeCompare(rightKey)
  })
  const workspaceHistorySnapshot: ShopBatchProfitControlInput['workspaceHistorySnapshot'] = {
    contract: 'supermega.shop.batch_profit_control.workspace_history_snapshot.v1',
    capturedAt: projectionAt,
    projectionAt,
    candidateBatchId,
    candidateRevision,
    scope: 'all_active_closed_voided_batch_lineages',
    recordCount: records.length,
    records,
    controls: {
      sourceOwnedWorkspaceScan: true,
      callerProvidedSubsetAccepted: false,
      completeWorkspaceScan: true,
      activeClosedVoidedIncluded: true,
      privateIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    recordSetDigest: '',
    snapshotDigest: '',
  }
  workspaceHistorySnapshot.recordSetDigest = await canonicalDigest({
    contract: 'supermega.shop.batch_profit_control.workspace_history_record_set.v1',
    capturedAt: projectionAt,
    projectionAt,
    candidateBatchId,
    candidateRevision,
    scope: workspaceHistorySnapshot.scope,
    records,
  })
  workspaceHistorySnapshot.snapshotDigest = await canonicalDigest(withoutField(workspaceHistorySnapshot, 'snapshotDigest'))
  const workspaceHistoryReceipt: ShopBatchProfitControlInput['workspaceHistoryReceipt'] = {
    contract: 'supermega.shop.batch_profit_control.workspace_history_receipt.v1',
    generatedAt: projectionAt,
    projectionAt,
    candidateBatchId,
    candidateRevision,
    scope: 'all_active_closed_voided_batch_lineages',
    sourceWorkspaceRecordSetDigest: workspaceHistorySnapshot.recordSetDigest,
    sourceWorkspaceSnapshotDigest: workspaceHistorySnapshot.snapshotDigest,
    recordCount: records.length,
    controls: {
      sourceDerived: true,
      completeWorkspaceScan: true,
      activeClosedVoidedIncluded: true,
      manualHistoryAssertionAccepted: false,
      omittedHistoryAllowed: false,
      privateIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    receiptDigest: '',
  }
  workspaceHistoryReceipt.receiptDigest = await canonicalDigest(withoutField(workspaceHistoryReceipt, 'receiptDigest'))
  return {
    ...structuredClone(inputLeaves),
    workspaceHistorySnapshot,
    workspaceHistoryReceipt,
  }
}

async function currentSourceSnapshotDigest(
  saleLines: ShopBatchProfitControlInput['sourceRecordSet']['saleLines'],
) {
  return canonicalDigest({ contract: COMMERCE_SOURCE_SNAPSHOT_CONTRACT, saleLines })
}

async function validateCurrentCommerceSource(record: ShopBatchLocalRecord, current: ShopBatchEligibleSaleEvidence) {
  const byDigest = new Map(current.lines.map((line) => [line.sourceLine.orderLineBindingDigest, line.sourceLine]))
  const retained = record.inputLeaves.sourceRecordSet.saleLines.map((line) => {
    const candidate = byDigest.get(line.orderLineBindingDigest)
    if (!candidate || canonicalJson(candidate) !== canonicalJson(line)) fail('shop_batch_first_use_source_snapshot_stale')
    return candidate
  })
  if (await currentSourceSnapshotDigest(retained) !== record.commerceSourceSnapshotDigest) fail('shop_batch_first_use_source_snapshot_stale')
}

async function validateStore(store: ShopBatchLocalStore, commerce: CommerceState | null) {
  if (store.records.length > MAX_RECORDS) fail('shop_batch_first_use_storage_record_count_invalid')
  const currentCommerceEvidence = commerce ? await deriveShopBatchEligibleSaleLines(commerce) : null
  let priorRecordDigest: string | null = null
  const seenBatchIds = new Set<string>()
  for (const [index, record] of store.records.entries()) {
    exactKeys(record, ['contract', 'recordRevision', 'priorRecordDigest', 'createdAt', 'batchId', 'commerceSourceSnapshotDigest', 'workspaceSnapshotDigest', 'inputLeaves', 'projectionDigest', 'recordDigest'], 'shop_batch_first_use_record_shape_invalid')
    if (record.contract !== LOCAL_RECORD_CONTRACT || record.recordRevision !== index + 1 || record.priorRecordDigest !== priorRecordDigest) fail('shop_batch_first_use_record_lineage_invalid')
    safeTimestamp(record.createdAt, 'shop_batch_first_use_record_time_invalid')
    if (!SAFE_ID_PATTERN.test(record.batchId) || seenBatchIds.has(record.batchId)) fail('shop_batch_first_use_batch_id_reused')
    seenBatchIds.add(record.batchId)
    safeDigest(record.commerceSourceSnapshotDigest, 'shop_batch_first_use_source_snapshot_digest_invalid')
    safeDigest(record.workspaceSnapshotDigest, 'shop_batch_first_use_workspace_snapshot_digest_invalid')
    safeDigest(record.projectionDigest, 'shop_batch_first_use_projection_digest_invalid')
    safeDigest(record.recordDigest, 'shop_batch_first_use_record_digest_invalid')
    exactKeys(record.inputLeaves, [
      'dispositionCore',
      'sourceRecordSet',
      'saleAllocationLedger',
      'productionCostReceipt',
      'overheadReceipt',
      'retainedEvidenceReceipt',
      'batchEnvelope',
      ...(record.inputLeaves.marginFloorBasisPoints === undefined ? [] : ['marginFloorBasisPoints']),
    ], 'shop_batch_first_use_record_input_shape_invalid')
    if (record.inputLeaves.batchEnvelope.batchId !== record.batchId || record.inputLeaves.dispositionCore.projectionAt !== record.createdAt) fail('shop_batch_first_use_record_binding_invalid')
    if (await canonicalDigest(withoutField(record, 'recordDigest')) !== record.recordDigest) fail('shop_batch_first_use_record_digest_mismatch')
    priorRecordDigest = record.recordDigest
  }
  if (store.headRecordDigest !== priorRecordDigest) fail('shop_batch_first_use_storage_head_mismatch')
  if (currentCommerceEvidence) for (const record of store.records) await validateCurrentCommerceSource(record, currentCommerceEvidence)
  const latest = store.records.at(-1)
  if (!latest) return { store, projection: null as ShopBatchProfitControlProjection | null }
  const input = await hydrateInput(latest.inputLeaves, store.records.slice(0, -1))
  if (input.workspaceHistorySnapshot.snapshotDigest !== latest.workspaceSnapshotDigest) fail('shop_batch_first_use_workspace_snapshot_digest_mismatch')
  const projection = await projectShopBatchProfitControl(input, latest.workspaceSnapshotDigest)
  if (await canonicalDigest(projection) !== latest.projectionDigest) fail('shop_batch_first_use_projection_digest_mismatch')
  return { store, projection }
}

async function readValidatedStore(storage: ShopBatchFirstUseStorage, commerce: CommerceState | null) {
  const raw = readRaw(storage)
  const store = parseStore(raw)
  const validated = await validateStore(store, commerce)
  return { raw, ...validated }
}

function assertDraft(draft: ShopBatchFirstUseDraft, projectionAt: string) {
  if (!SAFE_ID_PATTERN.test(draft.batchId)) fail('shop_batch_first_use_batch_id_invalid')
  const projectionAtMs = safeTimestamp(projectionAt, 'shop_batch_first_use_projection_time_invalid')
  const businessDate = safeDate(draft.businessDate, 'shop_batch_first_use_business_date_invalid')
  if (businessDate > yangonDate(projectionAtMs)) fail('shop_batch_first_use_business_date_future')
  if (!draft.selectedLineDigests.length || draft.selectedLineDigests.length > MAX_COUNT) fail('shop_batch_first_use_sale_selection_required')
  if (new Set(draft.selectedLineDigests).size !== draft.selectedLineDigests.length) fail('shop_batch_first_use_sale_selection_duplicate')
  safeWhole(draft.packagingCostMmk, 'shop_batch_first_use_packaging_cost_invalid')
  safeWhole(draft.deliveryCostMmk, 'shop_batch_first_use_delivery_cost_invalid')
  safeWhole(draft.otherReviewedBatchCostMmk, 'shop_batch_first_use_other_cost_invalid')
  if (!['none', 'fuel', 'market_fee', 'temporary_labor', 'other_reviewed'].includes(draft.otherReviewedBatchCostReason)) fail('shop_batch_first_use_other_cost_reason_invalid')
  if ((draft.otherReviewedBatchCostMmk === 0) !== (draft.otherReviewedBatchCostReason === 'none')) fail('shop_batch_first_use_other_cost_reason_mismatch')
  if (!draft.overheadOwnerReviewed) fail('shop_batch_first_use_overhead_review_required')
}

async function buildInput(
  commerce: CommerceState,
  draft: ShopBatchFirstUseDraft,
  store: ShopBatchLocalStore,
  projectionAt: string,
) {
  assertDraft(draft, projectionAt)
  if (store.records.some((record) => record.batchId === draft.batchId)) fail('shop_batch_first_use_batch_id_reused')
  const evidence = await deriveShopBatchEligibleSaleLines(commerce)
  const eligibleByDigest = new Map(evidence.lines.map((line) => [line.selectionId, line]))
  const selected = [...draft.selectedLineDigests].sort().map((digest) => {
    const line = eligibleByDigest.get(digest)
    if (!line) fail('shop_batch_first_use_sale_allocation_missing')
    return line
  })
  const priorLineDigests = new Set(store.records.flatMap((record) => record.inputLeaves.sourceRecordSet.saleLines.map((line) => line.orderLineBindingDigest)))
  if (selected.some((line) => priorLineDigests.has(line.selectionId))) fail('shop_batch_first_use_duplicate_line_reuse')
  if (selected.some((line) => line.sourceBusinessDate !== draft.businessDate)) fail('shop_batch_first_use_cross_date_requires_preorder_binding')
  const grouped = new Map<string, { itemName: string; variant: string | null; soldUnits: number }>()
  for (const line of selected) {
    const current = grouped.get(line.sku)
    if (current && (current.itemName !== line.itemName || current.variant !== line.variant)) fail('shop_batch_first_use_sale_allocation_ambiguous')
    grouped.set(line.sku, { itemName: line.itemName, variant: line.variant, soldUnits: (current?.soldUnits ?? 0) + line.netUnits })
  }
  const skus = [...grouped.keys()].sort()
  if (Object.keys(draft.itemInputs).sort().join('\u0000') !== skus.join('\u0000')) fail('shop_batch_first_use_cost_coverage_incomplete')
  const dispositionItems = skus.map((sku) => {
    const source = grouped.get(sku)!
    const input = draft.itemInputs[sku]
    for (const [label, value] of Object.entries(input).filter(([key]) => key !== 'ownerReviewed')) safeWhole(value, `shop_batch_first_use_${label}_invalid`, keyIsCount(label) ? MAX_COUNT : MAX_MMK)
    if (!input.ownerReviewed) fail('shop_batch_first_use_cost_review_required')
    if (input.producedUnits !== source.soldUnits + input.leftoverUnits + input.wastedUnits) fail('shop_batch_first_use_disposition_reconciliation_mismatch')
    if (input.remakeUnits > input.producedUnits || input.preorderUnits > input.producedUnits) fail('shop_batch_first_use_disposition_invalid')
    return {
      sku,
      itemName: source.itemName,
      producedUnits: input.producedUnits,
      leftoverUnits: input.leftoverUnits,
      wastedUnits: input.wastedUnits,
      remakeUnits: input.remakeUnits,
      preorderUnits: input.preorderUnits,
    }
  })
  const dispositionCore: ShopBatchProfitControlInput['dispositionCore'] = {
    contract: 'supermega.shop.batch_profit_control.disposition_core.v1',
    batchId: draft.batchId,
    revision: 1,
    businessDate: draft.businessDate,
    projectionAt,
    status: 'closed',
    classification: LOCAL_OPERATING_CLASSIFICATION,
    items: dispositionItems,
  }
  const standardUnitCostEstimateSources: ShopBatchProfitControlInput['sourceRecordSet']['standardUnitCostEstimateSources'] = []
  for (const item of dispositionItems) {
    const input = draft.itemInputs[item.sku]
    standardUnitCostEstimateSources.push({
      sku: item.sku,
      method: 'owner_reviewed_standard_unit_cost_estimate',
      estimateBasisDigest: await canonicalDigest({
        contract: 'supermega.shop.batch_profit_control.owner_reviewed_cost_basis.v1',
        batchId: draft.batchId,
        businessDate: draft.businessDate,
        sku: item.sku,
        producedUnits: item.producedUnits,
        ownerReviewedStandardUnitCostEstimateMmk: input.reviewedUnitCostEstimateMmk,
        reviewedAt: projectionAt,
      }),
      recipeRevisionDigest: null,
      productionRunBindingDigest: await canonicalDigest({
        contract: 'supermega.shop.batch_profit_control.production_run_binding.v1',
        batchId: draft.batchId,
        businessDate: draft.businessDate,
        item,
      }),
      ownerReviewedStandardUnitCostEstimateMmk: input.reviewedUnitCostEstimateMmk,
      reviewedByRole: 'Shop owner',
      estimateReasonCode: 'owner_standard_cost',
      standardOutputUnits: item.producedUnits,
      batchProducedUnits: item.producedUnits,
      reviewedAt: projectionAt,
      effectiveFrom: draft.businessDate,
      effectiveTo: null,
      reviewStatus: 'accepted',
      sourceState: 'accepted',
    })
  }
  const overheadSource: ShopBatchProfitControlInput['sourceRecordSet']['overheadSource'] = {
    batchId: draft.batchId,
    revision: 1,
    reviewedAt: projectionAt,
    packagingCostMmk: draft.packagingCostMmk,
    deliveryCostMmk: draft.deliveryCostMmk,
    otherReviewedBatchCostMmk: draft.otherReviewedBatchCostMmk,
    otherReviewedBatchCostReason: draft.otherReviewedBatchCostReason,
    evidenceBindingDigest: await canonicalDigest({
      contract: 'supermega.shop.batch_profit_control.overhead_evidence_binding.v1',
      batchId: draft.batchId,
      businessDate: draft.businessDate,
      packagingCostMmk: draft.packagingCostMmk,
      deliveryCostMmk: draft.deliveryCostMmk,
      otherReviewedBatchCostMmk: draft.otherReviewedBatchCostMmk,
      otherReviewedBatchCostReason: draft.otherReviewedBatchCostReason,
    }),
    ownerReviewBindingDigest: await canonicalDigest({
      contract: 'supermega.shop.batch_profit_control.overhead_owner_review.v1',
      batchId: draft.batchId,
      reviewedAt: projectionAt,
      reviewedByRole: 'Shop owner',
      ownerReviewed: true,
    }),
  }
  const saleLines = selected.map((line) => structuredClone(line.sourceLine))
  const sourceRecordSet: ShopBatchProfitControlInput['sourceRecordSet'] = {
    contract: 'supermega.shop.batch_profit_control.source_record_set.v1',
    projectionAt,
    batchId: draft.batchId,
    revision: 1,
    saleLines,
    standardUnitCostEstimateSources,
    overheadSource,
    generatedReceiptsExcluded: true,
  }
  const dispositionCoreDigest = await canonicalDigest(dispositionCore)
  const sourceRecordSetDigest = await canonicalDigest(sourceRecordSet)
  const allocations: ShopBatchProfitControlInput['saleAllocationLedger']['allocations'] = saleLines.map((line, index) => ({
    allocationId: `ALLOC-${line.orderLineBindingDigest.slice(7, 19).toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
    batchId: draft.batchId,
    envelopeRevision: 1,
    supersedesAllocationId: null,
    orderLineBindingDigest: line.orderLineBindingDigest,
    completionBindingDigest: line.completionBindingDigest,
    allocationMode: 'whole_net_line_only',
    assignmentReason: 'same_business_date',
    completedAt: line.completedAt,
    sourceBusinessDate: line.sourceBusinessDate,
    batchBusinessDate: draft.businessDate,
    retainedNetUnits: line.netUnits,
    retainedNetValueMmk: line.netValueMmk,
    allocatedNetUnits: line.netUnits,
    allocatedNetValueMmk: line.netValueMmk,
    priorAllocatedUnits: 0,
    priorAllocatedValueMmk: 0,
    remainingUnitsBefore: line.netUnits,
    remainingValueBefore: line.netValueMmk,
    preorderBatchBindingDigest: null,
  }))
  const saleAllocationLedger: ShopBatchProfitControlInput['saleAllocationLedger'] = {
    contract: 'supermega.shop.batch_profit_control.sale_allocation_ledger.v1',
    generatedAt: projectionAt,
    projectionAt,
    batchId: draft.batchId,
    revision: 1,
    dispositionCoreDigest,
    sourceRecordSetDigest,
    allocations,
    controls: {
      sourceDerived: true,
      partialAllocationAllowed: false,
      crossBatchReuseAllowed: false,
      automaticDateOrSkuInference: false,
      customerIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
      sameBatchCorrectionReplacementAllowed: true,
    },
    ledgerDigest: '',
  }
  saleAllocationLedger.ledgerDigest = await canonicalDigest(withoutField(saleAllocationLedger, 'ledgerDigest'))
  const producedUnits = dispositionItems.reduce((sum, item) => sum + item.producedUnits, 0)
  const productionCostReceipt: ShopBatchProfitControlInput['productionCostReceipt'] = {
    contract: 'supermega.shop.batch_profit_control.production_cost_receipt.v1',
    generatedAt: projectionAt,
    projectionAt,
    batchId: draft.batchId,
    revision: 1,
    businessDate: draft.businessDate,
    dispositionCoreDigest,
    sourceRecordSetDigest,
    method: 'owner_reviewed_standard_unit_cost_estimate',
    skuBindings: standardUnitCostEstimateSources.map((source) => ({ ...source, coveredProducedUnits: source.batchProducedUnits })),
    summary: {
      coveredSkuCount: standardUnitCostEstimateSources.length,
      totalSkuCount: dispositionItems.length,
      coveredProducedUnits: producedUnits,
      totalProducedUnits: producedUnits,
      quantityCoverageComplete: true,
      partialCoverageCount: 0,
      ambiguousMethodCount: 0,
    },
    controls: {
      sourceDerived: false,
      finishedSkuPurchaseReceiptAloneAccepted: false,
      quantityCoverageRequired: true,
      supplierIdentityExported: false,
      accountingWrite: false,
      supplierWrite: false,
      stockWrite: false,
      hostedWrite: false,
      ownerReviewedEstimateReceiptRequired: true,
      manualProjectionUnitCostEntryAccepted: false,
    },
    receiptDigest: '',
  }
  productionCostReceipt.receiptDigest = await canonicalDigest(withoutField(productionCostReceipt, 'receiptDigest'))
  const overheadReceipt: ShopBatchProfitControlInput['overheadReceipt'] = {
    contract: 'supermega.shop.batch_profit_control.overhead_receipt.v1',
    ...overheadSource,
    projectionAt,
    dispositionCoreDigest,
    sourceRecordSetDigest,
    controls: {
      sourceDerived: true,
      customerIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    receiptDigest: '',
  }
  overheadReceipt.receiptDigest = await canonicalDigest(withoutField(overheadReceipt, 'receiptDigest'))
  const saleLinesByDigest = new Map(saleLines.map((line) => [line.orderLineBindingDigest, line]))
  const retainedEvidenceReceipt: ShopBatchProfitControlInput['retainedEvidenceReceipt'] = {
    contract: 'supermega.shop.batch_profit_control.retained_evidence_receipt.v1',
    generatedAt: projectionAt,
    projectionAt,
    batchId: draft.batchId,
    revision: 1,
    businessDate: draft.businessDate,
    dispositionCoreDigest,
    sourceRecordSetDigest,
    saleAllocationLedgerDigest: saleAllocationLedger.ledgerDigest,
    productionCostReceiptDigest: productionCostReceipt.receiptDigest,
    ownerReviewedOverheadReceiptDigest: overheadReceipt.receiptDigest,
    saleLineBindings: allocations.map((allocation) => {
      const line = saleLinesByDigest.get(allocation.orderLineBindingDigest)
      if (!line) fail('shop_batch_first_use_sale_allocation_missing')
      return {
        ...allocation,
        sku: line.sku,
        saleAllocationLedgerDigest: saleAllocationLedger.ledgerDigest,
        completedUnits: line.netUnits,
        completedSaleValueMmk: line.netValueMmk,
        nonSample: line.nonSample,
        paymentReconciled: line.paymentReconciled,
        completionPresent: line.completionPresent,
        returnCount: line.returnCount,
        refundCount: line.refundCount,
        correctionCount: line.correctionCount,
        discountCount: line.discountCount,
        adjustmentState: 'complete',
        adjustmentBindingDigest: line.adjustmentBindingDigest,
      }
    }),
    productionCostSummary: {
      method: 'owner_reviewed_standard_unit_cost_estimate',
      productionCostReceiptDigest: productionCostReceipt.receiptDigest,
      coveredSkuCount: dispositionItems.length,
      coveredProducedUnits: producedUnits,
      totalProducedUnits: producedUnits,
      quantityCoverageComplete: true,
      ambiguousMethodCount: 0,
      partialCoverageCount: 0,
    },
    adjustmentSummary: {
      returnCount: saleLines.reduce((sum, line) => sum + line.returnCount, 0),
      refundCount: saleLines.reduce((sum, line) => sum + line.refundCount, 0),
      correctionCount: saleLines.reduce((sum, line) => sum + line.correctionCount, 0),
      discountCount: saleLines.reduce((sum, line) => sum + line.discountCount, 0),
      unresolvedAdjustmentCount: 0,
      allAdjustmentsLinked: true,
    },
    controls: {
      sourceDerived: true,
      manualEvidenceAssertionAccepted: false,
      privateIdentityExported: false,
      customerWrite: false,
      paymentWrite: false,
      stockWrite: false,
      hostedWrite: false,
    },
    receiptDigest: '',
  }
  retainedEvidenceReceipt.receiptDigest = await canonicalDigest(withoutField(retainedEvidenceReceipt, 'receiptDigest'))
  const batchEnvelope: ShopBatchProfitControlInput['batchEnvelope'] = {
    contract: 'supermega.shop.batch_profit_control.batch_envelope.v1',
    batchId: draft.batchId,
    revision: 1,
    priorEnvelopeDigest: null,
    revisionReasonCode: 'initial',
    logicalStatus: 'closed',
    businessDate: draft.businessDate,
    projectionAt,
    classification: LOCAL_OPERATING_CLASSIFICATION,
    dispositionCoreDigest,
    sourceRecordSetDigest,
    retainedEvidenceReceiptDigest: retainedEvidenceReceipt.receiptDigest,
    ownerReviewedOverheadReceiptDigest: overheadReceipt.receiptDigest,
    envelopeDigest: '',
  }
  batchEnvelope.envelopeDigest = await canonicalDigest(withoutField(batchEnvelope, 'envelopeDigest'))
  const inputLeaves: ShopBatchPersistedInputLeaves = {
    dispositionCore,
    sourceRecordSet,
    saleAllocationLedger,
    productionCostReceipt,
    overheadReceipt,
    retainedEvidenceReceipt,
    batchEnvelope,
  }
  const input = await hydrateInput(inputLeaves, store.records)
  return {
    input,
    commerceSourceSnapshotDigest: await currentSourceSnapshotDigest(saleLines),
  }
}

function keyIsCount(label: string) {
  return label !== 'reviewedUnitCostEstimateMmk'
}

function browserLockManager(): ShopBatchFirstUseLockManager | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null
}

function persistedInputLeaves(input: ShopBatchProfitControlInput): ShopBatchPersistedInputLeaves {
  return {
    dispositionCore: structuredClone(input.dispositionCore),
    sourceRecordSet: structuredClone(input.sourceRecordSet),
    saleAllocationLedger: structuredClone(input.saleAllocationLedger),
    productionCostReceipt: structuredClone(input.productionCostReceipt),
    overheadReceipt: structuredClone(input.overheadReceipt),
    retainedEvidenceReceipt: structuredClone(input.retainedEvidenceReceipt),
    batchEnvelope: structuredClone(input.batchEnvelope),
    ...(input.marginFloorBasisPoints === undefined ? {} : { marginFloorBasisPoints: input.marginFloorBasisPoints }),
  }
}

// eslint-disable-next-line react-refresh/only-export-components -- source-owned receipt loading is tested through this action-loaded boundary
export async function loadShopBatchProfitControlLocalReview(
  commerce: CommerceState,
  storage: ShopBatchFirstUseStorage,
  workspaceScope: ShopBatchFirstUseWorkspaceScope,
) {
  assertLocalWorkspaceScope(workspaceScope)
  const { store, projection } = await readValidatedStore(storage, commerce)
  return { recordCount: store.records.length, projection }
}

// eslint-disable-next-line react-refresh/only-export-components -- source-owned receipt saving is tested through this action-loaded boundary
export async function saveShopBatchProfitControlLocalReview(
  commerce: CommerceState,
  draft: ShopBatchFirstUseDraft,
  storage: ShopBatchFirstUseStorage,
  workspaceScope: ShopBatchFirstUseWorkspaceScope,
  projectionAt = new Date().toISOString(),
  readCurrentCommerce: () => CommerceState = () => commerce,
  lockManager: ShopBatchFirstUseLockManager | null = browserLockManager(),
) {
  assertLocalWorkspaceScope(workspaceScope)
  if (!lockManager) fail('shop_batch_first_use_storage_lock_unavailable')
  return lockManager.request(STORAGE_LOCK_NAME, { mode: 'exclusive' }, async (lock) => {
    if (!lock || lock.mode !== 'exclusive') fail('shop_batch_first_use_storage_lock_unavailable')
    const { raw: beforeRaw, store } = await readValidatedStore(storage, commerce)
    const { input, commerceSourceSnapshotDigest } = await buildInput(commerce, draft, store, projectionAt)
    const projection = await projectShopBatchProfitControl(structuredClone(input), input.workspaceHistorySnapshot.snapshotDigest)
    const record: ShopBatchLocalRecord = {
      contract: LOCAL_RECORD_CONTRACT,
      recordRevision: store.records.length + 1,
      priorRecordDigest: store.headRecordDigest,
      createdAt: projectionAt,
      batchId: draft.batchId,
      commerceSourceSnapshotDigest,
      workspaceSnapshotDigest: input.workspaceHistorySnapshot.snapshotDigest,
      inputLeaves: persistedInputLeaves(input),
      projectionDigest: await canonicalDigest(projection),
      recordDigest: '',
    }
    record.recordDigest = await canonicalDigest(withoutField(record, 'recordDigest'))
    const nextStore: ShopBatchLocalStore = {
      ...store,
      records: [...store.records, record],
      headRecordDigest: record.recordDigest,
    }
    await validateStore(nextStore, readCurrentCommerce())
    if (readRaw(storage) !== beforeRaw) fail('shop_batch_first_use_storage_race')
    const serialized = canonicalJson(nextStore)
    if (new TextEncoder().encode(serialized).byteLength > SHOP_BATCH_FIRST_USE_MAX_STORAGE_BYTES) fail('shop_batch_first_use_storage_size_exceeded')
    assertWorkspaceBackupCapacity(storage, serialized, projectionAt)
    try { storage.setItem(SHOP_BATCH_FIRST_USE_STORAGE_KEY, serialized) } catch { fail('shop_batch_first_use_storage_write_failed') }
    if (readRaw(storage) !== serialized) fail('shop_batch_first_use_storage_readback_failed')
    const verified = await readValidatedStore(storage, commerce)
    if (verified.store.headRecordDigest !== record.recordDigest || !verified.projection) fail('shop_batch_first_use_storage_readback_failed')
    return { recordCount: nextStore.records.length, projection: verified.projection }
  })
}

type WorkflowState =
  | { status: 'loading' }
  | { status: 'ready'; evidence: ShopBatchEligibleSaleEvidence; recordCount: number }
  | { status: 'saving'; evidence: ShopBatchEligibleSaleEvidence; recordCount: number }
  | { status: 'error'; message: string; evidence?: ShopBatchEligibleSaleEvidence; recordCount?: number }
  | { status: 'saved'; evidence: ShopBatchEligibleSaleEvidence; recordCount: number }

function displayFailure(error: unknown) {
  const code = error instanceof Error ? error.message : 'shop_batch_first_use_unknown_failure'
  const labels: Record<string, string> = {
    shop_batch_first_use_storage_unavailable: 'Local Batch storage is unavailable. No estimate was saved or shown.',
    shop_batch_first_use_storage_lock_unavailable: 'Exclusive local Batch saving is unavailable. No estimate was saved or shown.',
    shop_batch_first_use_storage_size_exceeded: 'The bounded local Batch workspace is full. Existing records remain unchanged; no estimate was saved or shown.',
    shop_batch_first_use_workspace_backup_capacity_unavailable: 'The complete local workspace backup capacity could not be verified. No estimate was saved or shown.',
    shop_batch_first_use_workspace_backup_capacity_exceeded: 'This Batch append would make the complete local workspace impossible to back up. Existing records remain unchanged; no estimate was saved or shown.',
    shop_batch_first_use_managed_workspace_blocked: 'Local Batch review is disabled for managed or unconfirmed Shop workspaces. No local Batch record was read or saved.',
    shop_batch_first_use_storage_write_failed: 'Local Batch storage refused the write. No estimate was saved or shown.',
    shop_batch_first_use_storage_readback_failed: 'The saved Batch record did not read back exactly. No estimate is trusted.',
    shop_batch_first_use_source_snapshot_stale: 'The retained Shop sale evidence changed. Reopen the workflow from the current workspace.',
    shop_batch_first_use_duplicate_line_reuse: 'A selected completed-sale line already belongs to a saved Batch review.',
    shop_batch_first_use_sale_allocation_ambiguous: 'The selected sale allocation is ambiguous. Keep one exact item/variant identity per SKU.',
    shop_batch_first_use_sale_selection_required: 'Select at least one eligible retained completed-sale line.',
    shop_batch_first_use_cost_coverage_incomplete: 'Every selected SKU needs one complete owner-reviewed cost estimate.',
    shop_batch_first_use_cost_review_required: 'Confirm the owner review for every selected SKU cost estimate.',
    shop_batch_first_use_overhead_review_required: 'Confirm the owner review for the exact Batch overhead inputs.',
    shop_batch_first_use_disposition_reconciliation_mismatch: 'Produced units must equal completed-sale units plus leftover and wasted units for every SKU.',
    shop_batch_first_use_sale_allocation_missing: 'A selected sale line is no longer eligible in the current Shop workspace.',
    shop_batch_first_use_cross_date_requires_preorder_binding: 'This first-use workflow accepts only exact same-business-date sale lines; cross-date allocation remains blocked.',
  }
  return labels[code] ?? `Batch review failed closed (${code}). No estimate was saved or shown.`
}

function initialBatchId(date: string) {
  return `BATCH-${date.replaceAll('-', '')}-01`
}

// eslint-disable-next-line react-refresh/only-export-components -- deterministic action-time date boundary has focused clock tests
export function shopBatchFirstUseReviewDefaults(timestampMs = Date.now(), recordNumber = 1) {
  const businessDate = yangonDate(timestampMs)
  return {
    businessDate,
    batchId: initialBatchId(businessDate).replace(/-01$/, `-${String(recordNumber).padStart(2, '0')}`),
  }
}

function defaultItemInput(soldUnits: number): ShopBatchFirstUseItemInput {
  return {
    producedUnits: soldUnits,
    leftoverUnits: 0,
    wastedUnits: 0,
    remakeUnits: 0,
    preorderUnits: 0,
    reviewedUnitCostEstimateMmk: 0,
    ownerReviewed: false,
  }
}

export function ShopBatchProfitControlFirstUse({
  commerce,
  onProjection,
  workspaceScope,
}: {
  commerce: CommerceState
  onProjection: (projection: ShopBatchProfitControlProjection | null) => void
  workspaceScope: ShopBatchFirstUseWorkspaceScope
}) {
  const [initialReview] = useState(() => shopBatchFirstUseReviewDefaults())
  const [workflow, setWorkflow] = useState<WorkflowState>({ status: 'loading' })
  const [newReviewChosen, setNewReviewChosen] = useState(false)
  const [reviewDate, setReviewDate] = useState(initialReview.businessDate)
  const [batchId, setBatchId] = useState(initialReview.batchId)
  const [businessDate, setBusinessDate] = useState(initialReview.businessDate)
  const [selected, setSelected] = useState<string[]>([])
  const [itemInputs, setItemInputs] = useState<Record<string, ShopBatchFirstUseItemInput>>({})
  const [packagingCostMmk, setPackagingCostMmk] = useState(0)
  const [deliveryCostMmk, setDeliveryCostMmk] = useState(0)
  const [otherReviewedBatchCostMmk, setOtherReviewedBatchCostMmk] = useState(0)
  const [otherReviewedBatchCostReason, setOtherReviewedBatchCostReason] = useState<ShopBatchFirstUseDraft['otherReviewedBatchCostReason']>('none')
  const [overheadOwnerReviewed, setOverheadOwnerReviewed] = useState(false)
  const commerceRef = useRef(commerce)
  const saveAttempt = useRef(0)

  useEffect(() => { commerceRef.current = commerce }, [commerce])

  useEffect(() => {
    let current = true
    void (async () => {
      await Promise.resolve()
      if (!current) return
      onProjection(null)
      setWorkflow({ status: 'loading' })
      try {
        if (typeof localStorage === 'undefined') fail('shop_batch_first_use_storage_unavailable')
        const evidence = await deriveShopBatchEligibleSaleLines(commerce)
        const loaded = await loadShopBatchProfitControlLocalReview(commerce, localStorage, workspaceScope)
        if (!current) return
        if (loaded.projection) onProjection(loaded.projection)
        setWorkflow({ status: 'ready', evidence, recordCount: loaded.recordCount })
        setNewReviewChosen(loaded.recordCount === 0)
      } catch (error) {
        if (current) {
          onProjection(null)
          setWorkflow({ status: 'error', message: displayFailure(error) })
        }
      }
    })()
    return () => { current = false; saveAttempt.current += 1 }
  }, [commerce, onProjection, workspaceScope])

  const evidence = workflow.status === 'ready' || workflow.status === 'saving' || workflow.status === 'saved' ? workflow.evidence : workflow.status === 'error' ? workflow.evidence ?? null : null
  const recordCount = workflow.status === 'ready' || workflow.status === 'saving' || workflow.status === 'saved' ? workflow.recordCount : workflow.status === 'error' ? workflow.recordCount ?? 0 : 0
  const selectedRows = useMemo(() => {
    const selectedIds = new Set(selected)
    return evidence?.lines.filter((line) => selectedIds.has(line.selectionId)) ?? []
  }, [evidence, selected])
  const skuGroups = useMemo(() => {
    const groups = new Map<string, { itemName: string; soldUnits: number; soldValueMmk: number }>()
    for (const line of selectedRows) {
      const current = groups.get(line.sku)
      groups.set(line.sku, {
        itemName: line.itemName,
        soldUnits: (current?.soldUnits ?? 0) + line.netUnits,
        soldValueMmk: (current?.soldValueMmk ?? 0) + line.netValueMmk,
      })
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [selectedRows])

  const toggleLine = (line: ShopBatchEligibleSaleLine) => {
    setSelected((current) => current.includes(line.selectionId)
      ? current.filter((id) => id !== line.selectionId)
      : [...current, line.selectionId].sort())
  }

  const updateItem = (sku: string, soldUnits: number, field: keyof ShopBatchFirstUseItemInput, value: number | boolean) => {
    setItemInputs((current) => ({
      ...current,
      [sku]: {
        ...(current[sku] ?? defaultItemInput(soldUnits)),
        [field]: value,
      },
    }))
  }

  const submit = async () => {
    if (!evidence || typeof localStorage === 'undefined') return
    const attempt = ++saveAttempt.current
    setWorkflow({ status: 'saving', evidence, recordCount })
    try {
      const exactItemInputs = Object.fromEntries(skuGroups.map(([sku, group]) => [sku, itemInputs[sku] ?? defaultItemInput(group.soldUnits)]))
      const saved = await saveShopBatchProfitControlLocalReview(commerce, {
        batchId,
        businessDate,
        selectedLineDigests: selected,
        itemInputs: exactItemInputs,
        packagingCostMmk,
        deliveryCostMmk,
        otherReviewedBatchCostMmk,
        otherReviewedBatchCostReason,
        overheadOwnerReviewed,
      }, localStorage, workspaceScope, new Date().toISOString(), () => commerceRef.current)
      if (attempt !== saveAttempt.current) return
      onProjection(saved.projection)
      setWorkflow({ status: 'saved', evidence, recordCount: saved.recordCount })
      setNewReviewChosen(false)
    } catch (error) {
      if (attempt !== saveAttempt.current) return
      setWorkflow({ status: 'error', message: displayFailure(error), evidence, recordCount })
    }
  }

  return <section aria-label="Local Batch Profit Control first-use workflow" className="shop-batch-first-use">
    <header>
      <div>
        <span className="core-eyebrow">Local Batch first use</span>
        <h3>Review one completed batch from current Shop records</h3>
        <p>Choose retained completed-sale lines, record disposition, and confirm owner-reviewed production-cost estimates and overhead. The current Shop workspace stays authoritative and unchanged.</p>
      </div>
      <b>Local estimate only</b>
    </header>
    <p className="shop-batch-first-use-boundary">Not baseline, pilot, customer, commercial, or accounting proof. No payment, stock, supplier, customer, hosted, provider, model, or production write runs here.</p>
    {workflow.status === 'loading' ? <p role="status">Checking the versioned local Batch workspace and current retained sale evidence…</p> : null}
    {workflow.status === 'error' ? <p className="shop-margin-gaps" role="alert">{workflow.message}</p> : null}
    {evidence ? <>
      <div className="shop-batch-first-use-status">
        <span>{evidence.lines.length} eligible retained completed-sale {evidence.lines.length === 1 ? 'line' : 'lines'}</span>
        <span>{recordCount} immutable local Batch {recordCount === 1 ? 'record' : 'records'}</span>
        <span>{evidence.blocked.invalidAdjustments + evidence.blocked.incompleteEvidence + evidence.blocked.missingLines + evidence.blocked.sampleOrSynthetic} excluded or blocked sales</span>
      </div>
      {recordCount > 0 && !newReviewChosen ? <div className="shop-batch-first-use-choice">
        <p><strong>Existing local Batch kept.</strong> It was revalidated against the current selected Shop evidence. Starting another review appends a new immutable record; it never replaces or merges an existing Batch or the Shop workspace.</p>
        <button className="core-button" onClick={() => {
          const nextReview = shopBatchFirstUseReviewDefaults(Date.now(), recordCount + 1)
          setReviewDate(nextReview.businessDate)
          setBusinessDate(nextReview.businessDate)
          setBatchId(nextReview.batchId)
          setSelected([])
          setItemInputs({})
          setNewReviewChosen(true)
        }} type="button">Start a separate local Batch review</button>
      </div> : null}
      {newReviewChosen ? <form className="shop-batch-first-use-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <fieldset>
          <legend>1. Batch identity and exact sale lines</legend>
          <label><span>Batch ID</span><input maxLength={80} onChange={(event) => setBatchId(event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,79}" required value={batchId} /></label>
          <label><span>Business date</span><input max={reviewDate} onChange={(event) => setBusinessDate(event.target.value)} required type="date" value={businessDate} /></label>
          <div aria-label="Eligible completed sale lines" className="shop-batch-first-use-lines">
            {evidence.lines.map((line) => <label key={line.selectionId}>
              <input checked={selected.includes(line.selectionId)} onChange={() => toggleLine(line)} type="checkbox" />
              <span><strong>{line.itemName}</strong><small>{line.sku}{line.variant ? ` · ${line.variant}` : ''} · {line.netUnits} units · {line.netValueMmk.toLocaleString('en-US')} MMK · {line.sourceBusinessDate}</small></span>
            </label>)}
          </div>
          {!evidence.lines.length ? <p className="shop-margin-gaps">No eligible retained completed-sale line is available. Sample, incomplete, adjusted, refunded, or unlinked sales remain excluded.</p> : null}
        </fieldset>
        {skuGroups.length ? <fieldset>
          <legend>2. Disposition and owner-reviewed production-cost estimates</legend>
          <div className="shop-batch-first-use-items">
            {skuGroups.map(([sku, group]) => {
              const values = itemInputs[sku] ?? defaultItemInput(group.soldUnits)
              return <article key={sku}>
                <h4>{group.itemName}</h4><p>{sku} · {group.soldUnits} completed units · {group.soldValueMmk.toLocaleString('en-US')} MMK</p>
                <div>
                  {([
                    ['producedUnits', 'Produced units'],
                    ['leftoverUnits', 'Leftover units'],
                    ['wastedUnits', 'Wasted units'],
                    ['remakeUnits', 'Remake units'],
                    ['preorderUnits', 'Preorder units'],
                    ['reviewedUnitCostEstimateMmk', 'Reviewed unit-cost estimate (MMK)'],
                  ] as const).map(([field, label]) => <label key={field}><span>{label}</span><input inputMode="numeric" max={field === 'reviewedUnitCostEstimateMmk' ? MAX_MMK : MAX_COUNT} min="0" onChange={(event) => updateItem(sku, group.soldUnits, field, Number(event.target.value))} required type="number" value={values[field]} /></label>)}
                </div>
                <label className="shop-batch-first-use-review"><input checked={values.ownerReviewed} onChange={(event) => updateItem(sku, group.soldUnits, 'ownerReviewed', event.target.checked)} type="checkbox" /><span>I reviewed this SKU’s standard unit-cost estimate and production quantity.</span></label>
              </article>
            })}
          </div>
        </fieldset> : null}
        {skuGroups.length ? <fieldset>
          <legend>3. Owner-reviewed batch overhead</legend>
          <div className="shop-batch-first-use-overhead">
            <label><span>Packaging (MMK)</span><input inputMode="numeric" min="0" onChange={(event) => setPackagingCostMmk(Number(event.target.value))} required type="number" value={packagingCostMmk} /></label>
            <label><span>Delivery (MMK)</span><input inputMode="numeric" min="0" onChange={(event) => setDeliveryCostMmk(Number(event.target.value))} required type="number" value={deliveryCostMmk} /></label>
            <label><span>Other reviewed cost (MMK)</span><input inputMode="numeric" min="0" onChange={(event) => setOtherReviewedBatchCostMmk(Number(event.target.value))} required type="number" value={otherReviewedBatchCostMmk} /></label>
            <label><span>Other-cost reason</span><select onChange={(event) => setOtherReviewedBatchCostReason(event.target.value as ShopBatchFirstUseDraft['otherReviewedBatchCostReason'])} value={otherReviewedBatchCostReason}>
              <option value="none">None</option><option value="fuel">Fuel</option><option value="market_fee">Market fee</option><option value="temporary_labor">Temporary labor</option><option value="other_reviewed">Other reviewed</option>
            </select></label>
          </div>
          <label className="shop-batch-first-use-review"><input checked={overheadOwnerReviewed} onChange={(event) => setOverheadOwnerReviewed(event.target.checked)} type="checkbox" /><span>I reviewed these exact packaging, delivery, and other-cost estimates for this Batch.</span></label>
          <button className="core-button primary" disabled={workflow.status === 'saving'} type="submit">{workflow.status === 'saving' ? 'Validating and saving…' : 'Validate, save, and show local Batch estimate'}</button>
        </fieldset> : null}
      </form> : null}
      {workflow.status === 'saved' ? <p className="shop-margin-controlled" role="status">Saved and reloaded exactly. The accepted engine projection appears in the guarded Batch panel below; the Shop workspace was not changed.</p> : null}
    </> : null}
  </section>
}
