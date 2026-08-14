// Plant order portfolio summary: loaded, totalEntries, uniqueJobIds,
// totalCommands, averageCommandsPerEntry.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantOrderPortfolioSummary } from './plant-order-portfolio-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/order-portfolio-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantOrderPortfolioSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.plant.order_foundation.v1'
const CONTRACT = 'supermega.production.order_portfolio.v1'

function cmd(sequence) {
  return {
    sequence,
    previousDigest: 'digest',
    payload: { kind: 'import_plan' },
    digest: `digest-${sequence}`,
  }
}

function execution(commandCount = 0) {
  return {
    schema: SCHEMA,
    revision: commandCount,
    headDigest: 'digest',
    commands: Array.from({ length: commandCount }, (_, i) => cmd(i + 1)),
  }
}

function entry(jobId, commandCount = 0) {
  return { jobId, execution: execution(commandCount) }
}

function portfolio(entries = []) {
  return { contract: CONTRACT, entries }
}

function state(orderPortfolio = undefined) {
  return {
    schema: 'supermega.production.v1',
    revision: 1,
    jobs: [], issues: [], machines: [], events: [],
    ...(orderPortfolio !== undefined ? { orderPortfolio } : {}),
  }
}

// 1. No orderPortfolio → all defaults, loaded false
{
  const r = projectPlantOrderPortfolioSummary(state())
  check(r.loaded === false, 'none: loaded false')
  check(r.totalEntries === 0, 'none: totalEntries 0')
  check(r.uniqueJobIds === 0, 'none: uniqueJobIds 0')
  check(r.totalCommands === 0, 'none: totalCommands 0')
  check(r.averageCommandsPerEntry === 0, 'none: averageCommandsPerEntry 0')
}

// 2. Empty entries → loaded true, zeros
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([])))
  check(r.loaded === true, 'empty: loaded true')
  check(r.totalEntries === 0, 'empty: totalEntries 0')
  check(r.averageCommandsPerEntry === 0, 'empty: averageCommandsPerEntry 0')
}

// 3. Single entry, 3 commands
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('JOB-1', 3),
  ])))
  check(r.totalEntries === 1, 'single: totalEntries 1')
  check(r.uniqueJobIds === 1, 'single: uniqueJobIds 1')
  check(r.totalCommands === 3, 'single: totalCommands 3')
  check(r.averageCommandsPerEntry === 3, 'single: averageCommandsPerEntry 3')
}

// 4. Two entries different jobIds
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('JOB-A', 2),
    entry('JOB-B', 4),
  ])))
  check(r.totalEntries === 2, 'two: totalEntries 2')
  check(r.uniqueJobIds === 2, 'two: uniqueJobIds 2')
  check(r.totalCommands === 6, 'two: totalCommands 2+4=6')
}

// 5. averageCommandsPerEntry rounds: (3+4)/2 = 3.5 → 4
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('JOB-X', 3),
    entry('JOB-Y', 4),
  ])))
  check(r.averageCommandsPerEntry === 4, 'avg-round: Math.round(3.5)=4')
}

// 6. uniqueJobIds dedup: same jobId appears twice → 1
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('JOB-SAME', 1),
    entry('JOB-SAME', 2),
  ])))
  check(r.uniqueJobIds === 1, 'dedup: uniqueJobIds 1')
  check(r.totalEntries === 2, 'dedup: totalEntries still 2')
}

// 7. Entry with 0 commands: contributes to totalEntries but not totalCommands
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('JOB-Z', 0),
  ])))
  check(r.totalEntries === 1, 'zero-cmds: totalEntries 1')
  check(r.totalCommands === 0, 'zero-cmds: totalCommands 0')
  check(r.averageCommandsPerEntry === 0, 'zero-cmds: averageCommandsPerEntry 0')
}

// 8. Mixed: 2 commands + 0 commands → totalCommands 2, average Math.round(1)=1
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('JOB-A', 2),
    entry('JOB-B', 0),
  ])))
  check(r.totalCommands === 2, 'mixed: totalCommands 2')
  check(r.averageCommandsPerEntry === 1, 'mixed: averageCommandsPerEntry Math.round(1)=1')
}

// 9. Three distinct jobIds
{
  const r = projectPlantOrderPortfolioSummary(state(portfolio([
    entry('J1', 1),
    entry('J2', 1),
    entry('J3', 1),
  ])))
  check(r.uniqueJobIds === 3, 'three: uniqueJobIds 3')
  check(r.totalEntries === 3, 'three: totalEntries 3')
}

console.log(JSON.stringify({ ok: true, checks }))
