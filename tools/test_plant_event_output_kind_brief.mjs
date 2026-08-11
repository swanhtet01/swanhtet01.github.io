// Plant event output kind brief: outputKind distribution ('good'|'scrap') on output_recorded events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventOutputKindBrief } from './plant-event-output-kind-brief.ts'`,
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

const { projectPlantEventOutputKindBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function outputEvent(outputKind) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Output recorded.',
    evidenceReference: 'EVD-1',
    kind: 'output_recorded',
    subjectId: 'JOB-1',
    summary: 'Recorded output.',
    quantity: 10,
    shiftRef: 'SHIFT-1',
  }
  if (outputKind !== undefined) obj.outputKind = outputKind
  return obj
}

function nonOutputEvent() {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Job started.',
    evidenceReference: 'EVD-1',
    kind: 'job_started',
    subjectId: 'JOB-1',
    summary: 'Job started.',
  }
}

function state(events) {
  return { schema: SCHEMA, jobs: [], issues: [], events, closes: [] }
}

// 1. No events → all zeros
{
  const r = projectPlantEventOutputKindBrief(state([]))
  check(r.totalOutputEvents === 0, 'empty: totalOutputEvents 0')
  check(r.goodOutputEvents === 0, 'empty: goodOutputEvents 0')
  check(r.scrapOutputEvents === 0, 'empty: scrapOutputEvents 0')
  check(r.goodOutputRate === 0, 'empty: goodOutputRate 0')
}

// 2. Events with no outputKind → skipped
{
  const r = projectPlantEventOutputKindBrief(state([nonOutputEvent(), nonOutputEvent()]))
  check(r.totalOutputEvents === 0, 'no-outputKind: totalOutputEvents 0')
}

// 3. Single good event
{
  const r = projectPlantEventOutputKindBrief(state([outputEvent('good')]))
  check(r.totalOutputEvents === 1, 'single-good: totalOutputEvents 1')
  check(r.goodOutputEvents === 1, 'single-good: goodOutputEvents 1')
  check(r.scrapOutputEvents === 0, 'single-good: scrapOutputEvents 0')
  check(r.goodOutputRate === 100, 'single-good: goodOutputRate 100')
}

// 4. Single scrap event
{
  const r = projectPlantEventOutputKindBrief(state([outputEvent('scrap')]))
  check(r.totalOutputEvents === 1, 'single-scrap: totalOutputEvents 1')
  check(r.goodOutputEvents === 0, 'single-scrap: goodOutputEvents 0')
  check(r.scrapOutputEvents === 1, 'single-scrap: scrapOutputEvents 1')
  check(r.goodOutputRate === 0, 'single-scrap: goodOutputRate 0')
}

// 5. Mixed good and scrap events
{
  const r = projectPlantEventOutputKindBrief(
    state([outputEvent('good'), outputEvent('good'), outputEvent('good'), outputEvent('scrap')]),
  )
  check(r.totalOutputEvents === 4, 'mixed: totalOutputEvents 4')
  check(r.goodOutputEvents === 3, 'mixed: goodOutputEvents 3')
  check(r.scrapOutputEvents === 1, 'mixed: scrapOutputEvents 1')
  check(r.goodOutputRate === 75, 'mixed: goodOutputRate 75')
}

// 6. Non-output events interspersed are ignored
{
  const r = projectPlantEventOutputKindBrief(
    state([nonOutputEvent(), outputEvent('good'), nonOutputEvent(), outputEvent('scrap')]),
  )
  check(r.totalOutputEvents === 2, 'mixed-types: totalOutputEvents 2')
  check(r.goodOutputRate === 50, 'mixed-types: goodOutputRate 50')
}

// 7. outputKind undefined (treated as no outputKind → skipped)
{
  const r = projectPlantEventOutputKindBrief(state([outputEvent(undefined)]))
  check(r.totalOutputEvents === 0, 'undefined-kind: totalOutputEvents 0')
}

console.log(JSON.stringify({ ok: true, checks }))
