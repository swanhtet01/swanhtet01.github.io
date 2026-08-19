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
// THE SPEND IS DERIVED FROM THE CORRECTION ITSELF — NO SECOND RECORD (Codex
// P1, PR #472). A first draft stored a redemption row here next to the
// settings, written after the correction landed; that pairing is not atomic
// (a refused localStorage write after a committed correction left the points
// re-spendable for another credit), and rows were per-device while
// corrections sync. Instead, a redemption's accountable action carries the
// structural actionId prefix `ACT-LOYREDEEM-` (the same identify-by-actionId-
// prefix pattern the guided-sample rule mandates — never display copy), and
// the balance projection subtracts every CREDIT correction whose actionId
// carries that prefix, 1 point = 1 MMK of listed credit. One atomic commerce
// write is the entire redemption: there is no second store to disagree, a
// refused correction spends nothing by construction, and in managed mode the
// spend travels with the synced state to every device. Both effects of the
// correction are intentional and tested: the credit reduces the order's own
// accrual (the customer effectively paid less) AND its prefixed actionId
// subtracts the points spent — see the coherence checks in
// tools/test_shop_loyalty.mjs. The stored settings record keeps the exact
// PR1 shape; nothing about redemption is persisted outside CommerceState.
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
 * The structural marker for a points redemption: the accountable action (and
 * therefore the correction's proof actionId) is generated with this prefix,
 * so the projection can recognise a spend from CommerceState alone. Identify
 * by actionId prefix, never by reason/evidence display copy — the same rule
 * guided-sample records follow.
 */
export const SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX = 'ACT-LOYREDEEM-'

export type ShopLoyaltyRedemptionInput = {
  customer: string
  orderId: string
  points: number
}

export type ShopLoyaltySettings = {
  schema: typeof SHOP_LOYALTY_SCHEMA
  enabled: boolean
  /** Append-only, ascending by effectiveAt, never empty. The LAST period is the current rate. */
  ratePeriods: ShopLoyaltyRatePeriod[]
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
   * mirrors what commerceOrderAdjustedTotal in commerce-workspace.ts reads,
   * plus the correction's actionId: a credit correction whose actionId starts
   * with SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX IS a points spend (module
   * header), so the projection subtracts it 1 point = 1 MMK.
   */
  corrections?: readonly { kind: string; actionId?: string; calculation: { totalMmk: number } }[]
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

/** Throws on anything that is not an exact, internally consistent settings record. */
export function validateShopLoyaltySettings(value: unknown): ShopLoyaltySettings {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'enabled', 'ratePeriods', 'enabledAt', 'proof'])) {
    throw new Error('Loyalty settings must carry exactly schema, enabled, ratePeriods, enabledAt, and proof.')
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
  return {
    schema: SHOP_LOYALTY_SCHEMA,
    enabled: value.enabled,
    ratePeriods: periods.map((period) => ({ ...period })),
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
    const customer = eligibleCustomer(order.customer)
    if (!customer) continue
    // Spends are DERIVED from the order's own prefixed credit corrections
    // (module header) — no second store, so a spend can never be lost while
    // its credit survives, and in managed mode it syncs with the state. A
    // spend counts on EVERY eligible sale, including one settled before
    // enabledAt or with a broken settlement timestamp — those gates below
    // guard what an order EARNS, and skipping a spend with them would let the
    // same points redeem twice.
    const spent = shopLoyaltyRedeemedPointsForOrder(order)
    // Accrual gates: settled at/after enablement, and a structurally sound
    // correction chain — corrections change what the order actually earned
    // (returns and price reductions subtract, extra charges add), so a broken
    // chain earns nothing rather than guessing.
    const settledAtMs = order.paymentReconciledAt ? Date.parse(order.paymentReconciledAt) : Number.NaN
    const adjustedTotal = orderAdjustedTotal(order)
    const points = Number.isFinite(settledAtMs) && settledAtMs >= enabledAtMs && adjustedTotal !== null
      ? shopLoyaltyPointsForAmount(adjustedTotal, rateBasisPointsAt(settings, settledAtMs))
      : 0
    if (points < 1 && spent < 1) continue
    // Deliberate coherence: the credit correction a redemption records ALSO
    // reduces this order's adjustedTotal above, so redeeming N points lowers
    // the balance by N plus the small accrual the credited money would have
    // earned — both effects are correct and pinned in the contract test. The
    // internal value may go below zero (e.g. a later pricing-error credit
    // shrank an order after its points were spent); the counter never shows a
    // negative because every display path goes through shopLoyaltyDisplayPoints.
    balances.set(customer, (balances.get(customer) ?? 0) + points - spent)
  }
  return balances
}

/** What the counter shows: never below zero, whatever the internal arithmetic held. */
export function shopLoyaltyDisplayPoints(points: number): number {
  return Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0
}

/**
 * Points already redeemed against one order, derived from the order's own
 * credit corrections whose actionId carries the redemption prefix — the
 * receipt's redemption line and the balance projection's spend source.
 * 1 point = 1 MMK of listed credit; malformed correction records count zero.
 */
export function shopLoyaltyRedeemedPointsForOrder(order: ShopLoyaltyOrderView | null | undefined): number {
  let spent = 0
  for (const correction of order?.corrections ?? []) {
    if (!isRecord(correction) || correction.kind !== 'credit') continue
    if (typeof correction.actionId !== 'string' || !correction.actionId.startsWith(SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX)) continue
    if (!isRecord(correction.calculation) || !Number.isSafeInteger(correction.calculation.totalMmk) || correction.calculation.totalMmk < 1) continue
    spent += correction.calculation.totalMmk
  }
  return spent
}

/**
 * Pure pre-flight gate for a points redemption — run against the commerce
 * state as it stands IMMEDIATELY before the credit correction is applied.
 * Returns true only when points are on, the customer is a named non-Guest
 * owner of a real (non-sample) completed+reconciled sale, and the spend fits
 * inside the customer's current projected balance. The spend itself is the
 * correction: its accountable action carries
 * SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX, so once it lands the projection
 * recognises it from CommerceState alone — there is nothing else to write,
 * and a refused correction spends nothing by construction (module header;
 * Codex P1, PR #472). Idempotency is the correction machinery's own actionId
 * replay handling — one atomic write, one dedup authority.
 */
export function shopLoyaltyRedemptionAllowed(
  current: ShopLoyaltySettings | null,
  state: ShopLoyaltyStateView,
  input: ShopLoyaltyRedemptionInput,
): boolean {
  if (!current?.enabled || current.enabledAt === null) return false
  const customer = eligibleCustomer(input?.customer)
  if (!customer || customer !== input.customer) return false
  if (!validRedemptionPoints(input?.points)) return false
  if (typeof input?.orderId !== 'string' || !input.orderId.trim() || input.orderId !== input.orderId.trim() || input.orderId.length > 160) return false
  // The spend binds to one real settled sale owned by the redeeming customer.
  // Sample-seeded orders are excluded the same way accrual excludes them —
  // by actionId prefix, never by actor string.
  const order = (state?.orders ?? []).find((candidate) => candidate.id === input.orderId)
  if (!order
    || order.status !== 'completed'
    || order.paymentStatus !== 'reconciled'
    || (typeof order.paymentReconciliationActionId === 'string'
      && order.paymentReconciliationActionId.startsWith(SAMPLE_ACTION_ID_PREFIX))
    || eligibleCustomer(order.customer) !== customer) return false
  const available = shopLoyaltyBalances(state, current).get(customer) ?? 0
  return input.points <= available
}
