import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceBuyingEventSequenceBrief } from './ecommerce-buying-event-sequence-brief.ts'`,
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

const { projectEcommerceBuyingEventSequenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function buyingEvent(sequence) {
  eventId++
  return {
    schema: 'supermega.ecommerce.buying_event.v1',
    sequence,
    action: 'request_recorded',
    subjectId: `subj-${eventId}`,
    idempotencyKey: `ik-${eventId}`,
    payloadDigest: `pd-${eventId}`,
    previousDigest: `prev-${eventId}`,
    eventDigest: `ed-${eventId}`,
  }
}

function state(events = []) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 'scope-1',
    revision: events.length,
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
  const r = projectEcommerceBuyingEventSequenceBrief(state())
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.firstSequence === null, 'empty: firstSequence null')
  check(r.lastSequence === null, 'empty: lastSequence null')
  check(r.hasGap === false, 'empty: hasGap false')
}

// 2. Single event
{
  const r = projectEcommerceBuyingEventSequenceBrief(state([buyingEvent(1)]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.firstSequence === 1, 'single: firstSequence 1')
  check(r.lastSequence === 1, 'single: lastSequence 1')
  check(r.hasGap === false, 'single: hasGap false')
}

// 3. Two consecutive events — no gap
{
  const r = projectEcommerceBuyingEventSequenceBrief(state([buyingEvent(1), buyingEvent(2)]))
  check(r.totalEvents === 2, 'consecutive: totalEvents 2')
  check(r.firstSequence === 1, 'consecutive: firstSequence 1')
  check(r.lastSequence === 2, 'consecutive: lastSequence 2')
  check(r.hasGap === false, 'consecutive: hasGap false')
}

// 4. Two events with gap: sequences 1 and 3
{
  const r = projectEcommerceBuyingEventSequenceBrief(state([buyingEvent(1), buyingEvent(3)]))
  check(r.totalEvents === 2, 'gap: totalEvents 2')
  check(r.firstSequence === 1, 'gap: firstSequence 1')
  check(r.lastSequence === 3, 'gap: lastSequence 3')
  check(r.hasGap === true, 'gap: hasGap true')
}

// 5. Three events out of order — no gap: [2, 1, 3]
{
  const r = projectEcommerceBuyingEventSequenceBrief(state([
    buyingEvent(2),
    buyingEvent(1),
    buyingEvent(3),
  ]))
  check(r.totalEvents === 3, 'unsorted: totalEvents 3')
  check(r.firstSequence === 1, 'unsorted: firstSequence 1')
  check(r.lastSequence === 3, 'unsorted: lastSequence 3')
  check(r.hasGap === false, 'unsorted: hasGap false')
}

// 6. Two events with larger gap: sequences 2 and 5
{
  const r = projectEcommerceBuyingEventSequenceBrief(state([buyingEvent(2), buyingEvent(5)]))
  check(r.totalEvents === 2, 'large-gap: totalEvents 2')
  check(r.firstSequence === 2, 'large-gap: firstSequence 2')
  check(r.hasGap === true, 'large-gap: hasGap true')
}

console.log(`ecommerce-buying-event-sequence-brief: ${checks} checks passed`)
