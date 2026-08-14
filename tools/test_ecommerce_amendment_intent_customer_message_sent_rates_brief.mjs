import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief } from './ecommerce-amendment-intent-customer-message-sent-rates-brief.ts'`,
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

const { projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let intentId = 0
function amendmentIntent({ customerMessageSent = false } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.order_amendment_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `EAM-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    refundStatus: 'none',
    originalTotalMmk: 15000,
    replacementRequestId: `REP-${intentId}`,
    replacementRequestDigest: `rrd-${intentId}`,
    lineChanges: [],
    fromFulfilment: 'pickup',
    toFulfilment: 'delivery',
    reason: 'Amendment reason',
    customerMessageSent,
    orderChanged: false,
    stockChanged: false,
    paymentChanged: false,
    refundStarted: false,
    providerCalled: false,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(amendmentIntents = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: 0,
    headDigest: 'hd-1',
    requests: [],
    returnIntents: [],
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents: [],
    cancellationDecisions: [],
    amendmentIntents,
    rescheduleIntents: [],
    events: [],
  }
}

// 1. Empty state — 5 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.customerMessageSentCount === 0, 'empty:customerMessageSentCount')
  check(r.customerMessageSentRate === 0, 'empty:customerMessageSentRate')
  check(r.notCustomerMessageSentCount === 0, 'empty:notCustomerMessageSentCount')
  check(r.notCustomerMessageSentRate === 0, 'empty:notCustomerMessageSentRate')
}

// 2. Single sent — 3 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state([
    amendmentIntent({ customerMessageSent: true }),
  ]))
  check(r.totalIntents === 1, 'sent:total')
  check(r.customerMessageSentCount === 1, 'sent:count')
  check(r.customerMessageSentRate === 1, 'sent:rate')
}

// 3. Single not sent — 3 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state([amendmentIntent()]))
  check(r.totalIntents === 1, 'notSent:total')
  check(r.notCustomerMessageSentCount === 1, 'notSent:count')
  check(r.notCustomerMessageSentRate === 1, 'notSent:rate')
}

// 4. 2 sent — 3 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state([
    amendmentIntent({ customerMessageSent: true }),
    amendmentIntent({ customerMessageSent: true }),
  ]))
  check(r.customerMessageSentCount === 2, 'twoSent:count')
  check(r.notCustomerMessageSentCount === 0, 'twoSent:notCount')
  check(r.customerMessageSentRate === 1, 'twoSent:rate')
}

// 5. 2 not sent — 2 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state([
    amendmentIntent(),
    amendmentIntent(),
  ]))
  check(r.notCustomerMessageSentCount === 2, 'twoNotSent:count')
  check(r.customerMessageSentCount === 0, 'twoNotSent:sentCount')
}

// 6. 1 sent + 1 not sent — 3 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state([
    amendmentIntent({ customerMessageSent: true }),
    amendmentIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.customerMessageSentRate === 0.5, 'half:sentRate')
  check(r.notCustomerMessageSentRate === 0.5, 'half:notSentRate')
}

// 7. Precision: 1 sent + 2 not sent (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceAmendmentIntentCustomerMessageSentRatesBrief(state([
    amendmentIntent({ customerMessageSent: true }),
    amendmentIntent(),
    amendmentIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.customerMessageSentCount === 1, 'precision:sentCount')
  check(r.customerMessageSentRate === 0.3333, 'precision:sentRate')
  check(r.notCustomerMessageSentRate === 0.6667, 'precision:notSentRate')
}

console.log(`ecommerce-amendment-intent-customer-message-sent-rates-brief: ${checks} checks passed`)
