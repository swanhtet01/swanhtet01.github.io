// Plant OEE summary: efficiency projection from ProductionState jobs.
// Tests quality rate, job progress, overdue detection, line breakdown.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantOeeSummary } from './plant-oee-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/oee-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantOeeSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const AS_OF = '2026-08-11T12:00:00.000Z'

function makeProduction(jobs = []) {
  return { schema: 'supermega.production.workspace.v2', revision: 1, jobs, issues: [], machines: [], events: [] }
}

function makeJob(id, line, target, output, extra = {}) {
  return { id, line, product: 'Widget', target, output, ...extra }
}

function makeClosure(closedAt = '2026-08-10T10:00:00.000Z') {
  return { actionId: 'ACT-001', closedAt, closedBy: 'operator', reason: 'done', evidenceReference: 'E-001', shiftRef: 'SH-001', remainingUnits: 0 }
}

function makeHold(heldAt = '2026-08-10T09:00:00.000Z') {
  return { actionId: 'ACT-002', heldAt, heldBy: 'supervisor', reason: 'defect', evidenceReference: 'E-002' }
}

// 1. Empty state → all zeros
{
  const r = projectPlantOeeSummary(makeProduction(), AS_OF)
  check(r.totalJobs === 0, 'totalJobs is 0 for empty state')
  check(r.closedJobs === 0, 'closedJobs is 0 for empty state')
  check(r.openJobs === 0, 'openJobs is 0 for empty state')
  check(r.onHoldJobs === 0, 'onHoldJobs is 0 for empty state')
  check(r.overdueJobs === 0, 'overdueJobs is 0 for empty state')
  check(r.qualityRate === 0, 'qualityRate is 0 for empty state')
  check(r.avgJobProgress === 0, 'avgJobProgress is 0 for empty state')
  check(Object.keys(r.byLine).length === 0, 'byLine is empty for empty state')
}

// 2. Open job with zero output → progress 0%
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 0)]), AS_OF)
  check(r.openJobs === 1, 'open job counted correctly')
  check(r.avgJobProgress === 0, 'zero output → 0% progress')
}

// 3. Open job progress calculation
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 50)]), AS_OF)
  check(r.avgJobProgress === 50, 'progress = output/target * 100')
}

// 4. Progress capped at 100% when output exceeds target
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 120)]), AS_OF)
  check(r.avgJobProgress === 100, 'progress capped at 100%')
}

// 5. Closed job classified correctly
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 100, { closure: makeClosure() })]), AS_OF)
  check(r.closedJobs === 1, 'closed job counted in closedJobs')
  check(r.openJobs === 0, 'closed job not in openJobs')
  check(r.onHoldJobs === 0, 'closed job not in onHoldJobs')
}

// 6. Closed job: good output = output - scrap
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 100, { scrap: 5, closure: makeClosure() })]), AS_OF)
  check(r.totalGoodOutput === 95, 'good output = output - scrap')
  check(r.totalScrap === 5, 'scrap tracked separately')
}

// 7. Quality rate = good output / target * 100 for closed jobs
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 200, 200, { scrap: 20, closure: makeClosure() })]), AS_OF)
  check(r.qualityRate === 90, 'qualityRate = (200-20)/200 * 100 = 90%')
}

// 8. qualityRate = 0 when no closed jobs (totalTarget = 0)
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 50)]), AS_OF)
  check(r.qualityRate === 0, 'qualityRate = 0 when no closed jobs')
}

// 9. scrap undefined treated as zero
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 100, { closure: makeClosure() })]), AS_OF)
  check(r.totalScrap === 0, 'undefined scrap treated as 0')
  check(r.totalGoodOutput === 100, 'good output = output when no scrap')
  check(r.qualityRate === 100, 'qualityRate = 100% when no scrap')
}

// 10. On-hold job classification
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 60, { qualityHold: makeHold() })]), AS_OF)
  check(r.onHoldJobs === 1, 'job with qualityHold counted in onHoldJobs')
  check(r.openJobs === 0, 'on-hold job not in openJobs')
  check(r.closedJobs === 0, 'on-hold job not in closedJobs')
}

// 11. Overdue detection: open job with dueAt before asOf
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 40, { dueAt: '2026-08-10T08:00:00.000Z' })]), AS_OF)
  check(r.overdueJobs === 1, 'open job past dueAt is overdue')
}

// 12. Not overdue if dueAt is after asOf
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 40, { dueAt: '2026-08-12T08:00:00.000Z' })]), AS_OF)
  check(r.overdueJobs === 0, 'future dueAt not overdue')
}

// 13. Not overdue if job is closed even with past dueAt
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 100, { dueAt: '2026-08-01T08:00:00.000Z', closure: makeClosure() })]), AS_OF)
  check(r.overdueJobs === 0, 'closed job not overdue even with past dueAt')
}

// 14. Not overdue if no dueAt
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 40)]), AS_OF)
  check(r.overdueJobs === 0, 'no dueAt → not overdue')
}

// 15. On-hold job with past dueAt is overdue
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 60, { dueAt: '2026-08-09T08:00:00.000Z', qualityHold: makeHold() })]), AS_OF)
  check(r.overdueJobs === 1, 'on-hold job with past dueAt is overdue')
}

// 16. byLine aggregation
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 50),
    makeJob('J-002', 'Line A', 200, 200, { scrap: 10, closure: makeClosure() }),
  ]), AS_OF)
  check(r.byLine['Line A']?.total === 2, 'byLine total = 2 for Line A')
  check(r.byLine['Line A']?.closed === 1, 'byLine closed = 1 for Line A')
  check(r.byLine['Line A']?.target === 200, 'byLine target = 200 (closed jobs only)')
  check(r.byLine['Line A']?.scrap === 10, 'byLine scrap = 10 (closed jobs only)')
}

// 17. Multiple lines tracked separately
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 50),
    makeJob('J-002', 'Line B', 200, 100),
  ]), AS_OF)
  check(r.byLine['Line A']?.total === 1, 'Line A tracked separately')
  check(r.byLine['Line B']?.total === 1, 'Line B tracked separately')
  check(Object.keys(r.byLine).length === 2, '2 lines in byLine')
}

// 18. avgJobProgress averages across all jobs
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 50),   // 50%
    makeJob('J-002', 'Line A', 100, 100),   // 100%
  ]), AS_OF)
  check(r.avgJobProgress === 75, 'avgJobProgress = mean of 50% and 100%')
}

// 19. totalTarget only sums closed jobs
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 50),                         // open
    makeJob('J-002', 'Line A', 200, 200, { closure: makeClosure() }),  // closed
  ]), AS_OF)
  check(r.totalTarget === 200, 'totalTarget excludes open jobs')
}

// 20. Multiple closed jobs sum correctly
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 90, { scrap: 10, closure: makeClosure() }),
    makeJob('J-002', 'Line B', 200, 180, { scrap: 20, closure: makeClosure() }),
  ]), AS_OF)
  check(r.totalTarget === 300, 'totalTarget sums both closed jobs')
  check(r.totalScrap === 30, 'totalScrap sums both closed jobs')
  check(r.totalGoodOutput === 240, 'totalGoodOutput = (90-10) + (180-20) = 240')
  check(r.qualityRate === 80, 'qualityRate = 240/300 = 80%')
}

// 21. asOf carried through to result
{
  const r = projectPlantOeeSummary(makeProduction(), AS_OF)
  check(r.asOf === AS_OF, 'asOf passed through to result')
}

// 22. byLine onHold count
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 60, { qualityHold: makeHold() }),
  ]), AS_OF)
  check(r.byLine['Line A']?.onHold === 1, 'byLine onHold count correct')
}

// 23. Job that hits its full target with no formal closure counts as closed, not open
// (closeProductionJob() rejects remainingUnits < 1, so a job that hits target exactly
// can never receive a .closure — it must still count as finished for OEE to be meaningful)
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 100)]), AS_OF)
  check(r.closedJobs === 1, 'on-target job with no closure counted in closedJobs')
  check(r.openJobs === 0, 'on-target job with no closure not left in openJobs')
  check(r.totalTarget === 100, 'on-target job with no closure contributes to totalTarget')
  check(r.qualityRate === 100, 'on-target job with no closure yields correct qualityRate')
}

// 24. Job that exceeds target with no formal closure counts as closed
{
  const r = projectPlantOeeSummary(makeProduction([makeJob('J-001', 'Line A', 100, 100, { scrap: 5 })]), AS_OF)
  check(r.closedJobs === 1, 'over-target job (output+scrap>=target) with no closure counted as closed')
  check(r.totalGoodOutput === 95, 'good output = output - scrap for the on-target unclosed job')
}

// 25. On-target job with no closure and a past dueAt is not overdue
{
  const r = projectPlantOeeSummary(makeProduction([
    makeJob('J-001', 'Line A', 100, 100, { dueAt: '2026-08-01T08:00:00.000Z' }),
  ]), AS_OF)
  check(r.overdueJobs === 0, 'on-target job with no closure is not overdue despite past dueAt')
}

console.log(`plant OEE summary: ${checks} checks passed`)
