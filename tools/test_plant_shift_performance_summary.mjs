// Plant shift performance summary: aggregates shift_closed events into per-shift and total stats.
// Tests event filtering, quality rate, averages, byShift sort, date filter, and edge cases.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantShiftPerformanceSummary } from './plant-shift-performance-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shift-perf-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantShiftPerformanceSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function shiftEvent({ shiftRef, closedAt, goodUnits = 100, scrapUnits = 0, outputEntryCount = 1, materialEntryCount = 0 }) {
  seq += 1
  return {
    id: `ev-${seq}`,
    actionId: `a-${seq}`,
    createdAt: closedAt,
    actor: 'op1',
    reason: 'shift complete',
    evidenceReference: `e-${seq}`,
    kind: 'shift_closed',
    subjectId: shiftRef,
    summary: 'shift closed',
    shiftRef,
    sourceRevision: seq,
    sourceDigest: 'digest',
    goodUnits,
    scrapUnits,
    outputEntryCount,
    materialEntryCount,
  }
}

function nonShiftEvent(closedAt = '2026-08-11T08:00:00Z') {
  seq += 1
  return { id: `ev-${seq}`, actionId: `a-${seq}`, createdAt: closedAt, actor: 'op1', reason: '', evidenceReference: `e-${seq}`, kind: 'job_closed', subjectId: 'j1', summary: '' }
}

function state(events = []) {
  return { jobs: [], events }
}

// 1. Empty state → all zeros
{
  const r = projectPlantShiftPerformanceSummary(state())
  check(r.totalShiftsClosed === 0, 'empty: totalShiftsClosed is 0')
  check(r.totalGoodUnits === 0, 'empty: totalGoodUnits is 0')
  check(r.totalScrapUnits === 0, 'empty: totalScrapUnits is 0')
  check(r.overallQualityRate === 0, 'empty: overallQualityRate is 0')
  check(r.averageGoodUnitsPerShift === 0, 'empty: averageGoodUnitsPerShift is 0')
  check(r.byShift.length === 0, 'empty: byShift is empty')
}

// 2. Non-shift_closed events excluded
{
  const r = projectPlantShiftPerformanceSummary(state([nonShiftEvent()]))
  check(r.totalShiftsClosed === 0, 'non-shift: excluded from totals')
  check(r.byShift.length === 0, 'non-shift: excluded from byShift')
}

// 3. Single shift with no scrap: 100% quality rate
{
  const r = projectPlantShiftPerformanceSummary(
    state([shiftEvent({ shiftRef: 'S1', closedAt: '2026-08-11T08:00:00Z', goodUnits: 200, scrapUnits: 0 })]),
  )
  check(r.totalShiftsClosed === 1, 'single-shift: totalShiftsClosed is 1')
  check(r.totalGoodUnits === 200, 'single-shift: totalGoodUnits is 200')
  check(r.totalScrapUnits === 0, 'single-shift: totalScrapUnits is 0')
  check(r.overallQualityRate === 100, 'single-shift: 100% quality rate with no scrap')
  check(r.averageGoodUnitsPerShift === 200, 'single-shift: averageGoodUnitsPerShift is 200')
}

// 4. Single shift with scrap: quality rate = round(good / (good+scrap) * 100)
{
  const r = projectPlantShiftPerformanceSummary(
    state([shiftEvent({ shiftRef: 'S2', closedAt: '2026-08-11T08:00:00Z', goodUnits: 90, scrapUnits: 10 })]),
  )
  check(r.overallQualityRate === 90, 'scrap: quality rate = 90%')
  check(r.byShift[0].qualityRate === 90, 'scrap: per-shift qualityRate is 90')
}

// 5. Per-shift record fields
{
  const r = projectPlantShiftPerformanceSummary(
    state([shiftEvent({ shiftRef: 'SHIFT-A', closedAt: '2026-08-10T20:00:00Z', goodUnits: 150, scrapUnits: 5, outputEntryCount: 3, materialEntryCount: 2 })]),
  )
  check(r.byShift[0].shiftRef === 'SHIFT-A', 'fields: shiftRef correct')
  check(r.byShift[0].closedAt === '2026-08-10T20:00:00Z', 'fields: closedAt correct')
  check(r.byShift[0].goodUnits === 150, 'fields: goodUnits correct')
  check(r.byShift[0].outputEntryCount === 3, 'fields: outputEntryCount correct')
  check(r.byShift[0].materialEntryCount === 2, 'fields: materialEntryCount correct')
}

// 6. byShift sorted descending by closedAt (most recent first)
{
  const events = [
    shiftEvent({ shiftRef: 'S-OLD', closedAt: '2026-08-09T20:00:00Z' }),
    shiftEvent({ shiftRef: 'S-NEW', closedAt: '2026-08-11T20:00:00Z' }),
    shiftEvent({ shiftRef: 'S-MID', closedAt: '2026-08-10T20:00:00Z' }),
  ]
  const r = projectPlantShiftPerformanceSummary(state(events))
  check(r.byShift[0].shiftRef === 'S-NEW', 'sort: most recent shift is first')
  check(r.byShift[2].shiftRef === 'S-OLD', 'sort: oldest shift is last')
  check(r.byShift.length === 3, 'sort: all three shifts present')
}

// 7. Totals accumulate across multiple shifts
{
  const events = [
    shiftEvent({ shiftRef: 'S1', closedAt: '2026-08-10T08:00:00Z', goodUnits: 100, scrapUnits: 10 }),
    shiftEvent({ shiftRef: 'S2', closedAt: '2026-08-10T20:00:00Z', goodUnits: 200, scrapUnits: 20 }),
    shiftEvent({ shiftRef: 'S3', closedAt: '2026-08-11T08:00:00Z', goodUnits: 300, scrapUnits: 30 }),
  ]
  const r = projectPlantShiftPerformanceSummary(state(events))
  check(r.totalShiftsClosed === 3, 'totals: three shifts closed')
  check(r.totalGoodUnits === 600, 'totals: good units sum correct')
  check(r.totalScrapUnits === 60, 'totals: scrap units sum correct')
  // qualityRate: 600 / 660 ≈ 90.9 → rounds to 91
  check(r.overallQualityRate === 91, 'totals: overallQualityRate rounded correctly')
  // averageGoodUnitsPerShift: 600 / 3 = 200
  check(r.averageGoodUnitsPerShift === 200, 'totals: averageGoodUnitsPerShift is 200')
}

// 8. Zero-division guard: all scrap, no good units
{
  const r = projectPlantShiftPerformanceSummary(
    state([shiftEvent({ shiftRef: 'S-SCRAP', closedAt: '2026-08-11T08:00:00Z', goodUnits: 0, scrapUnits: 50 })]),
  )
  check(r.overallQualityRate === 0, 'zero-good: quality rate is 0 not NaN')
  check(r.byShift[0].qualityRate === 0, 'zero-good: per-shift qualityRate is 0')
  check(r.averageGoodUnitsPerShift === 0, 'zero-good: average is 0 with no good units')
}

// 9. Date filter: include only shifts matching prefix
{
  const events = [
    shiftEvent({ shiftRef: 'AUG10-A', closedAt: '2026-08-10T08:00:00Z', goodUnits: 100 }),
    shiftEvent({ shiftRef: 'AUG10-B', closedAt: '2026-08-10T20:00:00Z', goodUnits: 150 }),
    shiftEvent({ shiftRef: 'AUG11-A', closedAt: '2026-08-11T08:00:00Z', goodUnits: 200 }),
  ]
  const r = projectPlantShiftPerformanceSummary(state(events), '2026-08-10')
  check(r.totalShiftsClosed === 2, 'date-filter: only Aug 10 shifts counted')
  check(r.totalGoodUnits === 250, 'date-filter: Aug 10 good units correct')
  check(r.byShift.length === 2, 'date-filter: byShift has 2 entries')
}

// 10. Mixed events: shift_closed + other kinds
{
  const events = [
    shiftEvent({ shiftRef: 'S1', closedAt: '2026-08-11T08:00:00Z', goodUnits: 100 }),
    nonShiftEvent('2026-08-11T09:00:00Z'),
    nonShiftEvent('2026-08-11T10:00:00Z'),
    shiftEvent({ shiftRef: 'S2', closedAt: '2026-08-11T20:00:00Z', goodUnits: 200 }),
  ]
  const r = projectPlantShiftPerformanceSummary(state(events))
  check(r.totalShiftsClosed === 2, 'mixed: only shift_closed events counted')
  check(r.totalGoodUnits === 300, 'mixed: good units from shift events only')
}

console.log(JSON.stringify({ ok: true, checks }))
