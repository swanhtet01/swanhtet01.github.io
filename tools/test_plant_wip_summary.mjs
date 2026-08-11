// Plant WIP summary: open job count, target/output/scrap progress, overdueJobCount,
// onHoldCount, byPriority. Tests open vs closed, progress, overdue, hold, priority bucketing.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantWipSummary } from './plant-wip-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/wip-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantWipSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ASOF = '2026-08-11'
const CLOSURE = { actionId: 'a1', capturedAt: '2026-08-10T20:00:00Z', actor: 'op1', reason: 'done', evidenceReference: 'e1', shiftRef: 's1', remainingUnits: 0, closedBy: 'op1', closedAt: '2026-08-10T20:00:00Z' }

let seq = 0
function job({ target = 100, output = 0, scrap = undefined, priority = undefined, dueAt = undefined, qualityHold = undefined, closed = false } = {}) {
  seq += 1
  return {
    id: `job-${seq}`,
    line: 'Line1',
    product: `Product-${seq}`,
    target,
    output,
    ...(scrap !== undefined ? { scrap } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(qualityHold !== undefined ? { qualityHold } : {}),
    ...(closed ? { closure: CLOSURE } : {}),
  }
}

function hold() {
  return { actionId: 'qh1', capturedAt: '2026-08-11T08:00:00Z', actor: 'qc1', reason: 'defect', evidenceReference: 'e1' }
}

function state(jobs = []) {
  return { jobs, events: [], issues: [], machines: [] }
}

// 1. Empty state → all zeros
{
  const r = projectPlantWipSummary(state(), ASOF)
  check(r.openJobCount === 0, 'empty: openJobCount is 0')
  check(r.totalTargetUnits === 0, 'empty: totalTargetUnits is 0')
  check(r.completionRate === 0, 'empty: completionRate is 0 (no zero-division)')
  check(r.overdueJobCount === 0, 'empty: overdueJobCount is 0')
  check(r.onHoldCount === 0, 'empty: onHoldCount is 0')
}

// 2. Closed jobs excluded from WIP
{
  const r = projectPlantWipSummary(state([job({ target: 200, output: 200, closed: true })]), ASOF)
  check(r.openJobCount === 0, 'closed: closed job excluded from openJobCount')
  check(r.totalTargetUnits === 0, 'closed: closed job excluded from target')
  check(r.totalOutputSoFar === 0, 'closed: closed job excluded from output')
}

// 3. Single open job
{
  const r = projectPlantWipSummary(state([job({ target: 100, output: 40 })]), ASOF)
  check(r.openJobCount === 1, 'single: openJobCount is 1')
  check(r.totalTargetUnits === 100, 'single: totalTargetUnits is 100')
  check(r.totalOutputSoFar === 40, 'single: totalOutputSoFar is 40')
  check(r.completionRate === 40, 'single: completionRate is 40%')
}

// 4. Scrap included in scrapSoFar but not in completionRate numerator
{
  const r = projectPlantWipSummary(state([job({ target: 100, output: 50, scrap: 10 })]), ASOF)
  check(r.totalScrapSoFar === 10, 'scrap: scrapSoFar is 10')
  // completionRate based on output not scrap
  check(r.completionRate === 50, 'scrap: completionRate uses output only')
}

// 5. Undefined scrap treated as 0
{
  const r = projectPlantWipSummary(state([job({ target: 100, output: 20 })]), ASOF)
  check(r.totalScrapSoFar === 0, 'no-scrap: totalScrapSoFar is 0')
}

// 6. Multiple jobs — targets and outputs accumulate
{
  const jobs = [
    job({ target: 50, output: 25 }),
    job({ target: 100, output: 80 }),
    job({ target: 200, output: 0 }),
  ]
  const r = projectPlantWipSummary(state(jobs), ASOF)
  check(r.openJobCount === 3, 'multi: openJobCount is 3')
  check(r.totalTargetUnits === 350, 'multi: totalTargetUnits is 350')
  check(r.totalOutputSoFar === 105, 'multi: totalOutputSoFar is 105')
  // round(105/350 * 100) = round(30) = 30
  check(r.completionRate === 30, 'multi: completionRate is 30')
}

// 7. Overdue: dueAt before today (asOf = 2026-08-11)
{
  const r = projectPlantWipSummary(state([
    job({ dueAt: '2026-08-10' }),  // overdue
    job({ dueAt: '2026-08-11' }),  // due today, not overdue
    job({ dueAt: '2026-08-12' }),  // future
    job(),                          // no dueAt
  ]), ASOF)
  check(r.overdueJobCount === 1, 'overdue: only past-due counted')
}

// 8. Quality hold: onHoldCount
{
  const r = projectPlantWipSummary(state([
    job({ qualityHold: hold() }),
    job({ qualityHold: hold() }),
    job(),
  ]), ASOF)
  check(r.onHoldCount === 2, 'hold: onHoldCount is 2')
}

// 9. byPriority bucketing
{
  const jobs = [
    job({ priority: 'urgent' }),
    job({ priority: 'urgent' }),
    job({ priority: 'normal' }),
    job({ priority: 'low' }),
    job(),  // no priority → unspecified
  ]
  const r = projectPlantWipSummary(state(jobs), ASOF)
  check(r.byPriority.urgent === 2, 'priority: urgent is 2')
  check(r.byPriority.normal === 1, 'priority: normal is 1')
  check(r.byPriority.low === 1, 'priority: low is 1')
  check(r.byPriority.unspecified === 1, 'priority: unspecified is 1')
}

// 10. Mix of open and closed
{
  const jobs = [
    job({ target: 100, output: 50 }),          // open
    job({ target: 200, output: 200, closed: true }),  // closed
    job({ target: 150, output: 75 }),          // open
  ]
  const r = projectPlantWipSummary(state(jobs), ASOF)
  check(r.openJobCount === 2, 'mix: 2 open jobs')
  check(r.totalTargetUnits === 250, 'mix: only open job targets counted')
  check(r.totalOutputSoFar === 125, 'mix: only open job output counted')
}

console.log(JSON.stringify({ ok: true, checks }))
