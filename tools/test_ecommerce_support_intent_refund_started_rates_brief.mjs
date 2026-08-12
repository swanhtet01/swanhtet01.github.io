import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceSupportIntentRefundStartedRatesBrief } from './ecommerce-support-intent-refund-started-rates-brief.ts'`,
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

const { projectEcommerceSupportIntentRefundStartedRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function supportIntent({ refundStarted = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.support_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ESI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    category: 'order_status',
    description: 'Support description',
    customerMessageSent: false,
    externalMessageSent: false,
    refundStarted,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(supportIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents,
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents: [],
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state — 5 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.refundStartedCount === 0, 'empty:refundStartedCount')
  check(r.refundStartedRate === 0, 'empty:refundStartedRate')
  check(r.notRefundStartedCount === 0, 'empty:notRefundStartedCount')
  check(r.notRefundStartedRate === 0, 'empty:notRefundStartedRate')
}

// 2. Single refund started — 3 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state([
    supportIntent({ refundStarted: true }),
  ]))
  check(r.totalIntents === 1, 'started:total')
  check(r.refundStartedCount === 1, 'started:count')
  check(r.refundStartedRate === 1, 'started:rate')
}

// 3. Single not started — 3 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state([supportIntent()]))
  check(r.totalIntents === 1, 'notStarted:total')
  check(r.notRefundStartedCount === 1, 'notStarted:count')
  check(r.notRefundStartedRate === 1, 'notStarted:rate')
}

// 4. 2 refund started — 3 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state([
    supportIntent({ refundStarted: true }),
    supportIntent({ refundStarted: true }),
  ]))
  check(r.refundStartedCount === 2, 'twoStarted:count')
  check(r.notRefundStartedCount === 0, 'twoStarted:notCount')
  check(r.refundStartedRate === 1, 'twoStarted:rate')
}

// 5. 2 not started — 2 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state([
    supportIntent(),
    supportIntent(),
  ]))
  check(r.notRefundStartedCount === 2, 'twoNotStarted:count')
  check(r.refundStartedCount === 0, 'twoNotStarted:startedCount')
}

// 6. 1 started + 1 not started — 3 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state([
    supportIntent({ refundStarted: true }),
    supportIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.refundStartedRate === 0.5, 'half:startedRate')
  check(r.notRefundStartedRate === 0.5, 'half:notStartedRate')
}

// 7. Precision: 1 started + 2 not started (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceSupportIntentRefundStartedRatesBrief(state([
    supportIntent({ refundStarted: true }),
    supportIntent(),
    supportIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.refundStartedCount === 1, 'precision:startedCount')
  check(r.refundStartedRate === 0.3333, 'precision:startedRate')
  check(r.notRefundStartedRate === 0.6667, 'precision:notStartedRate')
}

console.log(`ecommerce-support-intent-refund-started-rates-brief: ${checks} checks passed`)
