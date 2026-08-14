// Plant order lifecycle stage brief: portfolio entries classified by command presence.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantOrderLifecycleStageBrief } from './plant-order-lifecycle-stage-brief.ts'`,
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

const { projectPlantOrderLifecycleStageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'
const EXECUTION_SCHEMA = 'supermega.plant.order-state.v1'

function cmd(kind) {
  return { sequence: 1, previousDigest: 'abc', digest: 'def', payload: { kind, id: `cmd-${kind}` } }
}

function execution(...kinds) {
  return {
    schema: EXECUTION_SCHEMA,
    revision: 1,
    headDigest: 'head-abc',
    commands: kinds.map(cmd),
  }
}

function entry(jobId, ...cmdKinds) {
  return { jobId, execution: execution(...cmdKinds) }
}

function portfolio(...entries) {
  return { contract: 'supermega.production.order_portfolio.v1', entries }
}

function state(orderPortfolio) {
  return { schema: SCHEMA, revision: 1, jobs: [], issues: [], machines: [], events: [], ...(orderPortfolio ? { orderPortfolio } : {}) }
}

// 1. No portfolio → all zeros
{
  const r = projectPlantOrderLifecycleStageBrief(state())
  check(r.totalEntries === 0, 'no-portfolio: totalEntries 0')
  check(r.unplanned === 0, 'no-portfolio: unplanned 0')
  check(r.withQualityRework === 0, 'no-portfolio: withQualityRework 0')
}

// 2. Empty portfolio entries
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio()))
  check(r.totalEntries === 0, 'empty-portfolio: totalEntries 0')
}

// 3. Unplanned — no import_plan command
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1')
  )))
  check(r.totalEntries === 1, 'unplanned: totalEntries 1')
  check(r.unplanned === 1, 'unplanned: unplanned 1')
  check(r.planned === 0, 'unplanned: planned 0')
}

// 4. Planned — has import_plan only
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1', 'import_plan')
  )))
  check(r.planned === 1, 'planned: planned 1')
  check(r.released === 0, 'planned: released 0')
}

// 5. Released — has release_order but no record_output
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1', 'import_plan', 'release_order')
  )))
  check(r.released === 1, 'released: released 1')
  check(r.inProcess === 0, 'released: inProcess 0')
}

// 6. In-process — has record_output
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1', 'import_plan', 'release_order', 'record_output')
  )))
  check(r.inProcess === 1, 'in-process: inProcess 1')
  check(r.inspectionDone === 0, 'in-process: inspectionDone 0')
}

// 7. Inspection done — has inspect_output
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1', 'import_plan', 'release_order', 'record_output', 'inspect_output')
  )))
  check(r.inspectionDone === 1, 'inspection: inspectionDone 1')
  check(r.releasedToStock === 0, 'inspection: releasedToStock 0')
}

// 8. Released to stock — has release_batch
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1', 'import_plan', 'release_order', 'record_output', 'inspect_output', 'release_batch')
  )))
  check(r.releasedToStock === 1, 'released-to-stock: releasedToStock 1')
}

// 9. Quality rework and substitution are independent flags
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1', 'import_plan', 'record_quality_rework', 'approve_material_substitution'),
  )))
  check(r.withQualityRework === 1, 'flags: withQualityRework 1')
  check(r.withSubstitution === 1, 'flags: withSubstitution 1')
  check(r.planned === 1, 'flags: planned 1 (has import_plan, no release_order)')
}

// 10. Mixed portfolio
{
  const r = projectPlantOrderLifecycleStageBrief(state(portfolio(
    entry('JOB-1'),
    entry('JOB-2', 'import_plan'),
    entry('JOB-3', 'import_plan', 'release_order', 'record_output'),
    entry('JOB-4', 'import_plan', 'release_order', 'record_output', 'inspect_output', 'release_batch'),
  )))
  check(r.totalEntries === 4, 'mixed: totalEntries 4')
  check(r.unplanned === 1, 'mixed: unplanned 1')
  check(r.planned === 1, 'mixed: planned 1')
  check(r.inProcess === 1, 'mixed: inProcess 1')
  check(r.releasedToStock === 1, 'mixed: releasedToStock 1')
  check(r.withQualityRework === 0, 'mixed: withQualityRework 0')
}

console.log(JSON.stringify({ ok: true, checks }))
