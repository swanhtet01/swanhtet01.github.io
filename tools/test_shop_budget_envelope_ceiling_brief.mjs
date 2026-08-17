// Shop budget envelope ceiling brief: ceilingMmk + perRequisitionLimitMmk numeric stats across purchase budget envelopes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopBudgetEnvelopeCeilingBrief } from './shop-budget-envelope-ceiling-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopBudgetEnvelopeCeilingBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'buyer-1', reason: 'Approved.', evidenceReference: 'EVD-1' }

let envId = 0
function env(ceilingMmk, perRequisitionLimitMmk) {
  envId++
  return {
    id: `ENV-${envId}`,
    createdAt: '2026-08-01T09:00:00Z',
    budgetCode: `BC-${envId}`,
    label: `Budget ${envId}`,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    ceilingMmk,
    perRequisitionLimitMmk,
    approval: PROOF,
  }
}

function state(purchaseBudgetEnvelopes) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseBudgetEnvelopes !== undefined) base.purchaseBudgetEnvelopes = purchaseBudgetEnvelopes
  return base
}

// 1. No envelopes → all zeros / nulls
{
  const r = projectShopBudgetEnvelopeCeilingBrief(state(undefined))
  check(r.totalEnvelopes === 0, 'empty: totalEnvelopes 0')
  check(r.totalCeilingMmk === 0, 'empty: totalCeilingMmk 0')
  check(r.averageCeilingMmk === 0, 'empty: averageCeilingMmk 0')
  check(r.minCeilingMmk === null, 'empty: minCeilingMmk null')
  check(r.maxCeilingMmk === null, 'empty: maxCeilingMmk null')
  check(r.totalPerRequisitionLimitMmk === 0, 'empty: totalPerRequisitionLimitMmk 0')
  check(r.averagePerRequisitionLimitMmk === 0, 'empty: averagePerRequisitionLimitMmk 0')
  check(r.minPerRequisitionLimitMmk === null, 'empty: minPerRequisitionLimitMmk null')
  check(r.maxPerRequisitionLimitMmk === null, 'empty: maxPerRequisitionLimitMmk null')
}

// 2. Single envelope → all fields populated
{
  const r = projectShopBudgetEnvelopeCeilingBrief(state([env(10000000, 500000)]))
  check(r.totalEnvelopes === 1, 'single: totalEnvelopes 1')
  check(r.totalCeilingMmk === 10000000, 'single: totalCeilingMmk 10000000')
  check(r.averageCeilingMmk === 10000000, 'single: averageCeilingMmk 10000000')
  check(r.minCeilingMmk === 10000000, 'single: minCeilingMmk 10000000')
  check(r.maxCeilingMmk === 10000000, 'single: maxCeilingMmk 10000000')
  check(r.totalPerRequisitionLimitMmk === 500000, 'single: totalPerRequisitionLimitMmk 500000')
  check(r.averagePerRequisitionLimitMmk === 500000, 'single: averagePerRequisitionLimitMmk 500000')
  check(r.minPerRequisitionLimitMmk === 500000, 'single: minPerRequisitionLimitMmk 500000')
  check(r.maxPerRequisitionLimitMmk === 500000, 'single: maxPerRequisitionLimitMmk 500000')
}

// 3. Multiple envelopes → ceiling stats
{
  const r = projectShopBudgetEnvelopeCeilingBrief(
    state([env(5000000, 200000), env(15000000, 600000), env(10000000, 400000)]),
  )
  check(r.totalCeilingMmk === 30000000, 'multi: totalCeilingMmk 30000000')
  check(r.averageCeilingMmk === 10000000, 'multi: averageCeilingMmk 10000000')
  check(r.minCeilingMmk === 5000000, 'multi: minCeilingMmk 5000000')
  check(r.maxCeilingMmk === 15000000, 'multi: maxCeilingMmk 15000000')
}

// 4. Multiple envelopes → perRequisitionLimit stats
{
  const r = projectShopBudgetEnvelopeCeilingBrief(
    state([env(10000000, 200000), env(10000000, 800000), env(10000000, 400000)]),
  )
  check(r.totalPerRequisitionLimitMmk === 1400000, 'multi-req: total 1400000')
  check(r.averagePerRequisitionLimitMmk === 466667, 'multi-req: avg Math.round(1400000/3)')
  check(r.minPerRequisitionLimitMmk === 200000, 'multi-req: min 200000')
  check(r.maxPerRequisitionLimitMmk === 800000, 'multi-req: max 800000')
}

// 5. Math.round for averageCeilingMmk: 10000000+20000001 = 30000001 / 2 = 15000000.5 → 15000001
{
  const r = projectShopBudgetEnvelopeCeilingBrief(
    state([env(10000000, 100000), env(20000001, 100000)]),
  )
  check(r.averageCeilingMmk === 15000001, 'round-ceiling: round(15000000.5)=15000001')
}

// 6. Math.round for averagePerRequisitionLimitMmk: 100000+200001 = 300001 / 2 = 150000.5 → 150001
{
  const r = projectShopBudgetEnvelopeCeilingBrief(
    state([env(10000000, 100000), env(10000000, 200001)]),
  )
  check(r.averagePerRequisitionLimitMmk === 150001, 'round-req: round(150000.5)=150001')
}

console.log(JSON.stringify({ ok: true, checks }))
