// Shop shipping policy summary: totalPolicies, activePolicies, inactivePolicies,
// uniqueZones, totalTownshipsConfigured, lowestFeeMmk, averagePromiseMinutes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopShippingPolicySummary } from './shop-shipping-policy-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shipping-policy-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopShippingPolicySummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }
let rev = 0

function policy({ zoneCode = 'ZONE-A', townships = ['TP-1', 'TP-2', 'TP-3'], feeMmk = 2_000, promiseMinutes = 30, status = 'active', effectiveUntil = null } = {}) {
  return {
    revision: ++rev,
    zoneCode,
    townships,
    feeMmk,
    promiseMinutes,
    status,
    effectiveFrom: '2026-08-01',
    effectiveUntil,
    proof: PROOF,
  }
}

function state(shippingPolicies = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(shippingPolicies !== undefined ? { shippingPolicies } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopShippingPolicySummary(state())
  check(r.totalPolicies === 0, 'empty: totalPolicies 0')
  check(r.activePolicies === 0, 'empty: activePolicies 0')
  check(r.inactivePolicies === 0, 'empty: inactivePolicies 0')
  check(r.uniqueZones === 0, 'empty: uniqueZones 0')
  check(r.totalTownshipsConfigured === 0, 'empty: totalTownshipsConfigured 0')
  check(r.lowestFeeMmk === 0, 'empty: lowestFeeMmk 0')
  check(r.averagePromiseMinutes === 0, 'empty: averagePromiseMinutes 0')
}

// 2. Empty array → totalPolicies 0
{
  const r = projectShopShippingPolicySummary(state([]))
  check(r.totalPolicies === 0, 'empty-array: totalPolicies 0')
}

// 3. Single active policy
{
  const r = projectShopShippingPolicySummary(state([
    policy({ zoneCode: 'ZONE-CBD', townships: ['TP-1', 'TP-2', 'TP-3'], feeMmk: 2_000, promiseMinutes: 45 }),
  ]))
  check(r.totalPolicies === 1, 'single: totalPolicies 1')
  check(r.activePolicies === 1, 'single: activePolicies 1')
  check(r.inactivePolicies === 0, 'single: inactivePolicies 0')
  check(r.uniqueZones === 1, 'single: uniqueZones 1')
  check(r.totalTownshipsConfigured === 3, 'single: totalTownshipsConfigured 3')
  check(r.lowestFeeMmk === 2_000, 'single: lowestFeeMmk 2000')
  check(r.averagePromiseMinutes === 45, 'single: averagePromiseMinutes 45')
}

// 4. Single inactive policy
{
  const r = projectShopShippingPolicySummary(state([
    policy({ status: 'inactive' }),
  ]))
  check(r.inactivePolicies === 1, 'inactive: inactivePolicies 1')
  check(r.activePolicies === 0, 'inactive: activePolicies 0')
}

// 5. uniqueZones: same zoneCode, two revisions → uniqueZones 1, totalPolicies 2
{
  const r = projectShopShippingPolicySummary(state([
    policy({ zoneCode: 'ZONE-X' }),
    policy({ zoneCode: 'ZONE-X' }),
  ]))
  check(r.uniqueZones === 1, 'dedup-zone: uniqueZones 1')
  check(r.totalPolicies === 2, 'dedup-zone: totalPolicies 2')
}

// 6. totalTownshipsConfigured accumulates across policies
{
  const r = projectShopShippingPolicySummary(state([
    policy({ townships: ['TP-1', 'TP-2', 'TP-3'] }),
    policy({ townships: ['TP-4', 'TP-5'] }),
  ]))
  check(r.totalTownshipsConfigured === 5, 'townships-accum: 3+2=5')
}

// 7. lowestFeeMmk: minimum wins
{
  const r = projectShopShippingPolicySummary(state([
    policy({ feeMmk: 1_000 }),
    policy({ feeMmk: 500 }),
    policy({ feeMmk: 2_000 }),
  ]))
  check(r.lowestFeeMmk === 500, 'lowest-fee: 500 wins')
}

// 8. averagePromiseMinutes: (30 + 60) / 2 = 45
{
  const r = projectShopShippingPolicySummary(state([
    policy({ promiseMinutes: 30 }),
    policy({ promiseMinutes: 60 }),
  ]))
  check(r.averagePromiseMinutes === 45, 'avg-promise: (30+60)/2=45')
}

// 9. averagePromiseMinutes rounds: (30 + 31) / 2 = 30.5 → 31
{
  const r = projectShopShippingPolicySummary(state([
    policy({ promiseMinutes: 30 }),
    policy({ promiseMinutes: 31 }),
  ]))
  check(r.averagePromiseMinutes === 31, 'avg-round: Math.round(30.5)=31')
}

// 10. Multiple distinct zones
{
  const r = projectShopShippingPolicySummary(state([
    policy({ zoneCode: 'ZONE-A' }),
    policy({ zoneCode: 'ZONE-B' }),
    policy({ zoneCode: 'ZONE-C' }),
  ]))
  check(r.uniqueZones === 3, 'multi-zones: uniqueZones 3')
}

// 11. Mixed active/inactive
{
  const r = projectShopShippingPolicySummary(state([
    policy({ status: 'active' }),
    policy({ status: 'active' }),
    policy({ status: 'inactive' }),
  ]))
  check(r.activePolicies === 2, 'mixed: activePolicies 2')
  check(r.inactivePolicies === 1, 'mixed: inactivePolicies 1')
}

// 12. lowestFeeMmk: free delivery (0) stays lowest even vs 2000
{
  const r = projectShopShippingPolicySummary(state([
    policy({ feeMmk: 2_000 }),
    policy({ feeMmk: 0 }),
  ]))
  check(r.lowestFeeMmk === 0, 'free-delivery: lowestFeeMmk 0')
}

// 13. totalTownshipsConfigured includes inactive policies
{
  const r = projectShopShippingPolicySummary(state([
    policy({ townships: ['TP-A', 'TP-B'], status: 'inactive' }),
    policy({ townships: ['TP-C'], status: 'active' }),
  ]))
  check(r.totalTownshipsConfigured === 3, 'townships-all: inactive included → 2+1=3')
}

console.log(JSON.stringify({ ok: true, checks }))
