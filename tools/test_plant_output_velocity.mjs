// Plant output velocity: rolling 7-day and 30-day closed-job output + scrap with trend direction.
// Tests window boundaries, open-job exclusion, byDay grouping, trend logic, and date edges.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantOutputVelocity } from './plant-output-velocity.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/plant-velocity-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantOutputVelocity } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// asOf = "2026-08-11"; start7 = "2026-08-05"; start30 = "2026-07-13"
const ASOF = '2026-08-11'

function job({ date, output = 100, scrap = 0, open = false }) {
  return {
    id: `job-${date}-${output}`,
    line: 'L1',
    product: 'Widget',
    target: 200,
    output,
    scrap,
    closure: open ? undefined : { closedAt: `${date}T12:00:00Z`, closedBy: 'op1', reason: 'done', actionId: 'a1', evidenceReference: 'e1', shiftRef: 's1', remainingUnits: 0 },
  }
}

function state(jobs = []) {
  return { jobs }
}

// 1. Empty state → both windows zero, trend null, byDay empty
{
  const r = projectPlantOutputVelocity(state(), ASOF)
  check(r.last7Days.closedJobs === 0, 'empty: last7 closedJobs is 0')
  check(r.last7Days.totalOutput === 0, 'empty: last7 totalOutput is 0')
  check(r.last7Days.totalScrap === 0, 'empty: last7 totalScrap is 0')
  check(r.last30Days.closedJobs === 0, 'empty: last30 closedJobs is 0')
  check(r.velocityTrend === null, 'empty: velocityTrend is null')
  check(r.byDay.length === 0, 'empty: byDay is empty')
}

// 2. Open job (no closure) excluded even if date would be in window
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-08-11', open: true, output: 500 })]), ASOF)
  check(r.last7Days.closedJobs === 0, 'open-job: excluded from last7')
  check(r.last30Days.closedJobs === 0, 'open-job: excluded from last30')
  check(r.byDay.length === 0, 'open-job: excluded from byDay')
}

// 3. Job closed before start30 (2026-07-12) → excluded
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-07-12' })]), ASOF)
  check(r.last30Days.closedJobs === 0, 'before-window: excluded from last30')
  check(r.last7Days.closedJobs === 0, 'before-window: excluded from last7')
}

// 4. Job closed exactly at start30 (2026-07-13) → in 30-day, NOT in 7-day
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-07-13', output: 200, scrap: 10 })]), ASOF)
  check(r.last30Days.closedJobs === 1, 'start30 boundary: counted in last30')
  check(r.last30Days.totalOutput === 200, 'start30 boundary: output in last30')
  check(r.last30Days.totalScrap === 10, 'start30 boundary: scrap in last30')
  check(r.last7Days.closedJobs === 0, 'start30 boundary: excluded from last7')
  check(r.byDay.length === 1, 'start30 boundary: one byDay entry')
}

// 5. Job closed exactly at start7 (2026-08-05) → in both windows
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-08-05', output: 150 })]), ASOF)
  check(r.last7Days.closedJobs === 1, 'start7 boundary: counted in last7')
  check(r.last7Days.totalOutput === 150, 'start7 boundary: output in last7')
  check(r.last30Days.closedJobs === 1, 'start7 boundary: also in last30')
}

// 6. Job closed exactly at today (2026-08-11) → in both windows
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-08-11', output: 300 })]), ASOF)
  check(r.last7Days.closedJobs === 1, 'today: counted in last7')
  check(r.last30Days.closedJobs === 1, 'today: counted in last30')
}

// 7. Job closed after today (2026-08-12) → excluded
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-08-12' })]), ASOF)
  check(r.last30Days.closedJobs === 0, 'future job: excluded from last30')
}

// 8. Multiple jobs same day grouped in byDay
{
  const r = projectPlantOutputVelocity(
    state([
      job({ date: '2026-08-10', output: 100, scrap: 5 }),
      job({ date: '2026-08-10', output: 200, scrap: 10 }),
    ]),
    ASOF,
  )
  check(r.byDay.length === 1, 'same-day: one byDay entry')
  check(r.byDay[0].closedJobs === 2, 'same-day: closedJobs grouped')
  check(r.byDay[0].totalOutput === 300, 'same-day: output grouped')
  check(r.byDay[0].totalScrap === 15, 'same-day: scrap grouped')
}

// 9. byDay sorted ascending by date
{
  const r = projectPlantOutputVelocity(
    state([
      job({ date: '2026-08-09' }),
      job({ date: '2026-08-07' }),
      job({ date: '2026-08-11' }),
    ]),
    ASOF,
  )
  check(r.byDay.length === 3, 'sorted: three byDay entries')
  check(r.byDay[0].date === '2026-08-07', 'sorted: earliest date first')
  check(r.byDay[2].date === '2026-08-11', 'sorted: latest date last')
}

// 10. Output and scrap accumulation
{
  const r = projectPlantOutputVelocity(
    state([
      job({ date: '2026-08-09', output: 100, scrap: 5 }),
      job({ date: '2026-08-10', output: 200, scrap: 10 }),
      job({ date: '2026-08-11', output: 300, scrap: 15 }),
    ]),
    ASOF,
  )
  check(r.last7Days.totalOutput === 600, 'accumulation: last7 totalOutput correct')
  check(r.last7Days.totalScrap === 30, 'accumulation: last7 totalScrap correct')
  check(r.last7Days.closedJobs === 3, 'accumulation: last7 closedJobs correct')
}

// 11. job.output undefined → treated as 0
{
  const j = { id: 'j0', closure: { closedAt: '2026-08-11T12:00:00Z' } }
  const r = projectPlantOutputVelocity(state([j]), ASOF)
  check(r.last7Days.totalOutput === 0, 'null-output: undefined output treated as 0')
  check(r.last7Days.closedJobs === 1, 'null-output: job still counted')
}

// 12. velocityTrend accelerating: high output in last 7 days, low early in 30-day
{
  const jobs = [
    job({ date: '2026-07-13', output: 10 }),     // start30, outside 7-day
    job({ date: '2026-08-11', output: 1000 }),
    job({ date: '2026-08-11', output: 1000 }),
    job({ date: '2026-08-11', output: 1000 }),
    job({ date: '2026-08-11', output: 1000 }),
    job({ date: '2026-08-11', output: 1000 }),
  ]
  // rate7 = 5000/7 ≈ 714; rate30 = 5010/30 ≈ 167; rate7 >> rate30*1.1
  const r = projectPlantOutputVelocity(state(jobs), ASOF)
  check(r.velocityTrend === 'accelerating', 'trend: accelerating when last7 output rate >> last30 rate')
}

// 13. velocityTrend decelerating: high output early, low in last 7
{
  const jobs = [
    job({ date: '2026-07-13', output: 1000 }),
    job({ date: '2026-07-13', output: 1000 }),
    job({ date: '2026-07-13', output: 1000 }),
    job({ date: '2026-07-13', output: 1000 }),
    job({ date: '2026-07-13', output: 1000 }),
    job({ date: '2026-08-11', output: 10 }),     // in last7, low output
  ]
  // rate7 = 10/7 ≈ 1.4; rate30 = 5010/30 ≈ 167; rate7 << rate30*0.9
  const r = projectPlantOutputVelocity(state(jobs), ASOF)
  check(r.velocityTrend === 'decelerating', 'trend: decelerating when last7 output rate << last30 rate')
}

// 14. velocityTrend steady: equal daily output rate across 30-day window
{
  const jobs = []
  // 1 job per day for 30 days at output=100 → rate7=100/7, rate30=3000/30=100 → diverges
  // Need equal rates: put equal jobs in 7-day and the other 23 days proportionally
  // rate7 = 7*100/7 = 100; rate30 = 30*100/30 = 100 → steady
  for (let i = 0; i < 7; i++) {
    const d = new Date('2026-08-05T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    jobs.push(job({ date: d.toISOString().slice(0, 10), output: 100 }))
  }
  for (let i = 0; i < 23; i++) {
    const d = new Date('2026-07-13T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    jobs.push(job({ date: d.toISOString().slice(0, 10), output: 100 }))
  }
  const r = projectPlantOutputVelocity(state(jobs), ASOF)
  check(r.velocityTrend === 'steady', 'trend: steady when last7 rate equals last30 rate')
}

// 15. velocityTrend null when no closed jobs in 30-day window
{
  const r = projectPlantOutputVelocity(state([job({ date: '2026-07-12' })]), ASOF)
  check(r.velocityTrend === null, 'trend: null when no closed jobs in last30 window')
}

// 16. Mixed: closed in 7-day and 30-day, open job excluded, one before window
{
  const jobs = [
    job({ date: '2026-07-12', output: 999 }),                 // before window: excluded
    job({ date: '2026-07-20', output: 500, scrap: 20 }),      // in 30-day only
    job({ date: '2026-08-10', output: 200, scrap: 10 }),      // in both
    job({ date: '2026-08-11', open: true, output: 1000 }),    // open: excluded
  ]
  const r = projectPlantOutputVelocity(state(jobs), ASOF)
  check(r.last30Days.closedJobs === 2, 'mixed: two closed jobs in last30')
  check(r.last30Days.totalOutput === 700, 'mixed: output sums correctly')
  check(r.last30Days.totalScrap === 30, 'mixed: scrap sums correctly')
  check(r.last7Days.closedJobs === 1, 'mixed: one closed job in last7')
  check(r.last7Days.totalOutput === 200, 'mixed: last7 output correct')
  check(r.byDay.length === 2, 'mixed: two distinct days in byDay')
}

console.log(JSON.stringify({ ok: true, checks }))
