// Plant job line brief: production line text distribution across jobs.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobLineBrief } from './plant-job-line-brief.ts'`,
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

const { projectPlantJobLineBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let jobId = 0
function job(line) {
  jobId++
  return { id: `JOB-${jobId}`, line, product: 'PROD-A', target: 100, output: 80 }
}

function state(jobs) {
  return { schema: 'supermega.production.workspace.v2', jobs, events: [], issues: [], machines: [] }
}

// 1. No jobs → zeros
{
  const r = projectPlantJobLineBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.uniqueLines === 0, 'empty: uniqueLines 0')
  check(r.topLinesByCount.length === 0, 'empty: topLinesByCount empty')
}

// 2. Single job
{
  const r = projectPlantJobLineBrief(state([job('LINE-A')]))
  check(r.totalJobs === 1, 'single: totalJobs 1')
  check(r.uniqueLines === 1, 'single: uniqueLines 1')
  check(r.topLinesByCount[0]?.line === 'LINE-A', 'single: top line')
  check(r.topLinesByCount[0]?.count === 1, 'single: count 1')
}

// 3. Multiple jobs, same line
{
  const r = projectPlantJobLineBrief(state([job('LINE-A'), job('LINE-A'), job('LINE-B')]))
  check(r.totalJobs === 3, 'shared: totalJobs 3')
  check(r.uniqueLines === 2, 'shared: uniqueLines 2')
  check(r.topLinesByCount[0]?.line === 'LINE-A', 'shared: top line LINE-A')
  check(r.topLinesByCount[0]?.count === 2, 'shared: count 2')
}

// 4. Top-5 cap: 6 lines → capped with alphabetic tiebreak
{
  const lines = ['LINE-F', 'LINE-A', 'LINE-C', 'LINE-B', 'LINE-D', 'LINE-E']
  const r = projectPlantJobLineBrief(state(lines.map(l => job(l))))
  check(r.uniqueLines === 6, 'top5: uniqueLines 6')
  check(r.topLinesByCount.length === 5, 'top5: capped at 5')
  check(r.topLinesByCount[0]?.line === 'LINE-A', 'top5: tiebreak LINE-A first')
}

// 5. Sort by count
{
  const jobs = [job('LINE-X'), job('LINE-Y'), job('LINE-Y'), job('LINE-Y')]
  const r = projectPlantJobLineBrief(state(jobs))
  check(r.topLinesByCount[0]?.line === 'LINE-Y', 'sort: LINE-Y first')
  check(r.topLinesByCount[0]?.count === 3, 'sort: count 3')
}

console.log(JSON.stringify({ ok: true, checks }))
