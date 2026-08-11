// Plant opening plan summary: loaded, jobCount, machineCount, hasIndustryPack,
// industryPackId, confirmedAt.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantOpeningPlanSummary } from './plant-opening-plan-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/opening-plan-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantOpeningPlanSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function plan({ jobIds = [], machineIds = [], industryPackId = undefined, confirmedAt = '2026-08-11T08:00:00.000Z' } = {}) {
  return {
    contract: 'supermega.production.opening-plan.v1',
    packageDigest: 'pkg-digest',
    confirmedAt,
    jobIds,
    machineIds,
    ...(industryPackId !== undefined ? { industryPackId } : {}),
  }
}

function state(openingPlan = undefined) {
  return {
    schema: 'supermega.production.v1',
    revision: 1,
    jobs: [], issues: [], machines: [], events: [],
    ...(openingPlan !== undefined ? { openingPlan } : {}),
  }
}

// 1. No openingPlan → all defaults
{
  const r = projectPlantOpeningPlanSummary(state())
  check(r.loaded === false, 'none: loaded false')
  check(r.jobCount === 0, 'none: jobCount 0')
  check(r.machineCount === 0, 'none: machineCount 0')
  check(r.hasIndustryPack === false, 'none: hasIndustryPack false')
  check(r.industryPackId === null, 'none: industryPackId null')
  check(r.confirmedAt === null, 'none: confirmedAt null')
}

// 2. Loaded, 3 jobs, 2 machines, no industry pack, specific confirmedAt
{
  const r = projectPlantOpeningPlanSummary(state(plan({
    jobIds: ['JOB-1', 'JOB-2', 'JOB-3'],
    machineIds: ['MACH-A', 'MACH-B'],
    confirmedAt: '2026-08-01T10:00:00.000Z',
  })))
  check(r.loaded === true, 'basic: loaded true')
  check(r.jobCount === 3, 'basic: jobCount 3')
  check(r.machineCount === 2, 'basic: machineCount 2')
  check(r.hasIndustryPack === false, 'basic: hasIndustryPack false')
  check(r.industryPackId === null, 'basic: industryPackId null')
  check(r.confirmedAt === '2026-08-01T10:00:00.000Z', 'basic: confirmedAt propagated')
}

// 3. batch-process pack
{
  const r = projectPlantOpeningPlanSummary(state(plan({ industryPackId: 'batch-process' })))
  check(r.hasIndustryPack === true, 'batch: hasIndustryPack true')
  check(r.industryPackId === 'batch-process', 'batch: industryPackId batch-process')
}

// 4. Each industry pack ID
{
  const r = projectPlantOpeningPlanSummary(state(plan({ industryPackId: 'food-beverage' })))
  check(r.industryPackId === 'food-beverage', 'pack: food-beverage')
}
{
  const r = projectPlantOpeningPlanSummary(state(plan({ industryPackId: 'general-manufacturing' })))
  check(r.industryPackId === 'general-manufacturing', 'pack: general-manufacturing')
}
{
  const r = projectPlantOpeningPlanSummary(state(plan({ industryPackId: 'apparel' })))
  check(r.industryPackId === 'apparel', 'pack: apparel')
}
{
  const r = projectPlantOpeningPlanSummary(state(plan({ industryPackId: 'assembly' })))
  check(r.industryPackId === 'assembly', 'pack: assembly')
}

// 5. Empty jobIds/machineIds with loaded plan
{
  const r = projectPlantOpeningPlanSummary(state(plan({ jobIds: [], machineIds: [] })))
  check(r.loaded === true, 'empty-lists: loaded true')
  check(r.jobCount === 0, 'empty-lists: jobCount 0')
  check(r.machineCount === 0, 'empty-lists: machineCount 0')
}

// 6. Single job and single machine
{
  const r = projectPlantOpeningPlanSummary(state(plan({ jobIds: ['JOB-X'], machineIds: ['MACH-Z'] })))
  check(r.jobCount === 1, 'single: jobCount 1')
  check(r.machineCount === 1, 'single: machineCount 1')
}

console.log(JSON.stringify({ ok: true, checks }))
