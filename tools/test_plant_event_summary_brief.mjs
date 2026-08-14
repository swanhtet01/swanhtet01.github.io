// Plant event summary brief: ProductionEvent.summary text stats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventSummaryBrief } from './plant-event-summary-brief.ts'`,
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

const { projectPlantEventSummaryBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0

function event(summary) {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-12T09:00:00Z',
    actor: 'operator-1',
    reason: 'Routine.',
    evidenceReference: 'EVD-1',
    kind: 'job_started',
    subjectId: 'JOB-1',
    summary,
  }
}

function state(events = []) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues: [], machines: [], events }
}

// 1. Empty events
{
  const r = projectPlantEventSummaryBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.uniqueSummaries === 0, 'empty: uniqueSummaries 0')
  check(r.averageSummaryLength === 0, 'empty: averageSummaryLength 0')
}

// 2. Single event
{
  const r = projectPlantEventSummaryBrief(state([event('Job started.')]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.uniqueSummaries === 1, 'single: uniqueSummaries 1')
  check(r.averageSummaryLength === 12, 'single: averageSummaryLength 12')
}

// 3. Two events, same summary → uniqueSummaries stays 1
{
  const r = projectPlantEventSummaryBrief(state([event('Job started.'), event('Job started.')]))
  check(r.totalEvents === 2, 'same-summary: totalEvents 2')
  check(r.uniqueSummaries === 1, 'same-summary: uniqueSummaries 1')
  check(r.averageSummaryLength === 12, 'same-summary: averageSummaryLength 12')
}

// 4. Two events, distinct summaries
{
  const r = projectPlantEventSummaryBrief(state([event('Short.'), event('A much longer summary text.')]))
  check(r.totalEvents === 2, 'distinct: totalEvents 2')
  check(r.uniqueSummaries === 2, 'distinct: uniqueSummaries 2')
}

// 5. Rounding: 3 events with lengths 5, 5, 6 = 16/3 = 5.33 → 5
{
  const r = projectPlantEventSummaryBrief(state([
    event('Hello'),    // 5
    event('World'),    // 5
    event('Done!.'),   // 6
  ]))
  check(r.totalEvents === 3, 'rounding: totalEvents 3')
  check(r.averageSummaryLength === 5, 'rounding: averageSummaryLength 5')
}

// 6. Many events, all unique
{
  const summaries = ['Alpha.', 'Beta.', 'Gamma.', 'Delta.', 'Epsilon.']
  const r = projectPlantEventSummaryBrief(state(summaries.map(s => event(s))))
  check(r.totalEvents === 5, 'many-unique: totalEvents 5')
  check(r.uniqueSummaries === 5, 'many-unique: uniqueSummaries 5')
}

console.log(JSON.stringify({ ok: true, checks }))
