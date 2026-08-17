// Ecommerce buying event summary: totalEvents, byAction (8 kinds), uniqueSubjects, latestSequence.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceBuyingEventSummary } from './ecommerce-buying-event-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/buying-event-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceBuyingEventSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.ecommerce.buying_event.v1'
let seq = 0

function event({ action = 'request_recorded', subjectId = 'sub-1', sequence = undefined } = {}) {
  seq++
  return {
    schema: SCHEMA,
    sequence: sequence ?? seq,
    action,
    subjectId,
    idempotencyKey: `idem-${seq}`,
    payloadDigest: 'digest',
    previousDigest: 'digest',
    eventDigest: 'digest',
  }
}

function state(events = []) {
  return {
    schema: 'supermega.ecommerce.buying_state.v1',
    scope: 'test',
    revision: 1,
    headDigest: 'digest',
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

// 1. Empty events → all zeros, latestSequence null
{
  const r = projectEcommerceBuyingEventSummary(state())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.byAction.request_recorded === 0, 'empty: request_recorded 0')
  check(r.byAction.return_intent_recorded === 0, 'empty: return_intent_recorded 0')
  check(r.byAction.support_intent_recorded === 0, 'empty: support_intent_recorded 0')
  check(r.byAction.correction_intent_recorded === 0, 'empty: correction_intent_recorded 0')
  check(r.byAction.cancellation_intent_recorded === 0, 'empty: cancellation_intent_recorded 0')
  check(r.byAction.cancellation_decision_recorded === 0, 'empty: cancellation_decision_recorded 0')
  check(r.byAction.order_amendment_intent_recorded === 0, 'empty: order_amendment_intent_recorded 0')
  check(r.byAction.order_reschedule_intent_recorded === 0, 'empty: order_reschedule_intent_recorded 0')
  check(r.uniqueSubjects === 0, 'empty: uniqueSubjects 0')
  check(r.latestSequence === null, 'empty: latestSequence null')
}

// 2. Single request_recorded
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'request_recorded', subjectId: 'req-1', sequence: 1 }),
  ]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.byAction.request_recorded === 1, 'single: request_recorded 1')
  check(r.uniqueSubjects === 1, 'single: uniqueSubjects 1')
  check(r.latestSequence === 1, 'single: latestSequence 1')
}

// 3. Each action kind increments its own counter
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'return_intent_recorded' }),
  ]))
  check(r.byAction.return_intent_recorded === 1, 'action: return_intent_recorded 1')
}
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'support_intent_recorded' }),
  ]))
  check(r.byAction.support_intent_recorded === 1, 'action: support_intent_recorded 1')
}
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'correction_intent_recorded' }),
  ]))
  check(r.byAction.correction_intent_recorded === 1, 'action: correction_intent_recorded 1')
}
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'cancellation_intent_recorded' }),
  ]))
  check(r.byAction.cancellation_intent_recorded === 1, 'action: cancellation_intent_recorded 1')
}
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'cancellation_decision_recorded' }),
  ]))
  check(r.byAction.cancellation_decision_recorded === 1, 'action: cancellation_decision_recorded 1')
}
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'order_amendment_intent_recorded' }),
  ]))
  check(r.byAction.order_amendment_intent_recorded === 1, 'action: order_amendment_intent_recorded 1')
}
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'order_reschedule_intent_recorded' }),
  ]))
  check(r.byAction.order_reschedule_intent_recorded === 1, 'action: order_reschedule_intent_recorded 1')
}

// 4. latestSequence picks max (not last inserted)
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ sequence: 1 }),
    event({ sequence: 5 }),
    event({ sequence: 3 }),
  ]))
  check(r.latestSequence === 5, 'seq-max: latestSequence 5 (not 3)')
}

// 5. uniqueSubjects dedup: same subjectId → 1
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ subjectId: 'req-A' }),
    event({ subjectId: 'req-A' }),
  ]))
  check(r.uniqueSubjects === 1, 'dedup-sub: uniqueSubjects 1')
  check(r.totalEvents === 2, 'dedup-sub: totalEvents 2')
}

// 6. uniqueSubjects: 2 distinct subjects → 2
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ subjectId: 'req-X' }),
    event({ subjectId: 'req-Y' }),
  ]))
  check(r.uniqueSubjects === 2, 'dist-sub: uniqueSubjects 2')
}

// 7. Mixed action kinds accumulate independently
{
  const r = projectEcommerceBuyingEventSummary(state([
    event({ action: 'request_recorded' }),
    event({ action: 'request_recorded' }),
    event({ action: 'support_intent_recorded' }),
  ]))
  check(r.byAction.request_recorded === 2, 'mixed: request_recorded 2')
  check(r.byAction.support_intent_recorded === 1, 'mixed: support_intent_recorded 1')
  check(r.byAction.return_intent_recorded === 0, 'mixed: return_intent_recorded stays 0')
}

console.log(JSON.stringify({ ok: true, checks }))
