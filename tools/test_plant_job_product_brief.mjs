// Plant job product brief: product text distribution across production jobs.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantJobProductBrief } from './plant-job-product-brief.ts'`,
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

const { projectPlantJobProductBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let jobId = 0
function job(product) {
  jobId++
  return { id: `JOB-${jobId}`, line: 'LINE-1', product, target: 100, output: 80 }
}

function state(jobs) {
  return { schema: 'supermega.production.workspace.v2', jobs, events: [], issues: [], machines: [] }
}

// 1. No jobs → zeros
{
  const r = projectPlantJobProductBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.uniqueProducts === 0, 'empty: uniqueProducts 0')
  check(r.topProductsByCount.length === 0, 'empty: topProductsByCount empty')
}

// 2. Single job
{
  const r = projectPlantJobProductBrief(state([job('Widget A')]))
  check(r.totalJobs === 1, 'single: totalJobs 1')
  check(r.uniqueProducts === 1, 'single: uniqueProducts 1')
  check(r.topProductsByCount[0]?.product === 'Widget A', 'single: top product')
  check(r.topProductsByCount[0]?.count === 1, 'single: count 1')
}

// 3. Multiple jobs, same product
{
  const r = projectPlantJobProductBrief(state([job('Widget A'), job('Widget A'), job('Widget B')]))
  check(r.totalJobs === 3, 'shared: totalJobs 3')
  check(r.uniqueProducts === 2, 'shared: uniqueProducts 2')
  check(r.topProductsByCount[0]?.product === 'Widget A', 'shared: top product Widget A')
  check(r.topProductsByCount[0]?.count === 2, 'shared: count 2')
  check(r.topProductsByCount[1]?.product === 'Widget B', 'shared: second product Widget B')
}

// 4. Top-5 cap: 6 products → capped with alphabetic tiebreak
{
  const products = ['Prod F', 'Prod A', 'Prod C', 'Prod B', 'Prod D', 'Prod E']
  const r = projectPlantJobProductBrief(state(products.map(p => job(p))))
  check(r.uniqueProducts === 6, 'top5: uniqueProducts 6')
  check(r.topProductsByCount.length === 5, 'top5: capped at 5')
  check(r.topProductsByCount[0]?.product === 'Prod A', 'top5: tiebreak Prod A first')
}

// 5. Sort by count
{
  const jobs = [job('Prod X'), job('Prod Y'), job('Prod Y'), job('Prod Y')]
  const r = projectPlantJobProductBrief(state(jobs))
  check(r.topProductsByCount[0]?.product === 'Prod Y', 'sort: Prod Y first')
  check(r.topProductsByCount[0]?.count === 3, 'sort: count 3')
}

console.log(JSON.stringify({ ok: true, checks }))
