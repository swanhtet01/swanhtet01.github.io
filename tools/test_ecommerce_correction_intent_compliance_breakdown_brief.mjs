import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceCorrectionIntentComplianceBreakdownBrief } from './ecommerce-correction-intent-compliance-breakdown-brief.ts'`,
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

const { projectEcommerceCorrectionIntentComplianceBreakdownBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function correctionIntent({ ledgerPosted = false, taxFiled = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.correction_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ECI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceCalculationDigest: `scd-${intentId}`,
    sourceCorrectionCount: 0,
    originalBalanceMmk: 10000,
    paymentStatus: 'reconciled',
    refundStatus: 'none',
    requestedKind: 'credit',
    reasonCode: 'pricing_error',
    listedAmountMmk: 500,
    reason: 'Correction reason',
    orderChanged: false,
    paymentChanged: false,
    refundStarted: false,
    ledgerPosted,
    taxFiled,
    customerMessageSent: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(correctionIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents,
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state — 9 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.bothCompliantCount === 0, 'empty:bothCompliantCount')
  check(r.bothCompliantRate === 0, 'empty:bothCompliantRate')
  check(r.ledgerOnlyCount === 0, 'empty:ledgerOnlyCount')
  check(r.ledgerOnlyRate === 0, 'empty:ledgerOnlyRate')
  check(r.taxOnlyCount === 0, 'empty:taxOnlyCount')
  check(r.taxOnlyRate === 0, 'empty:taxOnlyRate')
  check(r.neitherCompliantCount === 0, 'empty:neitherCompliantCount')
  check(r.neitherCompliantRate === 0, 'empty:neitherCompliantRate')
}

// 2. Single both compliant (L=true, T=true) — 2 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: true }),
  ]))
  check(r.bothCompliantCount === 1, 'both:count')
  check(r.bothCompliantRate === 1, 'both:rate')
}

// 3. Single ledger only (L=true, T=false) — 2 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: false }),
  ]))
  check(r.ledgerOnlyCount === 1, 'ledgerOnly:count')
  check(r.ledgerOnlyRate === 1, 'ledgerOnly:rate')
}

// 4. Single tax only (L=false, T=true) — 2 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state([
    correctionIntent({ ledgerPosted: false, taxFiled: true }),
  ]))
  check(r.taxOnlyCount === 1, 'taxOnly:count')
  check(r.taxOnlyRate === 1, 'taxOnly:rate')
}

// 5. Single neither (L=false, T=false) — 2 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state([
    correctionIntent(),
  ]))
  check(r.neitherCompliantCount === 1, 'neither:count')
  check(r.neitherCompliantRate === 1, 'neither:rate')
}

// 6. All 4 categories, one each — 3 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: true }),
    correctionIntent({ ledgerPosted: true, taxFiled: false }),
    correctionIntent({ ledgerPosted: false, taxFiled: true }),
    correctionIntent(),
  ]))
  check(r.totalIntents === 4, 'all:total')
  check(r.bothCompliantCount === 1, 'all:bothCount')
  check(r.neitherCompliantCount === 1, 'all:neitherCount')
}

// 7. 2 neither + 1 both (1/3 = 0.3333) — 3 checks
{
  const r = projectEcommerceCorrectionIntentComplianceBreakdownBrief(state([
    correctionIntent({ ledgerPosted: true, taxFiled: true }),
    correctionIntent(),
    correctionIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.bothCompliantRate === 0.3333, 'precision:bothRate')
  check(r.neitherCompliantRate === 0.6667, 'precision:neitherRate')
}

console.log(`ecommerce-correction-intent-compliance-breakdown-brief: ${checks} checks passed`)
