// Guard: every Plant industry pack must be able to plan a batch.
//
// The pack is what a manufacturer picks during Plant setup, and its `setup` block pre-fills the
// controlled batch execution form -- output batch id, material, unit, work centre. If those
// defaults do not satisfy the execution contract, that industry cannot start a batch at all.
//
// Four of the five shipped packs could not. plant-order-foundation.ts validates outputBatchId
// with identifier(..., 'BATCH') in FOUR places -- the execution plan, recording output,
// inspection, and batch release -- and the packs declared LOT, FOOD-LOT, STYLE and BUILD. Only
// general-manufacturing, whose prefix happens to be BATCH, could plan anything. Same shape as
// the Shop inventory bound: the product ships five options and the one the developer used is
// the one that works.
//
// The industry wording is kept as a second segment (BATCH-STYLE-001), which reads as well as
// STYLE-001 and actually validates.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { plantIndustryPacks, plantIndustryPackSetup } from './plant-industry-packs.ts'
      export { clientImportTemplate } from './client-onboarding.ts'
      export { buildPlantOrderEffectivePlan } from './plant-order-foundation.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/plant-pack-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { plantIndustryPacks, plantIndustryPackSetup, buildPlantOrderEffectivePlan, clientImportTemplate } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SOURCE_DIGEST = `sha256:${'a'.repeat(64)}`
// This was a fixed { id: 'JOB-001' } fed to all five packs, so it proved only that ONE hand-written
// job code plans. It hid that four of the five SHIPPED pack samples seed codes the plan contract
// rejects outright -- BATCH-001, FOOD-001, STYLE-001, BUILD-001 -- because plant-order-foundation.ts
// requires a JOB- prefix (identifier(..., 'JOB') at :551 and :713). A food or apparel plant could
// import its own sample and then not plan the batch its pack's headline workflow promises.
// Each pack is now planned with the job code IT actually ships.
const seededJob = (packId) => {
  const row = clientImportTemplate('production', undefined, { plantIndustryPackId: packId })
    .split(/\r?\n/)[1].split(',')
  return { id: row[0].trim(), line: row[4].trim() }
}
const seededJobCode = (packId) => seededJob(packId).id

check(plantIndustryPacks.length >= 5, `Plant ships at least five industry packs, got ${plantIndustryPacks.length}`)

const seenPrefixes = new Set()

for (const pack of plantIndustryPacks) {
  const setup = plantIndustryPackSetup(pack.id, seededJob(pack.id))

  // The screen pre-fills this exact value, so it is the one that has to validate.
  check(
    setup.outputBatchId.startsWith('BATCH-'),
    `${pack.id}: its pre-filled output batch id is a BATCH identifier, got ${setup.outputBatchId}`,
  )
  seenPrefixes.add(pack.setup.outputPrefix)

  const workCentreId = `${pack.setup.workCentrePrefix}-01`
  let plan = null
  let failure = ''
  try {
    plan = buildPlantOrderEffectivePlan({
      planId: 'PLN-1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D',
      sourceDigest: SOURCE_DIGEST,
      effectiveFrom: '2026-07-25T00:00:00.000+06:30',
      effectiveUntil: '2026-08-31T23:59:00.000+06:30',
      job: {
        jobId: seededJobCode(pack.id),
        product: 'Finished product A',
        targetQuantity: 300,
        outputBatchId: setup.outputBatchId,
      },
      materials: [{
        materialId: setup.materialId,
        name: setup.materialName,
        unit: setup.materialUnit,
        quantityPerUnitMilli: 1_000,
        standardCostPerUnitMmk: 1_000,
      }],
      workCentres: [{ workCentreId, name: setup.workCentreName }],
      routing: [{
        operationId: `OP-${workCentreId.replace(/^WC-/, '')}-10`,
        sequence: 1,
        name: setup.workCentreName,
        workCentreId,
        minutesPerUnitMilli: 1_000,
        standardCostPerMinuteMmk: 100,
      }],
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  check(plan !== null, `${pack.id}: A MANUFACTURER IN THIS INDUSTRY CAN PLAN A BATCH -- ${failure}`)
  check(plan.job.outputBatchId === setup.outputBatchId, `${pack.id}: the plan keeps the batch id the screen showed`)
  check(plan.materials.length === 1, `${pack.id}: its primary material survives into the plan`)
  check(
    plan.materials[0].unit === setup.materialUnit,
    `${pack.id}: in the unit the pack declares (${setup.materialUnit})`,
  )
  check(plan.routing.length === 1, `${pack.id}: its primary routing operation survives`)
  check(
    plan.workCentres[0].name === setup.workCentreName,
    `${pack.id}: naming the work centre the pack declares`,
  )
}

// The packs must stay distinguishable. Collapsing them all to a bare 'BATCH' would satisfy the
// contract and pass every check above while erasing the industry identity the pack exists for.
check(
  seenPrefixes.size === plantIndustryPacks.length,
  `each pack keeps its own output prefix -- ${seenPrefixes.size} distinct across ${plantIndustryPacks.length} packs`,
)

console.log(`plant pack batch planning contract: ${checks} checks passed`)
