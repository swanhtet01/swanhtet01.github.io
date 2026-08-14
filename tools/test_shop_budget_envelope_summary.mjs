// Shop purchase budget envelope summary: totalEnvelopes, totalCeilingMmk,
// averageCeilingMmk, highestCeilingMmk, uniqueBudgetCodes, byBudgetCode sorted desc.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopBudgetEnvelopeSummary } from './shop-budget-envelope-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/budget-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopBudgetEnvelopeSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }

let envSeq = 0
function env({ budgetCode, ceilingMmk, perRequisitionLimitMmk = 50_000, periodStart = '2026-08-01', periodEnd = '2026-08-31' }) {
  envSeq++
  return {
    id: `PBE-${String(envSeq).padStart(8, '0')}-0000-4000-A000-000000000001`,
    createdAt: '2026-08-11T08:00:00.000Z',
    budgetCode,
    label: `Budget ${budgetCode}`,
    periodStart,
    periodEnd,
    ceilingMmk,
    perRequisitionLimitMmk,
    approval: PROOF,
  }
}

function state(purchaseBudgetEnvelopes = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(purchaseBudgetEnvelopes !== undefined ? { purchaseBudgetEnvelopes } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopBudgetEnvelopeSummary(state())
  check(r.totalEnvelopes === 0, 'empty: totalEnvelopes 0')
  check(r.totalCeilingMmk === 0, 'empty: totalCeilingMmk 0')
  check(r.averageCeilingMmk === 0, 'empty: averageCeilingMmk 0')
  check(r.highestCeilingMmk === 0, 'empty: highestCeilingMmk 0')
  check(r.uniqueBudgetCodes === 0, 'empty: uniqueBudgetCodes 0')
  check(r.byBudgetCode.length === 0, 'empty: byBudgetCode empty')
}

// 2. Empty array
{
  const r = projectShopBudgetEnvelopeSummary(state([]))
  check(r.totalEnvelopes === 0, 'empty-array: totalEnvelopes 0')
}

// 3. Single envelope
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 500_000 }),
  ]))
  check(r.totalEnvelopes === 1, 'single: totalEnvelopes 1')
  check(r.totalCeilingMmk === 500_000, 'single: totalCeilingMmk 500000')
  check(r.averageCeilingMmk === 500_000, 'single: averageCeilingMmk 500000')
  check(r.highestCeilingMmk === 500_000, 'single: highestCeilingMmk 500000')
  check(r.uniqueBudgetCodes === 1, 'single: uniqueBudgetCodes 1')
  check(r.byBudgetCode.length === 1, 'single: byBudgetCode 1 entry')
  check(r.byBudgetCode[0].budgetCode === 'SHOP-STOCK', 'single: budgetCode SHOP-STOCK')
  check(r.byBudgetCode[0].envelopeCount === 1, 'single: envelopeCount 1')
  check(r.byBudgetCode[0].totalCeilingMmk === 500_000, 'single: code totalCeilingMmk 500000')
}

// 4. Two envelopes, same budget code → same code counted once in uniqueBudgetCodes
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 300_000, periodStart: '2026-07-01', periodEnd: '2026-07-31' }),
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 400_000, periodStart: '2026-08-01', periodEnd: '2026-08-31' }),
  ]))
  check(r.totalEnvelopes === 2, 'same-code: totalEnvelopes 2')
  check(r.uniqueBudgetCodes === 1, 'same-code: uniqueBudgetCodes 1')
  check(r.totalCeilingMmk === 700_000, 'same-code: totalCeilingMmk 700000')
  check(r.byBudgetCode.length === 1, 'same-code: byBudgetCode 1 entry')
  check(r.byBudgetCode[0].envelopeCount === 2, 'same-code: envelopeCount 2')
  check(r.byBudgetCode[0].totalCeilingMmk === 700_000, 'same-code: code totalCeilingMmk 700000')
}

// 5. latestPeriodEnd picks the max ISO date
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 200_000, periodStart: '2026-07-01', periodEnd: '2026-07-31' }),
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 300_000, periodStart: '2026-08-01', periodEnd: '2026-08-31' }),
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 100_000, periodStart: '2026-06-01', periodEnd: '2026-06-30' }),
  ]))
  check(r.byBudgetCode[0].latestPeriodEnd === '2026-08-31', 'latest-period: latestPeriodEnd is max ISO date 2026-08-31')
}

// 6. Multiple distinct budget codes → uniqueBudgetCodes count
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'SHOP-STOCK', ceilingMmk: 500_000 }),
    env({ budgetCode: 'PLANT-PARTS', ceilingMmk: 300_000 }),
    env({ budgetCode: 'EMERGENCY', ceilingMmk: 100_000 }),
  ]))
  check(r.uniqueBudgetCodes === 3, 'multi-code: uniqueBudgetCodes 3')
  check(r.totalCeilingMmk === 900_000, 'multi-code: totalCeilingMmk 900000')
}

// 7. highestCeilingMmk picks the maximum
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'CODE-A', ceilingMmk: 200_000 }),
    env({ budgetCode: 'CODE-B', ceilingMmk: 800_000 }),
    env({ budgetCode: 'CODE-C', ceilingMmk: 500_000 }),
  ]))
  check(r.highestCeilingMmk === 800_000, 'highest: highestCeilingMmk 800000')
}

// 8. averageCeilingMmk rounds: 3 envelopes total 1,000,000 → 333,333.33 → round to 333333
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'CODE-A', ceilingMmk: 400_000 }),
    env({ budgetCode: 'CODE-B', ceilingMmk: 400_000 }),
    env({ budgetCode: 'CODE-C', ceilingMmk: 200_000 }),
  ]))
  check(r.averageCeilingMmk === 333_333, 'avg-round: Math.round(1000000/3)=333333')
}

// 9. byBudgetCode sorted desc by totalCeilingMmk
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'SMALL-BUD', ceilingMmk: 100_000 }),
    env({ budgetCode: 'BIG-BUD', ceilingMmk: 900_000 }),
    env({ budgetCode: 'MED-BUD', ceilingMmk: 400_000 }),
  ]))
  check(r.byBudgetCode[0].budgetCode === 'BIG-BUD', 'sort: BIG-BUD first (900k ceiling)')
  check(r.byBudgetCode[1].budgetCode === 'MED-BUD', 'sort: MED-BUD second (400k)')
  check(r.byBudgetCode[2].budgetCode === 'SMALL-BUD', 'sort: SMALL-BUD third (100k)')
}

// 10. Tie-break alpha: same totalCeilingMmk → alphabetical budgetCode
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'ZETA-CODE', ceilingMmk: 500_000 }),
    env({ budgetCode: 'ALPHA-CODE', ceilingMmk: 500_000 }),
  ]))
  check(r.byBudgetCode[0].budgetCode === 'ALPHA-CODE', 'tie: ALPHA-CODE before ZETA-CODE')
  check(r.byBudgetCode[1].budgetCode === 'ZETA-CODE', 'tie: ZETA-CODE second')
}

// 11. Same code: totalCeilingMmk and envelopeCount accumulate
{
  const r = projectShopBudgetEnvelopeSummary(state([
    env({ budgetCode: 'BUDGET-X', ceilingMmk: 250_000, periodStart: '2026-01-01', periodEnd: '2026-03-31' }),
    env({ budgetCode: 'BUDGET-X', ceilingMmk: 350_000, periodStart: '2026-04-01', periodEnd: '2026-06-30' }),
    env({ budgetCode: 'BUDGET-X', ceilingMmk: 450_000, periodStart: '2026-07-01', periodEnd: '2026-09-30' }),
  ]))
  check(r.byBudgetCode[0].envelopeCount === 3, 'accumulate: envelopeCount 3')
  check(r.byBudgetCode[0].totalCeilingMmk === 1_050_000, 'accumulate: totalCeilingMmk 250k+350k+450k=1050k')
  check(r.byBudgetCode[0].latestPeriodEnd === '2026-09-30', 'accumulate: latestPeriodEnd 2026-09-30')
}

console.log(JSON.stringify({ ok: true, checks }))
