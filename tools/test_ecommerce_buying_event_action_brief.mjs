// Ecommerce buying event action brief: 8-value enum distribution + exception rate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceBuyingEventActionBrief } from './ecommerce-buying-event-action-brief.ts'`,
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

const { projectEcommerceBuyingEventActionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function buyingEvent(action = 'request_recorded') {
  seq++
  return {
    schema: 'supermega.ecommerce.buying_event.v1',
    sequence: seq,
    action,
    subjectId: `S-${seq}`,
    idempotencyKey: `ik-ev-${seq}`,
    payloadDigest: `pd-${seq}`,
    previousDigest: `prev-${seq}`,
    eventDigest: `ed-${seq}`,
  }
}

function state(events) {
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
    rescheduleIntents: [],
    events,
  }
}

// 1. Empty state
{
  const r = projectEcommerceBuyingEventActionBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.requestRecordedCount === 0, 'empty: requestRecordedCount 0')
  check(r.requestRecordedRate === 0, 'empty: requestRecordedRate 0')
  check(r.exceptionEventRate === 0, 'empty: exceptionEventRate 0')
}

// 2. Single request_recorded
{
  const r = projectEcommerceBuyingEventActionBrief(state([buyingEvent('request_recorded')]))
  check(r.totalEvents === 1, 'single-req: totalEvents 1')
  check(r.requestRecordedCount === 1, 'single-req: requestRecordedCount 1')
  check(r.requestRecordedRate === 100, 'single-req: requestRecordedRate 100')
  check(r.exceptionEventRate === 0, 'single-req: exceptionEventRate 0')
}

// 3. All request_recorded (3 events)
{
  const r = projectEcommerceBuyingEventActionBrief(
    state([buyingEvent('request_recorded'), buyingEvent('request_recorded'), buyingEvent('request_recorded')]),
  )
  check(r.requestRecordedCount === 3, 'all-req: requestRecordedCount 3')
  check(r.requestRecordedRate === 100, 'all-req: requestRecordedRate 100')
  check(r.exceptionEventRate === 0, 'all-req: exceptionEventRate 0')
}

// 4. All exception types (one of each of the 7 exception actions)
{
  const r = projectEcommerceBuyingEventActionBrief(
    state([
      buyingEvent('return_intent_recorded'),
      buyingEvent('support_intent_recorded'),
      buyingEvent('correction_intent_recorded'),
      buyingEvent('cancellation_intent_recorded'),
      buyingEvent('cancellation_decision_recorded'),
      buyingEvent('order_amendment_intent_recorded'),
      buyingEvent('order_reschedule_intent_recorded'),
    ]),
  )
  check(r.totalEvents === 7, 'all-exc: totalEvents 7')
  check(r.requestRecordedCount === 0, 'all-exc: requestRecordedCount 0')
  check(r.requestRecordedRate === 0, 'all-exc: requestRecordedRate 0')
  check(r.exceptionEventRate === 100, 'all-exc: exceptionEventRate 100')
  check(r.returnIntentRecordedCount === 1, 'all-exc: return 1')
  check(r.supportIntentRecordedCount === 1, 'all-exc: support 1')
  check(r.correctionIntentRecordedCount === 1, 'all-exc: correction 1')
  check(r.cancellationIntentRecordedCount === 1, 'all-exc: cancellation 1')
  check(r.cancellationDecisionRecordedCount === 1, 'all-exc: cancellDecision 1')
  check(r.orderAmendmentIntentRecordedCount === 1, 'all-exc: amendment 1')
  check(r.orderRescheduleIntentRecordedCount === 1, 'all-exc: reschedule 1')
}

// 5. Mixed: 2 requests + 1 exception → requestRecordedRate 67%, exceptionEventRate 33%
{
  const r = projectEcommerceBuyingEventActionBrief(
    state([
      buyingEvent('request_recorded'),
      buyingEvent('request_recorded'),
      buyingEvent('cancellation_intent_recorded'),
    ]),
  )
  check(r.requestRecordedRate === 67, 'mixed: requestRecordedRate 67')
  check(r.exceptionEventRate === 33, 'mixed: exceptionEventRate 33')
}

// 6. 1 request + 3 exceptions → requestRecordedRate 25%, exceptionEventRate 75%
{
  const r = projectEcommerceBuyingEventActionBrief(
    state([
      buyingEvent('request_recorded'),
      buyingEvent('return_intent_recorded'),
      buyingEvent('support_intent_recorded'),
      buyingEvent('cancellation_intent_recorded'),
    ]),
  )
  check(r.requestRecordedRate === 25, 'skewed: requestRecordedRate 25')
  check(r.exceptionEventRate === 75, 'skewed: exceptionEventRate 75')
}

// 7. All 8 action types (1 each) — totals correct
{
  const r = projectEcommerceBuyingEventActionBrief(
    state([
      buyingEvent('request_recorded'),
      buyingEvent('return_intent_recorded'),
      buyingEvent('support_intent_recorded'),
      buyingEvent('correction_intent_recorded'),
      buyingEvent('cancellation_intent_recorded'),
      buyingEvent('cancellation_decision_recorded'),
      buyingEvent('order_amendment_intent_recorded'),
      buyingEvent('order_reschedule_intent_recorded'),
    ]),
  )
  check(r.totalEvents === 8, 'all-8: totalEvents 8')
  check(r.requestRecordedRate === 13, 'all-8: requestRecordedRate 13')
  check(r.exceptionEventRate === 88, 'all-8: exceptionEventRate 88')
}

console.log(JSON.stringify({ ok: true, checks }))
