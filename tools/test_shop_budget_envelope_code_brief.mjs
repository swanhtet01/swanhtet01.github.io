// Shop budget envelope code brief: budgetCode and label distribution across envelopes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopBudgetEnvelopeCodeBrief } from './shop-budget-envelope-code-brief.ts'`,
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

const { projectShopBudgetEnvelopeCodeBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const PROOF = { actionId: 'ACT-1', capturedAt: '2026-08-01T09:00:00Z', actor: 'approver-1', reason: 'Budget approved.', evidenceReference: 'EVD-1' }

let envId = 0
function envelope(budgetCode, label) {
  envId++
  return {
    id: `ENV-${envId}`,
    createdAt: '2026-08-01T09:00:00Z',
    budgetCode,
    label,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    ceilingMmk: 1000000,
    perRequisitionLimitMmk: 100000,
    approval: PROOF,
  }
}

function state(purchaseBudgetEnvelopes) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (purchaseBudgetEnvelopes !== undefined) base.purchaseBudgetEnvelopes = purchaseBudgetEnvelopes
  return base
}

// 1. No envelopes (undefined) → zeros
{
  const r = projectShopBudgetEnvelopeCodeBrief(state(undefined))
  check(r.totalEnvelopes === 0, 'empty: totalEnvelopes 0')
  check(r.uniqueBudgetCodes === 0, 'empty: uniqueBudgetCodes 0')
  check(r.topBudgetCodesByCount.length === 0, 'empty: topBudgetCodesByCount empty')
  check(r.uniqueLabels === 0, 'empty: uniqueLabels 0')
  check(r.topLabelsByCount.length === 0, 'empty: topLabelsByCount empty')
}

// 2. Single envelope
{
  const r = projectShopBudgetEnvelopeCodeBrief(state([envelope('OPEX-2026-Q3', 'Operations Q3')]))
  check(r.totalEnvelopes === 1, 'single: totalEnvelopes 1')
  check(r.uniqueBudgetCodes === 1, 'single: uniqueBudgetCodes 1')
  check(r.topBudgetCodesByCount[0]?.budgetCode === 'OPEX-2026-Q3', 'single: top budgetCode')
  check(r.uniqueLabels === 1, 'single: uniqueLabels 1')
  check(r.topLabelsByCount[0]?.label === 'Operations Q3', 'single: top label')
}

// 3. Multiple envelopes, same budgetCode
{
  const envs = [envelope('OPEX-2026', 'Ops A'), envelope('OPEX-2026', 'Ops B'), envelope('CAPEX-2026', 'Capital')]
  const r = projectShopBudgetEnvelopeCodeBrief(state(envs))
  check(r.totalEnvelopes === 3, 'shared: totalEnvelopes 3')
  check(r.uniqueBudgetCodes === 2, 'shared: uniqueBudgetCodes 2')
  check(r.topBudgetCodesByCount[0]?.budgetCode === 'OPEX-2026', 'shared: top budgetCode OPEX-2026')
  check(r.topBudgetCodesByCount[0]?.count === 2, 'shared: count 2')
  check(r.uniqueLabels === 3, 'shared: uniqueLabels 3')
}

// 4. Top-5 cap on budgetCode
{
  const codes = ['CODE-F', 'CODE-A', 'CODE-C', 'CODE-B', 'CODE-D', 'CODE-E']
  const r = projectShopBudgetEnvelopeCodeBrief(state(codes.map(c => envelope(c, `Label-${c}`))))
  check(r.topBudgetCodesByCount.length === 5, 'top5: capped at 5')
  check(r.topBudgetCodesByCount[0]?.budgetCode === 'CODE-A', 'top5: tiebreak CODE-A first')
}

// 5. Sort by count
{
  const envs = [envelope('OPEX', 'Ops'), envelope('CAPEX', 'Cap'), envelope('CAPEX', 'Cap2')]
  const r = projectShopBudgetEnvelopeCodeBrief(state(envs))
  check(r.topBudgetCodesByCount[0]?.budgetCode === 'CAPEX', 'sort: CAPEX first')
  check(r.topBudgetCodesByCount[0]?.count === 2, 'sort: CAPEX count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
