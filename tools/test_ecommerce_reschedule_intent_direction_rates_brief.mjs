import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRescheduleIntentDirectionRatesBrief } from './ecommerce-reschedule-intent-direction-rates-brief.ts'`,
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

const { projectEcommerceRescheduleIntentDirectionRatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ORIGINAL = '2026-08-05T10:00:00Z'
const FORWARD = '2026-08-03T10:00:00Z'
const PUSHED_BACK = '2026-08-07T10:00:00Z'

let intentId = 0
function rescheduleIntent({ requestedPromisedAt = PUSHED_BACK } = {}) {
  intentId++
  return {
    schema: 'supermega.ecommerce.reschedule_intent.v1',
    state: 'pending_shop_review',
    scope: 'scope-1',
    id: `ERI-${intentId}`,
    idempotencyKey: `ik-${intentId}`,
    createdAt: '2026-08-01T09:00:00Z',
    orderId: `ORD-${intentId}`,
    sourceRequestId: `REQ-${intentId}`,
    sourceAcknowledgementDigest: `sad-${intentId}`,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
    fulfilment: 'delivery',
    originalPromisedAt: ORIGINAL,
    requestedPromisedAt,
    reason: 'Reschedule reason',
    customerMessageSent: false,
    replacementRequestId: null,
    originalTotalMmk: 10000,
    evidenceReference: `ev-${intentId}`,
  }
}

function state(rescheduleIntents = []) {
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
    amendmentIntents: [],
    rescheduleIntents,
    events: [],
  }
}

// 1. Empty state — 5 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state())
  check(r.totalIntents === 0, 'empty:totalIntents')
  check(r.forwardCount === 0, 'empty:forwardCount')
  check(r.forwardRate === 0, 'empty:forwardRate')
  check(r.pushedBackCount === 0, 'empty:pushedBackCount')
  check(r.pushedBackRate === 0, 'empty:pushedBackRate')
}

// 2. Single forward — 3 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state([
    rescheduleIntent({ requestedPromisedAt: FORWARD }),
  ]))
  check(r.totalIntents === 1, 'forward:total')
  check(r.forwardCount === 1, 'forward:count')
  check(r.forwardRate === 1, 'forward:rate')
}

// 3. Single pushed back — 3 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state([rescheduleIntent()]))
  check(r.totalIntents === 1, 'pushedBack:total')
  check(r.pushedBackCount === 1, 'pushedBack:count')
  check(r.pushedBackRate === 1, 'pushedBack:rate')
}

// 4. 2 forward — 3 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state([
    rescheduleIntent({ requestedPromisedAt: FORWARD }),
    rescheduleIntent({ requestedPromisedAt: FORWARD }),
  ]))
  check(r.forwardCount === 2, 'twoForward:count')
  check(r.pushedBackCount === 0, 'twoForward:pushedBackCount')
  check(r.forwardRate === 1, 'twoForward:rate')
}

// 5. 2 pushed back — 2 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state([
    rescheduleIntent(),
    rescheduleIntent(),
  ]))
  check(r.pushedBackCount === 2, 'twoPushedBack:count')
  check(r.forwardCount === 0, 'twoPushedBack:forwardCount')
}

// 6. 1 forward + 1 pushed back — 3 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state([
    rescheduleIntent({ requestedPromisedAt: FORWARD }),
    rescheduleIntent(),
  ]))
  check(r.totalIntents === 2, 'half:total')
  check(r.forwardRate === 0.5, 'half:forwardRate')
  check(r.pushedBackRate === 0.5, 'half:pushedBackRate')
}

// 7. Precision: 1 forward + 2 pushed back (1/3 = 0.3333) — 4 checks
{
  const r = projectEcommerceRescheduleIntentDirectionRatesBrief(state([
    rescheduleIntent({ requestedPromisedAt: FORWARD }),
    rescheduleIntent(),
    rescheduleIntent(),
  ]))
  check(r.totalIntents === 3, 'precision:total')
  check(r.forwardCount === 1, 'precision:forwardCount')
  check(r.forwardRate === 0.3333, 'precision:forwardRate')
  check(r.pushedBackRate === 0.6667, 'precision:pushedBackRate')
}

console.log(`ecommerce-reschedule-intent-direction-rates-brief: ${checks} checks passed`)
