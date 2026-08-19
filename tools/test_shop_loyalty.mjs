// Contract guard for the Shop customer loyalty points module (roadmap S3 PR1).
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
        validateShopLoyaltySettings, readShopLoyaltySettings, writeShopLoyaltySettings,
        updateShopLoyaltySettings, shopLoyaltyPointsForAmount, shopLoyaltyBalances,
        shopLoyaltyDisplayPoints, shopLoyaltyScopeForWorkspace, shopLoyaltyStorageKey,
        shopLoyaltyCurrentRateBasisPoints,
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
  validateShopLoyaltySettings, readShopLoyaltySettings, writeShopLoyaltySettings,
  updateShopLoyaltySettings, shopLoyaltyPointsForAmount, shopLoyaltyBalances,
  shopLoyaltyDisplayPoints, shopLoyaltyScopeForWorkspace, shopLoyaltyStorageKey,
  shopLoyaltyCurrentRateBasisPoints,
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

console.log(`shop loyalty contract: ${checks} checks passed`)
