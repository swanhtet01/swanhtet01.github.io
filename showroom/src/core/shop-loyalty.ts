// Shop customer loyalty points — settings store, accrual projection, redemption.
//
// WHAT THIS IS (roadmap item S3, hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md).
// Loyverse's flagship small-shop draw, scoped to the narrow shape the roadmap
// approved: a points ledger keyed off the existing order `customer` field —
// NOT the rejected CRM non-goal. PR1 shipped accrual: an opt-in settings
// record on this device, plus a pure projection that computes balances from
// the commerce workspace that already exists. PR2 (this revision) adds
// redemption — spending points against a completed sale — and the receipt
// balance line.
//
// HOW REDEMPTION MOVES MONEY (PR2 design decision). A redemption is recorded
// as a CREDIT ORDER CORRECTION on the completed, reconciled sale
// (recordCommerceOrderCorrection, event `commerce.order.correction_recorded`)
// — machinery the GL and daily close already net, and an event the deployed
// managed backend already accepts, so redemption syncs with ZERO server
// change. The checkout-time-discount alternative was investigated and
// rejected on contract grounds: `promotionDecision` must recompute exactly
// from the synced, code-keyed, percent-based promotionPolicies records, which
// cannot honestly carry a per-customer fixed-MMK points spend. So the shape
// is Loyverse-adjacent, not identical: the cashier settles the sale, then
// redeems points as money back recorded on that order. 1 POINT = 1 MMK of
// listed (before-tax) credit — the simplest honest rule; the correction's tax
// treatment follows the order's own tax snapshot exactly like every other
// credit note.
//
// THE REDEMPTION ROW is the loyalty side of that correction: it lives in this
// scoped record (next to the settings), stores the correction proof's
// actionId (the shared idempotency key), the points spent, the exact customer
// string, and the orderId. Balance = accrual projection − sum of redemption
// rows for the customer in the SAME scope. Both effects of the correction are
// intentional and tested: the credit reduces the order's own accrual (the
// customer effectively paid less) AND the row subtracts the points spent —
// see the coherence checks in tools/test_shop_loyalty.mjs.
//
// SCHEMA COMPATIBILITY (PR2 over PR1). The stored shape gains a `redemptions`
// array. The schema key stays `supermega.shop.loyalty.v1`: validation accepts
// a PR1 record WITHOUT the key (normalising to []) so no record written
// before this revision is silently invalidated or lost, while every write
// from now on includes the array. Validation stays exact-key and fail-closed
// otherwise — `redemptions` is the single optional key, and a present-but-
// malformed array still rejects the whole record. (A rollback to PR1 code
// would read a PR2 record as null — feature off, data left on disk — which is
// the same fail-closed posture PR1 chose for every malformed record.)
//
// WHY THE SETTINGS ARE NOT IN CommerceState. The deployed managed backend
// validates full state snapshots with exact-field contracts
// (`supermega_runtime/commerce_runtime.py` `_STATE_FIELDS`, and the closed
// `COMMERCE_EVENTS` set), and every staged sync intent carries the FULL
// candidate state (`commerce-sync-outbox.ts` `candidateRaw`). Any new
// CommerceState key would make the deployed runtime reject every managed sync
// from a newer client. So the settings live under their own device-local,
// WORKSPACE-SCOPED localStorage key family, `supermega.shop.loyalty.v1.<scope>`
// (see shopLoyaltyStorageKey — one record per 'managed:<id>' / 'local' scope,
// so one browser serving two companies can never leak one shop's enablement
// or rates into the other's counter), registered as a prefix with
// local-workspace-storage.ts (reset reaches every scope) and classified
// PORTABLE in company-backup.ts (points are an obligation-bearing business
// record — a promise made to customers — so a restore must not silently
// delete it).
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

/**
 * One effective-dated accrual rate. Rates are append-only history, never a
 * single mutable number: an order earns points at the rate that was in force
 * when ITS payment was reconciled, so changing 1% to 2% cannot silently
 * double every balance already promised to customers — and lowering a rate
 * cannot retroactively confiscate earned points (Codex P1, PR #469).
 */
export type ShopLoyaltyRatePeriod = {
  rateBasisPoints: number
  effectiveAt: string
}

/**
 * One redeemed spend of points, the loyalty side of a credit order correction
 * (see the module header). `actionId` IS the correction proof's actionId —
 * one shared idempotency key ties the money movement in CommerceState to the
 * points movement here, so neither can replay without the other matching.
 * `points` is whole points spent; 1 point = 1 MMK of listed (before-tax)
 * credit on the order.
 */
export type ShopLoyaltyRedemption = {
  actionId: string
  capturedAt: string
  customer: string
  orderId: string
  points: number
}

export type ShopLoyaltyRedemptionInput = {
  customer: string
  orderId: string
  points: number
}

export const SHOP_LOYALTY_MAX_REDEMPTIONS = 2000

export type ShopLoyaltySettings = {
  schema: typeof SHOP_LOYALTY_SCHEMA
  enabled: boolean
  /** Append-only, ascending by effectiveAt, never empty. The LAST period is the current rate. */
  ratePeriods: ShopLoyaltyRatePeriod[]
  /**
   * Append-only spend history (module header: PR1 records without this key
   * still validate; every write includes it). NOT ordered by capturedAt on
   * purpose — a device clock that stepped backwards must not fail-closed the
   * whole record into silence and eventual data loss; actionId uniqueness is
   * the real invariant.
   */
  redemptions: ShopLoyaltyRedemption[]
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
  /** Present on every real CommerceOrder; redemption requires it to bind the spend to one order. */
  id?: string
  customer: string
  total: number
  status: string
  paymentStatus: string
  paymentReconciledAt?: string
  paymentReconciliationActionId?: string
  /**
   * Order corrections (returns, price reductions, extra charges recorded
   * after completion). Corrections exist precisely on calculated, reconciled,
   * COMPLETED orders — the accruing population — so accrual must use the
   * corrected balance, not the original total (Codex P1, PR #469). The shape
   * mirrors what commerceOrderAdjustedTotal in commerce-workspace.ts reads.
   */
  corrections?: readonly { kind: string; calculation: { totalMmk: number } }[]
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

function validRatePeriod(value: unknown): value is ShopLoyaltyRatePeriod {
  return isRecord(value)
    && hasExactKeys(value, ['rateBasisPoints', 'effectiveAt'])
    && validRateBasisPoints(value.rateBasisPoints)
    && validTimestamp(value.effectiveAt)
}

function validRedemptionPoints(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1
}

function validRedemption(value: unknown): value is ShopLoyaltyRedemption {
  if (!isRecord(value) || !hasExactKeys(value, ['actionId', 'capturedAt', 'customer', 'orderId', 'points'])) return false
  return typeof value.actionId === 'string' && Boolean(value.actionId.trim()) && value.actionId.length <= 160
    && validTimestamp(value.capturedAt)
    && eligibleCustomer(value.customer) === value.customer
    && typeof value.orderId === 'string' && Boolean(value.orderId.trim()) && value.orderId === value.orderId.trim() && value.orderId.length <= 160
    && validRedemptionPoints(value.points)
}

/** Throws on anything that is not an exact, internally consistent settings record. */
export function validateShopLoyaltySettings(value: unknown): ShopLoyaltySettings {
  // `redemptions` is the single optional key — PR1 records predate it and must
  // keep validating (module header, schema-compatibility note).
  const baseKeys = ['schema', 'enabled', 'ratePeriods', 'enabledAt', 'proof']
  if (!isRecord(value)
    || !hasExactKeys(value, 'redemptions' in value ? [...baseKeys, 'redemptions'] : baseKeys)) {
    throw new Error('Loyalty settings must carry exactly schema, enabled, ratePeriods, enabledAt, and proof (plus optional redemptions).')
  }
  if (value.schema !== SHOP_LOYALTY_SCHEMA) throw new Error('Loyalty settings schema is not recognised.')
  if (typeof value.enabled !== 'boolean') throw new Error('Loyalty enabled must be a boolean.')
  if (!Array.isArray(value.ratePeriods) || value.ratePeriods.length < 1 || value.ratePeriods.length > 400
    || !value.ratePeriods.every(validRatePeriod)) {
    throw new Error(`Loyalty ratePeriods must be 1 to 400 records of a whole-number rate between ${SHOP_LOYALTY_MIN_RATE_BASIS_POINTS} and ${SHOP_LOYALTY_MAX_RATE_BASIS_POINTS} basis points and a valid effectiveAt.`)
  }
  const periods = value.ratePeriods as ShopLoyaltyRatePeriod[]
  for (let index = 1; index < periods.length; index += 1) {
    if (Date.parse(periods[index].effectiveAt) < Date.parse(periods[index - 1].effectiveAt)) {
      throw new Error('Loyalty ratePeriods must be ordered by effectiveAt — rate history is append-only.')
    }
  }
  if (value.enabledAt !== null && !validTimestamp(value.enabledAt)) throw new Error('Loyalty enabledAt must be null or a valid timestamp.')
  if (value.enabled && value.enabledAt === null) throw new Error('Enabled loyalty settings must record when points were first turned on.')
  if (!validProof(value.proof)) throw new Error('Loyalty settings must carry a complete action proof.')
  const rawRedemptions = 'redemptions' in value ? value.redemptions : []
  if (!Array.isArray(rawRedemptions) || rawRedemptions.length > SHOP_LOYALTY_MAX_REDEMPTIONS
    || !rawRedemptions.every(validRedemption)) {
    throw new Error(`Loyalty redemptions must be at most ${SHOP_LOYALTY_MAX_REDEMPTIONS} records of actionId, capturedAt, a named non-Guest customer, orderId, and whole points of at least 1.`)
  }
  const redemptions = rawRedemptions as ShopLoyaltyRedemption[]
  if (new Set(redemptions.map((redemption) => redemption.actionId)).size !== redemptions.length) {
    throw new Error('Loyalty redemption actionIds must be unique — a duplicated row would double-spend points.')
  }
  return {
    schema: SHOP_LOYALTY_SCHEMA,
    enabled: value.enabled,
    ratePeriods: periods.map((period) => ({ ...period })),
    redemptions: redemptions.map((redemption) => ({ ...redemption })),
    enabledAt: value.enabledAt,
    proof: { ...(value.proof as ShopLoyaltyActionProof) },
  }
}

/** The rate new sales earn right now: the last (most recent) period. */
export function shopLoyaltyCurrentRateBasisPoints(settings: ShopLoyaltySettings): number {
  return settings.ratePeriods[settings.ratePeriods.length - 1].rateBasisPoints
}

/**
 * Storage scope — the same money-adjacent isolation the payment-QR store uses
 * (Codex P1 on both PRs, same root cause): localStorage is per-origin, not
 * per-workspace, so an unscoped key would hand one shop's enablement, rate
 * history, and proof to every other company using this browser. 'managed:<id>'
 * for a managed workspace, 'local' for the device-local one (one per browser
 * by construction). The key family `supermega.shop.loyalty.v1.<scope>` is
 * registered as a PREFIX in local-workspace-storage.ts and company-backup.ts,
 * like the other scoped families.
 */
export function shopLoyaltyScopeForWorkspace(workspaceId?: string | null): string {
  return workspaceId ? `managed:${workspaceId}` : 'local'
}

export function shopLoyaltyStorageKey(scope: string): string {
  const trimmed = typeof scope === 'string' ? scope.trim() : ''
  if (!trimmed || trimmed.length > 160) throw new Error('Loyalty settings need a valid workspace scope.')
  return `${SHOP_LOYALTY_KEY}.${encodeURIComponent(trimmed)}`
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
export function readShopLoyaltySettings(scope: string, storage: LoyaltyStorage | null = defaultStorage()): ShopLoyaltySettings | null {
  try {
    const raw = storage?.getItem(shopLoyaltyStorageKey(scope))
    if (!raw) return null
    return validateShopLoyaltySettings(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Persists a validated record under its workspace scope; returns false when storage refuses the write. */
export function writeShopLoyaltySettings(scope: string, settings: ShopLoyaltySettings, storage: LoyaltyStorage | null = defaultStorage()): boolean {
  const validated = validateShopLoyaltySettings(settings)
  const key = shopLoyaltyStorageKey(scope)
  try {
    storage?.setItem(key, JSON.stringify(validated))
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
    return current.enabled === input.enabled
      && shopLoyaltyCurrentRateBasisPoints(current) === input.rateBasisPoints
      ? current
      : null
  }
  const enabledAt = current?.enabledAt ?? (input.enabled ? proof.capturedAt : null)
  // Rate history is append-only: a changed rate takes effect from THIS
  // change's capturedAt forward; every earlier period keeps governing the
  // orders settled while it was in force. An unchanged rate appends nothing.
  const priorPeriods = current?.ratePeriods ?? []
  const lastRate = priorPeriods.length > 0 ? priorPeriods[priorPeriods.length - 1].rateBasisPoints : null
  const ratePeriods = lastRate === input.rateBasisPoints
    ? priorPeriods.map((period) => ({ ...period }))
    : [...priorPeriods.map((period) => ({ ...period })), { rateBasisPoints: input.rateBasisPoints, effectiveAt: proof.capturedAt }]
  return validateShopLoyaltySettings({
    schema: SHOP_LOYALTY_SCHEMA,
    enabled: input.enabled,
    ratePeriods,
    // A settings change never touches the spend history — disabling points
    // must not erase the record of points already redeemed.
    redemptions: current?.redemptions ?? [],
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
/**
 * The money an order actually kept after its recorded corrections — the same
 * arithmetic as commerceOrderAdjustedTotal in commerce-workspace.ts (credit
 * subtracts, debit adds, null on any unsafe intermediate). Replicated
 * structurally because this module deliberately never imports the commerce
 * workspace (see the OrderView note); the contract test pins the behavior.
 */
function orderAdjustedTotal(order: ShopLoyaltyOrderView): number | null {
  let total = order.total
  for (const correction of order.corrections ?? []) {
    if (!isRecord(correction) || !isRecord(correction.calculation) || !Number.isSafeInteger(correction.calculation.totalMmk)) return null
    total += correction.kind === 'debit' ? correction.calculation.totalMmk : -correction.calculation.totalMmk
    if (!Number.isSafeInteger(total) || total < 0) return null
  }
  return total
}

/** The rate in force when the order settled: the last period with effectiveAt <= settledAt. */
function rateBasisPointsAt(settings: ShopLoyaltySettings, settledAtMs: number): number {
  let rate = settings.ratePeriods[0].rateBasisPoints
  for (const period of settings.ratePeriods) {
    const effectiveMs = Date.parse(period.effectiveAt)
    if (!Number.isFinite(effectiveMs) || effectiveMs > settledAtMs) break
    rate = period.rateBasisPoints
  }
  return rate
}

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
    // Corrections change what the order actually earned (returns and price
    // reductions subtract, extra charges add); a structurally broken
    // correction chain earns nothing rather than guessing.
    const adjustedTotal = orderAdjustedTotal(order)
    if (adjustedTotal === null) continue
    const points = shopLoyaltyPointsForAmount(adjustedTotal, rateBasisPointsAt(settings, settledAtMs))
    if (points < 1) continue
    balances.set(customer, (balances.get(customer) ?? 0) + points)
  }
  // Redemptions subtract points spent (PR2). Note the deliberate coherence
  // with the accrual above: the credit correction a redemption records ALSO
  // reduces its order's adjustedTotal, so redeeming N points lowers the
  // balance by N (this row) plus the small accrual the credited money would
  // have earned — both effects are correct and pinned in the contract test.
  // The internal value may go below zero (e.g. a later pricing-error credit
  // shrank an order after its points were spent); the counter never shows a
  // negative because every display path goes through shopLoyaltyDisplayPoints.
  for (const redemption of settings.redemptions) {
    balances.set(redemption.customer, (balances.get(redemption.customer) ?? 0) - redemption.points)
  }
  return balances
}

/** What the counter shows: never below zero, whatever the internal arithmetic held. */
export function shopLoyaltyDisplayPoints(points: number): number {
  return Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0
}

/** Points already redeemed against one order — the receipt's redemption line. */
export function shopLoyaltyRedeemedPointsForOrder(settings: ShopLoyaltySettings | null, orderId: string): number {
  if (!settings || typeof orderId !== 'string' || !orderId) return 0
  return settings.redemptions
    .filter((redemption) => redemption.orderId === orderId)
    .reduce((sum, redemption) => sum + redemption.points, 0)
}

/**
 * Pure, proof-carrying spend of points — the PR2 mutation (module header).
 * Called with the commerce state BEFORE the paired credit correction is
 * applied, so the balance gate compares against what the customer actually
 * holds at the moment of redemption. Idempotent on proof.actionId (replaying
 * the identical spend returns the CURRENT record unchanged; reusing the
 * actionId for a different spend returns null). Fails closed — returns null —
 * when points are off, the customer is Guest/blank/unknown or does not own
 * the order, the order is not a real completed+reconciled sale, the spend
 * exceeds the current balance, or the proof is sample-seeded (guided samples
 * never move a point, CLAUDE.md).
 */
export function redeemShopLoyaltyPoints(
  current: ShopLoyaltySettings | null,
  state: ShopLoyaltyStateView,
  input: ShopLoyaltyRedemptionInput,
  proof: ShopLoyaltyActionProof,
): ShopLoyaltySettings | null {
  if (!validProof(proof) || proof.actionId.startsWith(SAMPLE_ACTION_ID_PREFIX)) return null
  if (!current?.enabled || current.enabledAt === null) return null
  const customer = eligibleCustomer(input?.customer)
  if (!customer || customer !== input.customer) return null
  if (!validRedemptionPoints(input?.points)) return null
  if (typeof input?.orderId !== 'string' || !input.orderId.trim() || input.orderId !== input.orderId.trim() || input.orderId.length > 160) return null
  const replay = current.redemptions.find((redemption) => redemption.actionId === proof.actionId)
  if (replay) {
    return replay.capturedAt === proof.capturedAt
      && replay.customer === customer
      && replay.orderId === input.orderId
      && replay.points === input.points
      ? current
      : null
  }
  if (current.redemptions.length >= SHOP_LOYALTY_MAX_REDEMPTIONS) return null
  // The spend binds to one real settled sale owned by the redeeming customer.
  // Sample-seeded orders are excluded the same way accrual excludes them —
  // by actionId prefix, never by actor string.
  const order = (state?.orders ?? []).find((candidate) => candidate.id === input.orderId)
  if (!order
    || order.status !== 'completed'
    || order.paymentStatus !== 'reconciled'
    || (typeof order.paymentReconciliationActionId === 'string'
      && order.paymentReconciliationActionId.startsWith(SAMPLE_ACTION_ID_PREFIX))
    || eligibleCustomer(order.customer) !== customer) return null
  const available = shopLoyaltyBalances(state, current).get(customer) ?? 0
  if (input.points > available) return null
  return validateShopLoyaltySettings({
    schema: SHOP_LOYALTY_SCHEMA,
    enabled: current.enabled,
    ratePeriods: current.ratePeriods.map((period) => ({ ...period })),
    redemptions: [
      ...current.redemptions.map((redemption) => ({ ...redemption })),
      { actionId: proof.actionId, capturedAt: proof.capturedAt, customer, orderId: input.orderId, points: input.points },
    ],
    enabledAt: current.enabledAt,
    proof: { ...current.proof },
  })
}
