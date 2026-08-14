// Contract guard for the Plant industry packs -- the manufacturing equivalent of the Shop
// business templates, and the same first-minute path: pick your industry, get a working
// set of production jobs.
//
// core/product-onboarding-runtime.ts provisions these by rendering the pack to CSV and
// pushing it through createClientImportPreview as 'production', throwing if any row comes
// back less than 'ready'. Nothing tested that, and unlike the Shop templates these CSVs
// carry DATES that are materialized at provisioning time, so they can rot: a sample whose
// due dates are computed wrongly produces jobs that are overdue the moment they appear.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { plantIndustryPacks, plantIndustryPack } from './plant-industry-packs.ts'
      export { clientImportTemplate, createClientImportPreview } from './client-onboarding.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/plant-packs-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { plantIndustryPacks, plantIndustryPack, clientImportTemplate, createClientImportPreview } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

check(plantIndustryPacks.length >= 5, `the shipped Plant packs are present, got ${plantIndustryPacks.length}`)
check(
  new Set(plantIndustryPacks.map((pack) => pack.id)).size === plantIndustryPacks.length,
  'Plant pack ids are unique, so selecting one cannot be ambiguous',
)

// Provisioning is deliberately run the way product-onboarding-runtime.ts runs it: with NO
// planningDate, so the sample due dates are generated relative to today. That matters,
// because createClientImportPreview validates due dates against the real current date in
// Asia/Yangon and rejects anything not in the future. Pinning an explicit past planning
// date makes the sample fail -- which is a property of the sample, not a bug, and is why
// the drift check further down compares rendered text rather than importing it.
const TODAY = new Date().toISOString().slice(0, 10)

for (const pack of plantIndustryPacks) {
  const where = `Plant pack "${pack.id}"`

  check(Boolean(pack.name?.trim()), `${where} has a name`)
  check(Boolean(pack.firstWorkflow?.trim()), `${where} states its first workflow, which is what the operator is told to do`)
  check(pack.capabilities.length > 0, `${where} lists at least one capability`)
  check(plantIndustryPack(pack.id) === pack, `${where} is retrievable by its own id`)

  // The setup block is what names the material and work centre the sample creates.
  check(Boolean(pack.setup?.materialId?.trim()), `${where} names a material id`)
  check(Boolean(pack.setup?.materialName?.trim()), `${where} names a material`)
  check(Boolean(pack.setup?.workCentreName?.trim()), `${where} names a work centre`)

  // --- the real provisioning path ---------------------------------------------
  const csv = clientImportTemplate('production', undefined, { plantIndustryPackId: pack.id })
  check(typeof csv === 'string' && csv.length > 0, `${where} renders a non-empty sample CSV`)

  const preview = await createClientImportPreview(csv, 'production', undefined, `sample-${pack.id}.csv`)
  const notReady = preview.rows.filter((row) => row.status !== 'ready')
  check(
    preview.readyForStaging,
    `${where} sample is ready for staging (issues: ${JSON.stringify(preview.fileIssues ?? []).slice(0, 200)})`,
  )
  check(
    notReady.length === 0,
    `${where} has every sample row importable, ${notReady.length} were not (${notReady.slice(0, 2).map((row) => JSON.stringify(row.issues ?? row.status)).join('; ').slice(0, 220)})`,
  )
  check(preview.rows.length > 0, `${where} sample contains at least one production job`)

  const jobCodes = preview.rows.map((row) => row.values.jobCode)
  check(new Set(jobCodes).size === jobCodes.length, `${where} sample job codes are unique`)

  for (const row of preview.rows) {
    const what = `${where} job ${row.values.jobCode}`
    check(Boolean(row.values.line?.trim()), `${what} names a production line`)
    check(Boolean(row.values.productName?.trim()), `${what} names a product`)
    const target = Number(row.values.targetQuantity)
    check(Number.isFinite(target) && target > 0, `${what} has a positive target quantity, got ${row.values.targetQuantity}`)

    // A working sample whose jobs are already overdue teaches the operator on day one
    // that the schedule is noise -- and the importer rejects past due dates outright, so
    // an offset that drifts too small stops the whole sample from provisioning.
    const due = Date.parse(row.values.dueDate)
    check(Number.isFinite(due), `${what} has a parseable due date, got ${row.values.dueDate}`)
    check(
      due > Date.parse(TODAY),
      `${what} is dated ahead of today when provisioned (due ${row.values.dueDate} vs today ${TODAY})`,
    )
  }
}

// The date materialization must actually track the planning date rather than being fixed,
// or every workspace provisioned next year still shows 2026 due dates.
const early = clientImportTemplate('production', undefined, { plantIndustryPackId: plantIndustryPacks[0].id, planningDate: '2026-07-23' })
const later = clientImportTemplate('production', undefined, { plantIndustryPackId: plantIndustryPacks[0].id, planningDate: '2027-01-15' })
check(early !== later, 'the sample due dates move with the planning date rather than being frozen')

console.log(`plant industry packs: ${checks} checks passed across ${plantIndustryPacks.length} packs`)
