// Plant job output/scrap brief: output and scrap numeric stats across production jobs.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobOutputScrapBrief } from './plant-job-output-scrap-brief.ts'`,
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

const { projectPlantJobOutputScrapBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let jobId = 0
function job(output, scrap) {
  jobId++
  const j = {
    id: `JOB-${jobId}`,
    line: 'LINE-1',
    product: 'PROD-A',
    target: 100,
    output,
  }
  if (scrap !== undefined) j.scrap = scrap
  return j
}

function state(jobs) {
  return { schema: 'supermega.production.workspace.v2', jobs, events: [], issues: [], machines: [] }
}

// 1. No jobs → all zeros, min/max null
{
  const r = projectPlantJobOutputScrapBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.totalOutput === 0, 'empty: totalOutput 0')
  check(r.averageOutput === 0, 'empty: averageOutput 0')
  check(r.minOutput === null, 'empty: minOutput null')
  check(r.maxOutput === null, 'empty: maxOutput null')
  check(r.jobsWithScrap === 0, 'empty: jobsWithScrap 0')
  check(r.scrapRate === 0, 'empty: scrapRate 0')
  check(r.totalScrap === 0, 'empty: totalScrap 0')
  check(r.averageScrap === 0, 'empty: averageScrap 0')
}

// 2. Single job, no scrap
{
  const r = projectPlantJobOutputScrapBrief(state([job(50)]))
  check(r.totalJobs === 1, 'single-no-scrap: totalJobs 1')
  check(r.totalOutput === 50, 'single-no-scrap: totalOutput 50')
  check(r.averageOutput === 50, 'single-no-scrap: averageOutput 50')
  check(r.minOutput === 50, 'single-no-scrap: minOutput 50')
  check(r.maxOutput === 50, 'single-no-scrap: maxOutput 50')
  check(r.jobsWithScrap === 0, 'single-no-scrap: jobsWithScrap 0')
  check(r.scrapRate === 0, 'single-no-scrap: scrapRate 0')
}

// 3. Single job with scrap → scrapRate 100
{
  const r = projectPlantJobOutputScrapBrief(state([job(80, 5)]))
  check(r.totalJobs === 1, 'single-scrap: totalJobs 1')
  check(r.totalOutput === 80, 'single-scrap: totalOutput 80')
  check(r.jobsWithScrap === 1, 'single-scrap: jobsWithScrap 1')
  check(r.scrapRate === 100, 'single-scrap: scrapRate 100')
  check(r.totalScrap === 5, 'single-scrap: totalScrap 5')
  check(r.averageScrap === 5, 'single-scrap: averageScrap 5')
}

// 4. Two jobs, one with scrap → scrapRate 50
{
  const r = projectPlantJobOutputScrapBrief(state([job(100), job(90, 10)]))
  check(r.totalJobs === 2, 'two-jobs: totalJobs 2')
  check(r.totalOutput === 190, 'two-jobs: totalOutput 190')
  check(r.averageOutput === 95, 'two-jobs: averageOutput 95')
  check(r.jobsWithScrap === 1, 'two-jobs: jobsWithScrap 1')
  check(r.scrapRate === 50, 'two-jobs: scrapRate 50')
  check(r.totalScrap === 10, 'two-jobs: totalScrap 10')
  check(r.averageScrap === 10, 'two-jobs: averageScrap 10')
}

// 5. Min/max tracking across three jobs
{
  const r = projectPlantJobOutputScrapBrief(state([job(10), job(50), job(100)]))
  check(r.minOutput === 10, 'minmax: minOutput 10')
  check(r.maxOutput === 100, 'minmax: maxOutput 100')
  check(r.totalOutput === 160, 'minmax: totalOutput 160')
}

// 6. Math.round average: outputs 1+2 = 3, avg = 1.5 → 2
{
  const r = projectPlantJobOutputScrapBrief(state([job(1), job(2)]))
  check(r.averageOutput === 2, 'round: averageOutput round(1.5)=2')
}

// 7. Zero output job
{
  const r = projectPlantJobOutputScrapBrief(state([job(0)]))
  check(r.totalOutput === 0, 'zero-output: totalOutput 0')
  check(r.averageOutput === 0, 'zero-output: averageOutput 0')
  check(r.minOutput === 0, 'zero-output: minOutput 0')
  check(r.maxOutput === 0, 'zero-output: maxOutput 0')
}

// 8. All with scrap → scrapRate 100, accumulation
{
  const r = projectPlantJobOutputScrapBrief(state([job(100, 3), job(200, 7), job(150, 5)]))
  check(r.totalJobs === 3, 'all-scrap: totalJobs 3')
  check(r.jobsWithScrap === 3, 'all-scrap: jobsWithScrap 3')
  check(r.scrapRate === 100, 'all-scrap: scrapRate 100')
  check(r.totalScrap === 15, 'all-scrap: totalScrap 15')
  check(r.averageScrap === 5, 'all-scrap: averageScrap 5')
}

console.log(JSON.stringify({ ok: true, checks }))
