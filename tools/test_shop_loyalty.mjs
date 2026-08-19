// Contract guard for the Shop customer loyalty points module (roadmap S3 —
// PR1 accrual, PR2 redemption).
//
// shop-loyalty.ts holds the only loyalty state that exists — a device-local,
// proof-carrying, WORKSPACE-SCOPED settings record — and computes every
// balance as a pure projection over CommerceState. This test pins the
// contracts that make that safe:
//
//   1. VALIDATION is exact-key and fail-closed: a malformed settings record is
//      rejected, so a corrupted localStorage value degrades the feature to OFF
//      instead of counting points at a garbage rate. Rate history is an
//      append-only, ascending list of effective-dated periods.
//   2. THE MUTATION is idempotent on proof.actionId (the commerce write
//      discipline); enabledAt is stamped once and never moves; a rate change
//      APPENDS a period rather than rewriting history — so changing 1% to 2%
//      can never retroactively double balances already promised (Codex P1,
//      PR #469), and an unchanged rate appends nothing.
//   3. STORAGE is scoped per workspace ('managed:<id>' / 'local') so one
//      browser serving two companies cannot leak one shop's enablement or
//      rates into the other's counter (Codex P1, PR #469 — the same
//      per-origin trap the payment-QR store fixed in PR #465).
//   4. THE PROJECTION credits exactly the orders it claims to: completed AND
//      reconciled, settled at/after enabledAt, named non-Guest customer, not
//      sample-seeded (ACT-DEMO- actionId prefix), floor rounding — at the
//      rate IN FORCE when each order settled, on the CORRECTED order total
//      (order corrections exist precisely on completed reconciled orders;
//      Codex P1, PR #469). Refund reversal is structural — a refunded order
//      is by state-machine invariant a cancelled order, outside the credit
//      set — and the seeded workspace must always project ZERO balances
//      (CLAUDE.md: guided samples never earn a product its counters).
//   5. REDEMPTION (PR2) is DERIVED from CommerceState, never stored here: a
//      spend is a credit correction whose actionId carries
//      SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX (one atomic commerce write —
//      Codex P1, PR #472: a stored row paired non-atomically with the
//      correction could double-spend, and rows were per-device while
//      corrections sync). The projection subtracts spends on every eligible
//      sale — including pre-enablement orders, or skipping them would let the
//      same points redeem twice — and the pre-flight gate blocks
//      over-redemption and Guest/blank/unknown/mismatched customers. BOTH
//      effects of the correction are intended and pinned: the credit reduces
//      the order's own accrual AND its prefix subtracts the points spent.
//      The stored settings record keeps the exact PR1 shape.
//
// WIRING NOTE: every gate step is an npm script named in package.json's
// app:verify chain, and package.json is digest-bound (rehearsal cascade), so
// this file could not be added to the chain in the PR that created it. Run it
// directly: `node tools/test_shop_loyalty.mjs`. When a package.json edit is
// next possible, wire it as `shop:loyalty:verify => node tools/test_shop_loyalty.mjs`
// and append it to the app:verify chain beside shop:revenue:verify.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        SHOP_LOYALTY_KEY, SHOP_LOYALTY_SCHEMA,
        SHOP_LOYALTY_DEFAULT_RATE_BASIS_POINTS,
        SHOP_LOYALTY_MIN_RATE_BASIS_POINTS, SHOP_LOYALTY_MAX_RATE_BASIS_POINTS,
        SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX,
        validateShopLoyaltySettings, readShopLoyaltySettings, writeShopLoyaltySettings,
        updateShopLoyaltySettings, shopLoyaltyPointsForAmount, shopLoyaltyBalances,
        shopLoyaltyDisplayPoints, shopLoyaltyScopeForWorkspace, shopLoyaltyStorageKey,
        shopLoyaltyCurrentRateBasisPoints,
        shopLoyaltyRedemptionAllowed, shopLoyaltyRedeemedPointsForOrder,
      } from './shop-loyalty.ts'
      export { createSeedCommerce } from './commerce-workspace.ts'
      export { isLocalWorkspaceKey } from './local-workspace-storage.ts'
      export { isPortableCompanyStorageKey } from './company-backup.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-loyalty-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  SHOP_LOYALTY_SCHEMA,
  SHOP_LOYALTY_DEFAULT_RATE_BASIS_POINTS,
  SHOP_LOYALTY_MIN_RATE_BASIS_POINTS, SHOP_LOYALTY_MAX_RATE_BASIS_POINTS,
  SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX,
  validateShopLoyaltySettings, readShopLoyaltySettings, writeShopLoyaltySettings,
  updateShopLoyaltySettings, shopLoyaltyPointsForAmount, shopLoyaltyBalances,
  shopLoyaltyDisplayPoints, shopLoyaltyScopeForWorkspace, shopLoyaltyStorageKey,
  shopLoyaltyCurrentRateBasisPoints,
  shopLoyaltyRedemptionAllowed, shopLoyaltyRedeemedPointsForOrder,
  createSeedCommerce, isLocalWorkspaceKey, isPortableCompanyStorageKey,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function rejects(value, label) {
  let threw = false
  try {
    validateShopLoyaltySettings(value)
  } catch {
    threw = true
  }
  check(threw, label)
}

const proof = (overrides = {}) => ({
  actionId: 'LOYALTY-TEST-1',
  capturedAt: '2026-08-19T04:00:00.000Z',
  actor: 'Test operator',
  reason: 'Turn customer points on for the contract test.',
  evidenceReference: 'tools/test_shop_loyalty.mjs',
  ...overrides,
})

const goodSettings = {
  schema: SHOP_LOYALTY_SCHEMA,
  enabled: true,
  ratePeriods: [{ rateBasisPoints: 100, effectiveAt: '2026-08-19T04:00:00.000Z' }],
  enabledAt: '2026-08-19T04:00:00.000Z',
  proof: proof(),
}

// --- workspace scope: the key family and its registry classifications ------------------
const localKey = shopLoyaltyStorageKey('local')
const managedKey = shopLoyaltyStorageKey('managed:ws-alpha')
check(shopLoyaltyScopeForWorkspace() === 'local', 'no workspace id resolves to the local scope')
check(shopLoyaltyScopeForWorkspace('ws-alpha') === 'managed:ws-alpha', 'a managed workspace id resolves to its own scope')
check(localKey !== managedKey, 'different scopes produce different storage keys')
check(localKey.startsWith('supermega.shop.loyalty.v1.'), 'scoped keys stay inside the registered prefix family')
check(isLocalWorkspaceKey(localKey), 'the local-scope key is registered: reset clears it and the plain backup carries it')
check(isLocalWorkspaceKey(managedKey), 'a managed-scope key is registered too — reset clears every scope')
check(isPortableCompanyStorageKey(localKey), 'the local-scope key is PORTABLE: an encrypted-backup restore must not delete the points obligation')
check(isPortableCompanyStorageKey(managedKey), 'a managed-scope key is PORTABLE for the same reason')
check((() => { try { shopLoyaltyStorageKey('  '); return false } catch { return true } })(), 'a blank scope is refused — no accidental shared key')

// --- validation: exact keys, fail-closed ---------------------------------------------
check(shopLoyaltyCurrentRateBasisPoints(validateShopLoyaltySettings(goodSettings)) === 100, 'a well-formed record validates; the last period is the current rate')
check(SHOP_LOYALTY_DEFAULT_RATE_BASIS_POINTS === 100, 'the default rate is 1% = 100 basis points')
rejects(null, 'null is rejected')
rejects([], 'an array is rejected')
rejects('{}', 'a string is rejected')
rejects({ ...goodSettings, schema: 'supermega.shop.loyalty.v2' }, 'an unknown schema is rejected')
rejects({ ...goodSettings, extra: true }, 'an extra key is rejected — exact keys only')
rejects((() => { const { proof: _p, ...rest } = goodSettings; return rest })(), 'a missing key is rejected')
rejects({ ...goodSettings, enabled: 'yes' }, 'a non-boolean enabled is rejected')
rejects({ ...goodSettings, rateBasisPoints: 100 }, 'the retired flat rateBasisPoints field is rejected — rate history only')
rejects({ ...goodSettings, ratePeriods: [] }, 'an empty rate history is rejected')
rejects({ ...goodSettings, ratePeriods: [{ rateBasisPoints: 100.5, effectiveAt: goodSettings.enabledAt }] }, 'a fractional rate is rejected')
rejects({ ...goodSettings, ratePeriods: [{ rateBasisPoints: SHOP_LOYALTY_MIN_RATE_BASIS_POINTS - 1, effectiveAt: goodSettings.enabledAt }] }, 'a rate below the floor is rejected')
rejects({ ...goodSettings, ratePeriods: [{ rateBasisPoints: SHOP_LOYALTY_MAX_RATE_BASIS_POINTS + 1, effectiveAt: goodSettings.enabledAt }] }, 'a rate above the ceiling is rejected')
rejects({ ...goodSettings, ratePeriods: [{ rateBasisPoints: '100', effectiveAt: goodSettings.enabledAt }] }, 'a string rate is rejected')
rejects({ ...goodSettings, ratePeriods: [{ rateBasisPoints: 100, effectiveAt: 'not-a-date' }] }, 'a garbage effectiveAt is rejected')
rejects({ ...goodSettings, ratePeriods: [{ rateBasisPoints: 100, effectiveAt: goodSettings.enabledAt, extra: 1 }] }, 'an extra period key is rejected')
rejects({
  ...goodSettings,
  ratePeriods: [
    { rateBasisPoints: 100, effectiveAt: '2026-08-20T00:00:00.000Z' },
    { rateBasisPoints: 200, effectiveAt: '2026-08-19T00:00:00.000Z' },
  ],
}, 'out-of-order periods are rejected — rate history is append-only')
rejects({ ...goodSettings, enabledAt: 'not-a-date' }, 'a garbage enabledAt is rejected')
rejects({ ...goodSettings, enabledAt: null }, 'enabled without enabledAt is rejected — the accrual cutoff must exist')
rejects({ ...goodSettings, proof: proof({ actor: '  ' }) }, 'a blank proof actor is rejected')
rejects({ ...goodSettings, proof: proof({ capturedAt: 'yesterday' }) }, 'a garbage proof timestamp is rejected')
rejects({ ...goodSettings, proof: { ...proof(), extra: 1 } }, 'an extra proof key is rejected')
check(validateShopLoyaltySettings({ ...goodSettings, enabled: false, enabledAt: null }).enabled === false, 'disabled-with-null-enabledAt (never turned on) validates')
check(validateShopLoyaltySettings({ ...goodSettings, enabled: false }).enabledAt === goodSettings.enabledAt, 'disabled-after-enablement keeps enabledAt')

// --- storage round trip: scoped, fail-closed read --------------------------------------
function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
  }
}

const storage = makeStorage()
check(readShopLoyaltySettings('local', storage) === null, 'an empty device reads as null (feature off)')
check(writeShopLoyaltySettings('local', goodSettings, storage) === true, 'a validated record writes under its scope')
check(shopLoyaltyCurrentRateBasisPoints(readShopLoyaltySettings('local', storage)) === 100, 'the written record reads back in the same scope')
check(readShopLoyaltySettings('managed:ws-alpha', storage) === null, 'ANOTHER scope reads null — one shop\'s enablement never leaks to another workspace')
check(readShopLoyaltySettings('local', makeStorage({ [localKey]: '{"garbage":true}' })) === null, 'a malformed stored record reads as null instead of throwing')
check(readShopLoyaltySettings('local', makeStorage({ [localKey]: 'not json' })) === null, 'unparseable storage reads as null')
check(readShopLoyaltySettings('local', null) === null, 'absent storage reads as null')
check(readShopLoyaltySettings('   ', storage) === null, 'an invalid scope reads as null, never a shared record')

// --- mutation: proof-carrying, actionId-idempotent, append-only rate history ------------
const enabling = updateShopLoyaltySettings(null, { enabled: true, rateBasisPoints: 100 }, proof())
check(enabling?.enabled === true && enabling.enabledAt === proof().capturedAt, 'first enablement stamps enabledAt from the proof')
check(enabling.ratePeriods.length === 1 && enabling.ratePeriods[0].effectiveAt === proof().capturedAt, 'first enablement records exactly one rate period, effective from the proof')
const replayed = updateShopLoyaltySettings(enabling, { enabled: true, rateBasisPoints: 100 }, proof())
check(replayed === enabling, 'replaying the same actionId with the same change returns the record UNCHANGED')
check(updateShopLoyaltySettings(enabling, { enabled: true, rateBasisPoints: 500 }, proof()) === null, 'reusing an actionId for a DIFFERENT change is refused')
check(updateShopLoyaltySettings(enabling, { enabled: true, rateBasisPoints: 0 }, proof({ actionId: 'LOYALTY-TEST-2' })) === null, 'an out-of-range rate is refused at the mutation too')
check(updateShopLoyaltySettings(enabling, { enabled: true, rateBasisPoints: 100 }, proof({ actionId: 'LOYALTY-TEST-2', actor: '' })) === null, 'a blank-actor proof is refused')
const sameRate = updateShopLoyaltySettings(enabling, { enabled: true, rateBasisPoints: 100 }, proof({ actionId: 'LOYALTY-TEST-2B', capturedAt: '2026-08-19T12:00:00.000Z' }))
check(sameRate?.ratePeriods.length === 1, 'saving an UNCHANGED rate appends no period — history records real changes only')
const disabled = updateShopLoyaltySettings(enabling, { enabled: false, rateBasisPoints: 100 }, proof({ actionId: 'LOYALTY-TEST-3', capturedAt: '2026-08-20T04:00:00.000Z' }))
check(disabled?.enabled === false && disabled.enabledAt === enabling.enabledAt, 'disabling keeps the original enabledAt')
const reEnabled = updateShopLoyaltySettings(disabled, { enabled: true, rateBasisPoints: 200 }, proof({ actionId: 'LOYALTY-TEST-4', capturedAt: '2026-08-21T04:00:00.000Z' }))
check(reEnabled?.enabledAt === enabling.enabledAt, 're-enabling NEVER moves enabledAt — toggling cannot wipe balances')
check(reEnabled?.ratePeriods.length === 2 && shopLoyaltyCurrentRateBasisPoints(reEnabled) === 200, 'a rate change APPENDS a period; the old period survives')
check(reEnabled?.ratePeriods[0].rateBasisPoints === 100 && reEnabled?.ratePeriods[0].effectiveAt === proof().capturedAt, 'the original period is untouched — history is never rewritten')
check(reEnabled?.proof.actionId === 'LOYALTY-TEST-4', 'the proof records the latest change')

// --- points arithmetic: floor, never up ------------------------------------------------
check(shopLoyaltyPointsForAmount(24000, 100) === 240, '1% of 24,000 MMK is 240 points')
check(shopLoyaltyPointsForAmount(24099, 100) === 240, 'floor rounding: 240.99 credits 240')
check(shopLoyaltyPointsForAmount(99, 100) === 0, 'a sale below one point credits zero')
check(shopLoyaltyPointsForAmount(24000, 250) === 600, '2.5% of 24,000 MMK is 600 points')
check(shopLoyaltyPointsForAmount(-5, 100) === 0, 'a negative amount credits zero')
check(shopLoyaltyPointsForAmount(24000.5, 100) === 0, 'a non-integer amount credits zero')
check(shopLoyaltyDisplayPoints(-40) === 0, 'display clamps below zero')
check(shopLoyaltyDisplayPoints(240) === 240, 'display passes a real balance through')
check(shopLoyaltyDisplayPoints(Number.NaN) === 0, 'display treats NaN as zero')

// --- the projection ---------------------------------------------------------------------
const enabledAt = '2026-08-10T00:00:00.000Z'
const settings = validateShopLoyaltySettings({
  schema: SHOP_LOYALTY_SCHEMA,
  enabled: true,
  ratePeriods: [{ rateBasisPoints: 100, effectiveAt: enabledAt }],
  enabledAt,
  proof: proof(),
})
const order = (overrides = {}) => ({
  customer: 'Ma Aye',
  total: 24000,
  status: 'completed',
  paymentStatus: 'reconciled',
  paymentReconciledAt: '2026-08-15T03:00:00.000Z',
  paymentReconciliationActionId: 'ACT-8f2a41',
  ...overrides,
})

check(shopLoyaltyBalances({ orders: [order()] }, settings).get('Ma Aye') === 240, 'a settled, completed sale accrues floor(total × rate / 10000)')
check(shopLoyaltyBalances({ orders: [order(), order({ total: 12099 })] }, settings).get('Ma Aye') === 360, 'multiple sales sum per exact customer (240 + floor(120.99))')
check(shopLoyaltyBalances({ orders: [order({ customer: '  Ma Aye  ' })] }, settings).get('Ma Aye') === 240, 'customer strings are trimmed to the exact credit-policy key')
check(shopLoyaltyBalances({ orders: [order()] }, null).size === 0, 'no settings, no balances')
check(shopLoyaltyBalances({ orders: [order()] }, { ...settings, enabled: false }).size === 0, 'disabled settings project nothing')

// enabledAt cutoff: settlement BEFORE enablement never counts, even for a live customer.
check(shopLoyaltyBalances({ orders: [order({ paymentReconciledAt: '2026-08-09T23:59:59.000Z' })] }, settings).size === 0, 'a sale settled before enablement earns nothing')
check(shopLoyaltyBalances({ orders: [order({ paymentReconciledAt: enabledAt })] }, settings).get('Ma Aye') === 240, 'a sale settled exactly at enablement counts (at-or-after)')
check(shopLoyaltyBalances({ orders: [order({ paymentReconciledAt: undefined })] }, settings).size === 0, 'a reconciled order without a settlement timestamp is skipped, not guessed')

// Guest and blank exclusion.
check(shopLoyaltyBalances({ orders: [order({ customer: 'Guest' })] }, settings).size === 0, 'Guest sales earn nothing')
check(shopLoyaltyBalances({ orders: [order({ customer: '   ' })] }, settings).size === 0, 'blank customers earn nothing')

// Not-yet-settled and not-yet-completed orders earn nothing.
check(shopLoyaltyBalances({ orders: [order({ paymentStatus: 'pending' })] }, settings).size === 0, 'an unpaid order earns nothing')
check(shopLoyaltyBalances({ orders: [order({ status: 'ready' })] }, settings).size === 0, 'a paid but not handed-over order earns nothing yet')

// Rate changes are effective-dated, never retroactive: an order keeps earning
// at the rate that governed its own settlement.
const twoRates = validateShopLoyaltySettings({
  ...settings,
  ratePeriods: [
    { rateBasisPoints: 100, effectiveAt: enabledAt },
    { rateBasisPoints: 200, effectiveAt: '2026-08-16T00:00:00.000Z' },
  ],
})
const earlyOrder = order() // settled 2026-08-15, under the 1% period
const lateOrder = order({ paymentReconciledAt: '2026-08-17T03:00:00.000Z' }) // under the 2% period
check(shopLoyaltyBalances({ orders: [earlyOrder, lateOrder] }, twoRates).get('Ma Aye') === 240 + 480, 'each order earns at the rate in force when IT settled — a raise never retroactively doubles old balances')
check(shopLoyaltyBalances({ orders: [earlyOrder] }, twoRates).get('Ma Aye') === 240, 'a later rate raise leaves an earlier order\'s points exactly as promised')

// Corrections change what an order actually earned: a credit correction
// (return, price reduction) subtracts before accrual; a debit adds; a
// structurally broken chain earns nothing rather than guessing.
check(shopLoyaltyBalances({ orders: [order({ corrections: [{ kind: 'credit', calculation: { totalMmk: 4000 } }] })] }, settings).get('Ma Aye') === 200, 'a credit correction reduces accrual to the corrected balance (24,000 − 4,000 → 200 pts)')
check(shopLoyaltyBalances({ orders: [order({ corrections: [{ kind: 'debit', calculation: { totalMmk: 6000 } }] })] }, settings).get('Ma Aye') === 300, 'a debit correction raises accrual with the corrected balance (24,000 + 6,000 → 300 pts)')
check(shopLoyaltyBalances({ orders: [order({ corrections: [{ kind: 'credit', calculation: { totalMmk: 30000 } }] })] }, settings).size === 0, 'a correction chain that would go below zero credits nothing — same null contract as commerceOrderAdjustedTotal')
check(shopLoyaltyBalances({ orders: [order({ corrections: [{ kind: 'credit', calculation: { totalMmk: 'x' } }] })] }, settings).size === 0, 'a malformed correction record credits nothing rather than guessing')

// Refund reversal, structurally: a refunded order is a CANCELLED order
// (validateCommerceState invariant), and cancellation is unreachable from
// 'completed' (commerceOrderHasReleasableReservation), so recomputing from
// state drops the credit. The refunded customer holds no points.
const refunded = order({
  status: 'cancelled',
  refundStatus: 'settled',
  refundSettledAt: '2026-08-16T03:00:00.000Z',
})
check(shopLoyaltyBalances({ orders: [refunded] }, settings).size === 0, 'a refunded (cancelled, money returned) order credits nothing — the reversal is the recompute')
check(shopLoyaltyBalances({ orders: [order(), refunded] }, settings).get('Ma Aye') === 240, 'a refund on one order never touches the credit another order earned')

// Sample exclusion, both guards: the ACT-DEMO- actionId prefix alone must hold
// even when the clock guard is defeated (enabledAt set BEFORE the seed data).
check(shopLoyaltyBalances({ orders: [order({ paymentReconciliationActionId: 'ACT-DEMO-PAY-1039' })] }, settings).size === 0, 'a sample-seeded settlement (ACT-DEMO- prefix) earns nothing regardless of timestamps')
const seedState = createSeedCommerce()
const preSeedSettings = validateShopLoyaltySettings({
  ...settings,
  enabledAt: '2020-01-01T00:00:00.000Z',
  ratePeriods: [{ rateBasisPoints: 100, effectiveAt: '2020-01-01T00:00:00.000Z' }],
})
check(shopLoyaltyBalances(seedState, preSeedSettings).size === 0, 'the seeded workspace projects ZERO balances even under an enablement predating the seed')
check(shopLoyaltyBalances(seedState, settings).size === 0, 'the seeded workspace projects zero balances under a normal enablement')

// --- PR2: redemption is DERIVED from prefixed credit corrections ------------------------
// The spend is the correction itself: an accountable action generated with
// SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX records a credit correction whose
// actionId the projection recognises — one atomic commerce write, no second
// store (Codex P1, PR #472). The stored settings record keeps the exact PR1
// shape: a redemptions key is now an unknown key and must REJECT.
rejects({ ...goodSettings, redemptions: [] }, 'a redemptions key is rejected — spends live in CommerceState, not the settings record')
check(SHOP_LOYALTY_REDEMPTION_ACTION_ID_PREFIX === 'ACT-LOYREDEEM-', 'the redemption marker is a stable actionId prefix (never display copy)')

// A redemption correction in a tax-exclusive workspace: the LISTED amount is
// the points spent; totalMmk carries tax on top. The projection must use
// listedAmountMmk — using totalMmk would over-spend by the tax (post-merge
// audit finding on PR #472).
const spend = (points, overrides = {}) => ({ kind: 'credit', actionId: `ACT-LOYREDEEM-${points}-X`, calculation: { listedAmountMmk: points, totalMmk: points + Math.ceil(points * 0.05) }, ...overrides })

// Receipt line derivation.
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [spend(50)] })) === 50, 'the receipt line sums prefixed credit corrections on the order')
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [spend(50), spend(20, { actionId: 'ACT-LOYREDEEM-20-Y' })] })) === 70, 'multiple spends on one order sum')
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [{ kind: 'credit', actionId: 'ACT-ORDINARY-1', calculation: { totalMmk: 50 } }] })) === 0, 'an ordinary credit correction is NOT a spend — only the prefix marks one')
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [{ kind: 'debit', actionId: 'ACT-LOYREDEEM-BAD', calculation: { totalMmk: 50 } }] })) === 0, 'a debit can never be a spend')
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [{ kind: 'credit', calculation: { totalMmk: 50 } }] })) === 0, 'a correction without an actionId is not a spend')
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [{ kind: 'credit', actionId: 'ACT-LOYREDEEM-T', calculation: { listedAmountMmk: 50, totalMmk: 55 } }] })) === 50, 'points spent = the LISTED before-tax amount, never the tax-inclusive total')
check(shopLoyaltyRedeemedPointsForOrder(order({ corrections: [{ kind: 'credit', actionId: 'ACT-LOYREDEEM-T2', calculation: { totalMmk: 55 } }] })) === 0, 'a prefixed credit without listedAmountMmk counts zero rather than guessing from the taxed total')
check(shopLoyaltyRedeemedPointsForOrder(order()) === 0, 'no corrections, no redemption line')
check(shopLoyaltyRedeemedPointsForOrder(null) === 0, 'no order, no redemption line')

// Balance projection subtracts spends, coherently with the accrual reduction.
// Redeeming 50 points records a 50 MMK prefixed credit on the order. The
// order's accrual drops to floor(23,950 × 1%) = 239 (the customer effectively
// paid less) AND the spend subtracts 50. Balance = 239 − 50 = 189.
const redeemedOrder = order({ id: 'ORD-1', corrections: [spend(50)] })
check(shopLoyaltyBalances({ orders: [redeemedOrder] }, settings).get('Ma Aye') === 189, 'coherence: the prefixed credit reduces accrual (240 → 239) AND subtracts the spend (− 50) — balance 189')
check(shopLoyaltyBalances({ orders: [order({ id: 'ORD-1', corrections: [{ kind: 'credit', actionId: 'ACT-ORDINARY-1', calculation: { totalMmk: 50 } }] })] }, settings).get('Ma Aye') === 239, 'an ordinary credit only reduces accrual — no spend subtraction without the prefix')
// A spend must survive the accrual gates: an order settled BEFORE enablement
// earns nothing, but points redeemed against it are still spent.
const preEnablementSpend = order({ id: 'ORD-0', paymentReconciledAt: '2026-08-01T00:00:00.000Z', corrections: [spend(30)] })
check(shopLoyaltyBalances({ orders: [order(), preEnablementSpend] }, settings).get('Ma Aye') === 210, 'a spend on a pre-enablement order still subtracts (240 accrued elsewhere − 30 spent) — skipping it would let the same points redeem twice')
check(shopLoyaltyBalances({ orders: [preEnablementSpend] }, settings).get('Ma Aye') === -30, 'a spend with no surviving accrual projects negative internally (display clamps at zero)')
check(shopLoyaltyDisplayPoints(shopLoyaltyBalances({ orders: [preEnablementSpend] }, settings).get('Ma Aye') ?? 0) === 0, 'the counter never shows a negative balance')
// Sample orders stay fully outside the ledger, spends included.
check(shopLoyaltyBalances({ orders: [order({ paymentReconciliationActionId: 'ACT-DEMO-PAY-1', corrections: [spend(10)] })] }, settings).size === 0, 'a sample-seeded order contributes neither accrual nor spends')

// --- PR2: the redemption pre-flight gate ---------------------------------------------------
const redeemState = { orders: [order({ id: 'ORD-1' })] }
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'Ma Aye', orderId: 'ORD-1', points: 240 }) === true, 'spending the exact projected balance is allowed')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'Ma Aye', orderId: 'ORD-1', points: 241 }) === false, 'over-redemption is blocked against the projected balance (240)')
check(shopLoyaltyRedemptionAllowed(settings, { orders: [redeemedOrder] }, { customer: 'Ma Aye', orderId: 'ORD-1', points: 190 }) === false, 'the gate sees prior spends: after redeeming 50, only 189 remain')
check(shopLoyaltyRedemptionAllowed(settings, { orders: [redeemedOrder] }, { customer: 'Ma Aye', orderId: 'ORD-1', points: 189 }) === true, 'the exact remaining balance is spendable')
check(shopLoyaltyRedemptionAllowed(null, redeemState, { customer: 'Ma Aye', orderId: 'ORD-1', points: 10 }) === false, 'no settings, no redemption')
check(shopLoyaltyRedemptionAllowed({ ...settings, enabled: false }, redeemState, { customer: 'Ma Aye', orderId: 'ORD-1', points: 10 }) === false, 'disabled settings block redemption entirely')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'Guest', orderId: 'ORD-1', points: 10 }) === false, 'Guest can never redeem')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: '   ', orderId: 'ORD-1', points: 10 }) === false, 'a blank customer can never redeem')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'U Kyaw', orderId: 'ORD-1', points: 10 }) === false, 'an unknown customer (no balance, not the order owner) is blocked')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'Ma Aye', orderId: 'ORD-MISSING', points: 10 }) === false, 'a redemption must bind to an existing order')
check(shopLoyaltyRedemptionAllowed(settings, { orders: [order({ id: 'ORD-1', status: 'ready' })] }, { customer: 'Ma Aye', orderId: 'ORD-1', points: 10 }) === false, 'a not-yet-completed order cannot carry a redemption')
check(shopLoyaltyRedemptionAllowed(settings, { orders: [order({ id: 'ORD-1', paymentStatus: 'pending' })] }, { customer: 'Ma Aye', orderId: 'ORD-1', points: 10 }) === false, 'an unpaid order cannot carry a redemption')
check(shopLoyaltyRedemptionAllowed(settings, { orders: [order({ id: 'ORD-1' }), order({ id: 'ORD-2', customer: 'U Kyaw' })] }, { customer: 'Ma Aye', orderId: 'ORD-2', points: 10 }) === false, "a customer cannot redeem against another customer's order")
check(shopLoyaltyRedemptionAllowed(settings, { orders: [order({ id: 'ORD-1', paymentReconciliationActionId: 'ACT-DEMO-PAY-1' })] }, { customer: 'Ma Aye', orderId: 'ORD-1', points: 10 }) === false, 'a sample-seeded order can never carry a redemption (actionId prefix, never actor)')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'Ma Aye', orderId: 'ORD-1', points: 0 }) === false, 'a zero-point spend is refused')
check(shopLoyaltyRedemptionAllowed(settings, redeemState, { customer: 'Ma Aye', orderId: 'ORD-1', points: 50.5 }) === false, 'a fractional spend is refused')

console.log(`shop loyalty contract: ${checks} checks passed`)
