// Shop customer loyalty points — settings store and accrual projection.
//
// WHAT THIS IS (roadmap item S3 PR1, hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md).
// Loyverse's flagship small-shop draw, scoped to the narrow shape the roadmap
// approved: a points ledger keyed off the existing order `customer` field —
// NOT the rejected CRM non-goal. This PR is accrual-only: an opt-in settings
// record on this device, plus a pure projection that computes balances from
// the commerce workspace that already exists. PR2 adds redemption (spending
// points against a sale, receipt line); nothing here reserves, spends, or
// prints a point.
//
// WHY THE SETTINGS ARE NOT IN CommerceState. The deployed managed backend
// validates full state snapshots with exact-field contracts
// (`supermega_runtime/commerce_runtime.py` `_STATE_FIELDS`, and the closed
// `COMMERCE_EVENTS` set), and every staged sync intent carries the FULL
// candidate state (`commerce-sync-outbox.ts` `candidateRaw`). Any new
// CommerceState key would make the deployed runtime reject every managed sync
// from a newer client. So the settings live under their own device-local
// localStorage key, `supermega.shop.loyalty.v1`, registered with
// local-workspace-storage.ts (reset reaches it) and classified PORTABLE in
// company-backup.ts (points are an obligation-bearing business record — a
// promise made to customers — so a restore must not silently delete it).
//
// DOCUMENTED MANAGED GAP. Because the settings are per device, two registers
// of one managed shop can disagree about whether points are on and at what
// rate. Multi-register managed shops are UNSUPPORTED for loyalty until a
// founder-gated PR3 moves the settings behind the managed contract; the
// settings copy says "on this device" for exactly this reason.
//
// BALANCES ARE A PURE PROJECTION, NEVER STORED. `shopLoyaltyBalances` is a
// pure function over CommerceState (the same module pattern as
// `commerceReceivablesAging` in commerce-workspace.ts): recomputed from the
// orders on every read, so there is no second ledger to drift, no migration,
// and no sync surface. An order credits points only while it is BOTH
// `status === 'completed'` AND `paymentStatus === 'reconciled'` — money in
// and goods handed over.
//
// REFUNDS REVERSE AUTOMATICALLY, STRUCTURALLY. In the commerce state machine
// a refund can only exist on a CANCELLED order (`validateCommerceState`
// enforces refund exceptions require `status === 'cancelled'`), and a
// completed order can never become cancelled
// (`commerceOrderHasReleasableReservation` returns false for completed
// orders, and cancellation is the only path to a refund). So the credited
// population (completed) and the refunded population (cancelled) are
// disjoint, and recomputing from state is the reversal: an order whose money
// went back is never in the credit set. No explicit debit is applied — with
// the current machine it could only manufacture a spurious negative for an
// order that never credited. Display still clamps at zero defensively
// (`shopLoyaltyDisplayPoints`) so a future state shape cannot render a
// negative balance at the counter.
//
// CUSTOMER IDENTITY reuses the credit-policy convention verbatim: the exact
// `customer` string on the order (`CommerceCustomerCreditPolicy.customer` is
// matched with `policy.customer !== candidate.customer`), fed by the same
// client-master datalist the order form uses. No phone registry, no new
// record type. 'Guest' and blank customers earn nothing — points to an
// anonymous bucket would be points anyone could claim.
//
// GUIDED SAMPLES EARN NOTHING (CLAUDE.md proof-counter rule). Two guards,
// either sufficient alone:
//   1. Accrual counts only orders whose payment was reconciled AT OR AFTER
//      `enabledAt`. Seed orders (`createSeedCommerce`) are pinned to
//      2026-07-23 and working-sample counter sales stay payment-pending, so
//      neither can reach a real enablement window.
//   2. Orders whose `paymentReconciliationActionId` starts with `ACT-DEMO-`
//      are skipped outright — sample seeding is identified by actionId
//      prefix, never by actor string.
// A freshly seeded workspace therefore always shows zero balances.
//
// NO NETWORK, NO EXTERNAL EFFECT. Nothing in this module performs IO beyond
// the injected Storage. Enabling points sends no message, calls no API, and
// changes no order.

export const SHOP_LOYALTY_KEY = 'supermega.shop.loyalty.v1'
export const SHOP_LOYALTY_SCHEMA = 'supermega.shop.loyalty.v1'

/** Default rate: 100 basis points = 1% — 1 point per 100 MMK settled. */
export const SHOP_LOYALTY_DEFAULT_RATE_BASIS_POINTS = 100
export const SHOP_LOYALTY_MIN_RATE_BASIS_POINTS = 10
export const SHOP_LOYALTY_MAX_RATE_BASIS_POINTS = 1000

/** The action-prefix that marks seeded sample records (CLAUDE.md: prefix, never actor). */
const SAMPLE_ACTION_ID_PREFIX = 'ACT-DEMO-'

/** The anonymous counter customer; recorded when the cashier leaves the field blank. */
const GUEST_CUSTOMER = 'Guest'

export type ShopLoyaltyActionProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type ShopLoyaltySettings = {
  schema: typeof SHOP_LOYALTY_SCHEMA
  enabled: boolean
  rateBasisPoints: number
  /**
   * The FIRST enablement instant; accrual counts orders settled at or after
   * it. Deliberately stable across disable/re-enable cycles so toggling the
   * switch can never silently wipe balances customers were already told
   * about — while disabled the counter simply shows nothing.
   */
  enabledAt: string | null
  /** The proof for the most recent settings change; actionId is the idempotency key. */
  proof: ShopLoyaltyActionProof
}

export type ShopLoyaltySettingsInput = {
  enabled: boolean
  rateBasisPoints: number
}

// The minimal slice of CommerceState/CommerceOrder the projection reads,
// declared structurally so this module never imports the 10k-line commerce
// workspace (and the Node contract test can feed plain fixtures).
export type ShopLoyaltyOrderView = {
  customer: string
  total: number
  status: string
  paymentStatus: string
  paymentReconciledAt?: string
  paymentReconciliationActionId?: string
}

export type ShopLoyaltyStateView = {
  orders: readonly ShopLoyaltyOrderView[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Same discipline as commerce-workspace.ts hasExactKeys: unknown keys are a
// contract violation, not a tolerated extension.
function hasExactKeys(value: Record<string, unknown>, required: string[]) {
  const fields = Object.keys(value)
  return required.every((field) => fields.includes(field))
    && fields.every((field) => required.includes(field))
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
}

function validProof(value: unknown): value is ShopLoyaltyActionProof {
  if (!isRecord(value) || !hasExactKeys(value, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])) return false
  const proof = value as Record<string, unknown>
  return typeof proof.actionId === 'string' && Boolean((proof.actionId as string).trim())
    && validTimestamp(proof.capturedAt)
    && typeof proof.actor === 'string' && Boolean((proof.actor as string).trim())
    && typeof proof.reason === 'string' && Boolean((proof.reason as string).trim())
    && typeof proof.evidenceReference === 'string' && Boolean((proof.evidenceReference as string).trim())
}

export function validRateBasisPoints(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= SHOP_LOYALTY_MIN_RATE_BASIS_POINTS
    && (value as number) <= SHOP_LOYALTY_MAX_RATE_BASIS_POINTS
}

/** Throws on anything that is not an exact, internally consistent settings record. */
export function validateShopLoyaltySettings(value: unknown): ShopLoyaltySettings {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'enabled', 'rateBasisPoints', 'enabledAt', 'proof'])) {
    throw new Error('Loyalty settings must carry exactly schema, enabled, rateBasisPoints, enabledAt, and proof.')
  }
  if (value.schema !== SHOP_LOYALTY_SCHEMA) throw new Error('Loyalty settings schema is not recognised.')
  if (typeof value.enabled !== 'boolean') throw new Error('Loyalty enabled must be a boolean.')
  if (!validRateBasisPoints(value.rateBasisPoints)) {
    throw new Error(`Loyalty rate must be a whole number between ${SHOP_LOYALTY_MIN_RATE_BASIS_POINTS} and ${SHOP_LOYALTY_MAX_RATE_BASIS_POINTS} basis points.`)
  }
  if (value.enabledAt !== null && !validTimestamp(value.enabledAt)) throw new Error('Loyalty enabledAt must be null or a valid timestamp.')
  if (value.enabled && value.enabledAt === null) throw new Error('Enabled loyalty settings must record when points were first turned on.')
  if (!validProof(value.proof)) throw new Error('Loyalty settings must carry a complete action proof.')
  return {
    schema: SHOP_LOYALTY_SCHEMA,
    enabled: value.enabled,
    rateBasisPoints: value.rateBasisPoints,
    enabledAt: value.enabledAt,
    proof: { ...(value.proof as ShopLoyaltyActionProof) },
  }
}

type LoyaltyStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): LoyaltyStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Null when absent, malformed, or storage is unavailable — the feature degrades to off. */
export function readShopLoyaltySettings(storage: LoyaltyStorage | null = defaultStorage()): ShopLoyaltySettings | null {
  try {
    const raw = storage?.getItem(SHOP_LOYALTY_KEY)
    if (!raw) return null
    return validateShopLoyaltySettings(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Persists a validated record; returns false when storage refuses the write. */
export function writeShopLoyaltySettings(settings: ShopLoyaltySettings, storage: LoyaltyStorage | null = defaultStorage()): boolean {
  const validated = validateShopLoyaltySettings(settings)
  try {
    storage?.setItem(SHOP_LOYALTY_KEY, JSON.stringify(validated))
    return storage !== null
  } catch {
    return false
  }
}

/**
 * Pure, proof-carrying mutation — the commerce-workspace write discipline.
 * Idempotent on proof.actionId: replaying the exact same change returns the
 * CURRENT record unchanged; reusing an actionId for a different change
 * returns null. Enabling for the first time stamps enabledAt from the
 * proof's capturedAt; later changes never move it (see the type note).
 */
export function updateShopLoyaltySettings(
  current: ShopLoyaltySettings | null,
  input: ShopLoyaltySettingsInput,
  proof: ShopLoyaltyActionProof,
): ShopLoyaltySettings | null {
  if (!validProof(proof)) return null
  if (typeof input?.enabled !== 'boolean' || !validRateBasisPoints(input?.rateBasisPoints)) return null
  if (current && current.proof.actionId === proof.actionId) {
    return current.enabled === input.enabled && current.rateBasisPoints === input.rateBasisPoints ? current : null
  }
  const enabledAt = current?.enabledAt ?? (input.enabled ? proof.capturedAt : null)
  return validateShopLoyaltySettings({
    schema: SHOP_LOYALTY_SCHEMA,
    enabled: input.enabled,
    rateBasisPoints: input.rateBasisPoints,
    enabledAt,
    proof: { ...proof },
  })
}

/** floor(total × rate / 10000) — whole points only, always rounded down. */
export function shopLoyaltyPointsForAmount(totalMmk: number, rateBasisPoints: number): number {
  if (!Number.isSafeInteger(totalMmk) || totalMmk < 0 || !validRateBasisPoints(rateBasisPoints)) return 0
  return Math.floor((totalMmk * rateBasisPoints) / 10000)
}

function eligibleCustomer(customer: unknown): string | null {
  if (typeof customer !== 'string') return null
  const trimmed = customer.trim()
  if (!trimmed || trimmed === GUEST_CUSTOMER) return null
  return trimmed
}

/**
 * Balances by exact customer string. Empty when the settings are missing or
 * disabled. Credits only orders that are completed AND reconciled, settled at
 * or after enabledAt, for a named non-Guest customer, and not seeded sample
 * data. Refund reversal is structural — see the module header.
 */
export function shopLoyaltyBalances(state: ShopLoyaltyStateView, settings: ShopLoyaltySettings | null): Map<string, number> {
  const balances = new Map<string, number>()
  if (!settings?.enabled || settings.enabledAt === null) return balances
  const enabledAtMs = Date.parse(settings.enabledAt)
  if (!Number.isFinite(enabledAtMs)) return balances
  for (const order of state?.orders ?? []) {
    if (order.status !== 'completed' || order.paymentStatus !== 'reconciled') continue
    if (typeof order.paymentReconciliationActionId === 'string'
      && order.paymentReconciliationActionId.startsWith(SAMPLE_ACTION_ID_PREFIX)) continue
    const settledAtMs = order.paymentReconciledAt ? Date.parse(order.paymentReconciledAt) : Number.NaN
    if (!Number.isFinite(settledAtMs) || settledAtMs < enabledAtMs) continue
    const customer = eligibleCustomer(order.customer)
    if (!customer) continue
    const points = shopLoyaltyPointsForAmount(order.total, settings.rateBasisPoints)
    if (points < 1) continue
    balances.set(customer, (balances.get(customer) ?? 0) + points)
  }
  return balances
}

/** What the counter shows: never below zero, whatever the internal arithmetic held. */
export function shopLoyaltyDisplayPoints(points: number): number {
  return Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0
}
