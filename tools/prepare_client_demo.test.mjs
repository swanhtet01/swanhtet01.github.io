import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CLIENT_DEMO_PREPARATION_CONTRACT,
  clientDemoPreparationSummary,
  prepareClientDemo,
  verifyClientDemoPreparation,
  writeClientDemoPreparation,
} from './prepare_client_demo.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = resolve(ROOT, 'tools', 'prepare_client_demo.mjs')
const PREPARED_AT = '2026-07-29T04:00:00.000Z'

function pythonExecutable() {
  const local = process.platform === 'win32'
    ? resolve(ROOT, '.venv', 'Scripts', 'python.exe')
    : resolve(ROOT, '.venv', 'bin', 'python')
  return existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3'
}

function validateSelected(packages) {
  const result = spawnSync(pythonExecutable(), [resolve(ROOT, 'tools', 'validate_client_launch_packages.py')], {
    cwd: ROOT,
    encoding: 'utf8',
    input: JSON.stringify({ contract: 'supermega.client_demo_preparation_validation.v1', packages }),
    maxBuffer: 6 * 1024 * 1024,
    windowsHide: true,
  })
  return { status: result.status, response: JSON.parse(result.stdout || '{}') }
}

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'supermega-client-prepare-'))
  const model = await import(`${pathToFileURL(resolve(ROOT, 'showroom', 'src', 'core', 'client-onboarding.ts')).href}?preparation-test=${Date.now()}`)
  const preset = model.clientDemoPresets.find((candidate) => candidate.id === 'manufacturing')
  assert.ok(preset)
  const blueprint = model.buildClientDemoBlueprint({
    workspace: 'Confidential client workspace',
    owner: 'Founder reviewer',
    presetId: preset.id,
    shopIndustryPackId: preset.shopIndustryPackId,
    plantIndustryPackId: preset.plantIndustryPackId,
    selections: preset.selections,
  })
  const kit = model.buildClientDemoKit(blueprint, '2026-07-29T03:00:00.000Z')
  const kitPath = resolve(directory, 'setup-kit.json')
  await writeFile(kitPath, JSON.stringify(kit), 'utf8')
  return { directory, model, blueprint, kit, kitPath }
}

test('client preparation compiles one validated four-product founder-review artifact without writes or model work', async () => {
  const source = await fixture()
  try {
    const artifact = await prepareClientDemo({ kitPath: source.kitPath, preparedAt: PREPARED_AT })
    assert.equal(artifact.contract, CLIENT_DEMO_PREPARATION_CONTRACT)
    assert.deepEqual(artifact.products.map((product) => product.product), ['commerce', 'production', 'website', 'ecommerce'])
    assert.equal(artifact.products.every((product) => product.sourceMode === 'kit_sample_fixture'), true)
    assert.equal(artifact.products.every((product) => product.stagingPackage.controls.activationStatus === 'staged_not_applied'), true)
    assert.equal(artifact.products.every((product) => product.packageDigest.startsWith('sha256:')), true)
    assert.deepEqual(artifact.foundation, {
      schema: 'supermega.client_operating_foundation.v1',
      organization: { displayName: 'Confidential client workspace', verification: 'client_review_required' },
      operatingUnit: { code: 'MAIN', name: 'Main operating unit', kind: 'plant' },
      localization: { countryCode: 'MM', currency: 'MMK', locale: 'my-MM', timeZone: 'Asia/Yangon' },
      controls: { sharedAcrossProducts: true, clientReviewRequired: true, externalRegistryChecked: false, managedIdentityRequiredBeforeActivation: true },
    })
    assert.deepEqual(artifact.checks, {
      ecommerceCatalogAligned: true,
      websiteHomePresent: true,
      plantLinesPresent: true,
      oneWorkspaceAndOwner: true,
    })
    assert.deepEqual(artifact.controls, {
      localArtifactOnly: true,
      containsNormalizedClientData: false,
      containsSampleFixtures: true,
      safeToShareExternally: false,
      humanReviewRequired: true,
      externalWritesPerformed: false,
      hostedWritesPerformed: false,
      connectorCallsPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    })
    assert.equal(artifact.review.status, 'awaiting_founder_review')
    assert.equal(artifact.review.confirmation, `APPROVE CLIENT DEMO ${artifact.bundleDigest}`)
    assert.equal(artifact.review.checklist.length, 5)
    assert.deepEqual(verifyClientDemoPreparation(artifact), {
      ok: true,
      contract: CLIENT_DEMO_PREPARATION_CONTRACT,
      bundleDigest: artifact.bundleDigest,
      productCount: 4,
      clientDataFiles: 0,
      sampleFixtures: 4,
      status: 'verified_not_applied',
      humanReviewRequired: true,
    })
    const tampered = structuredClone(artifact)
    tampered.products[0].stagingPackage.rows[0].values.name = 'Changed after review'
    assert.throws(() => verifyClientDemoPreparation(tampered), /client_demo_product_validation_drift|client_demo_bundle_digest_invalid/)
    const foundationTamper = structuredClone(artifact)
    foundationTamper.foundation.localization.currency = 'USD'
    assert.throws(() => verifyClientDemoPreparation(foundationTamper), /client_demo_preparation_contract_invalid/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('legacy v1 setup kits migrate to the canonical shared operating foundation', async () => {
  const source = await fixture()
  try {
    const legacy = structuredClone(source.kit)
    legacy.schema = 'supermega.client_demo_kit.v1'
    legacy.blueprint.schema = 'supermega.client_demo_blueprint.v1'
    delete legacy.blueprint.foundation
    const legacyPath = resolve(source.directory, 'legacy-kit.json')
    await writeFile(legacyPath, JSON.stringify(legacy), 'utf8')

    const artifact = await prepareClientDemo({ kitPath: legacyPath, preparedAt: PREPARED_AT })

    assert.equal(artifact.kit.schema, 'supermega.client_demo_kit.v2')
    assert.equal(artifact.foundation.organization.displayName, source.blueprint.client.workspace)
    assert.equal(artifact.foundation.operatingUnit.kind, 'plant')
    assert.deepEqual(verifyClientDemoPreparation(artifact).status, 'verified_not_applied')
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('exact client CSVs are normalized locally while missing products remain explicit sample fixtures', async () => {
  const source = await fixture()
  try {
    const dataDirectory = resolve(source.directory, 'client-data')
    await mkdir(dataDirectory)
    const commerce = source.blueprint.products.find((product) => product.product === 'commerce')
    assert.ok(commerce)
    await writeFile(resolve(dataDirectory, 'commerce.csv'), commerce.sampleCsv, 'utf8')
    const artifact = await prepareClientDemo({ kitPath: source.kitPath, dataDirectory, preparedAt: PREPARED_AT })
    assert.equal(artifact.products.find((product) => product.product === 'commerce')?.sourceMode, 'client_csv')
    assert.equal(artifact.products.filter((product) => product.sourceMode === 'kit_sample_fixture').length, 3)
    assert.equal(artifact.controls.containsNormalizedClientData, true)
    assert.equal(artifact.controls.safeToShareExternally, false)
    const summary = clientDemoPreparationSummary(artifact, resolve(source.directory, 'prepared.json'))
    const renderedSummary = JSON.stringify(summary)
    assert.equal(summary.clientDataFiles, 1)
    assert.equal(summary.sampleFixtures, 3)
    assert.doesNotMatch(renderedSummary, /Confidential client workspace|Founder reviewer|RICE-25KG/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('invalid or oversized client data and tampered data-bearing kits fail before an artifact is written', async () => {
  const source = await fixture()
  try {
    const dataDirectory = resolve(source.directory, 'client-data')
    await mkdir(dataDirectory)
    const commerce = source.blueprint.products.find((product) => product.product === 'commerce')
    assert.ok(commerce)
    await writeFile(resolve(dataDirectory, 'commerce.csv'), commerce.sampleCsv.replace(',18,', ',-1,'), 'utf8')
    await assert.rejects(
      prepareClientDemo({ kitPath: source.kitPath, dataDirectory, preparedAt: PREPARED_AT }),
      /client_demo_source_not_ready_commerce/,
    )
    await writeFile(resolve(dataDirectory, 'commerce.csv'), 'x'.repeat((512 * 1024) + 1), 'utf8')
    await assert.rejects(
      prepareClientDemo({ kitPath: source.kitPath, dataDirectory, preparedAt: PREPARED_AT }),
      /client_data_commerce_invalid/,
    )
    const tamperedKitPath = resolve(source.directory, 'tampered-kit.json')
    await writeFile(tamperedKitPath, JSON.stringify({ ...source.kit, controls: { ...source.kit.controls, clientRecordsIncluded: true } }), 'utf8')
    await assert.rejects(prepareClientDemo({ kitPath: tamperedKitPath, preparedAt: PREPARED_AT }), /client_demo_kit_contract_invalid/)
    await assert.rejects(stat(resolve(source.directory, 'prepared.json')))
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('output is exclusive and CLI stdout remains metadata-only', async () => {
  const source = await fixture()
  try {
    const artifact = await prepareClientDemo({ kitPath: source.kitPath, preparedAt: PREPARED_AT })
    const outputPath = resolve(source.directory, 'prepared.json')
    assert.equal(await writeClientDemoPreparation(artifact, outputPath), outputPath)
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).bundleDigest, artifact.bundleDigest)
    await assert.rejects(writeClientDemoPreparation(artifact, outputPath), /client_demo_output_exists/)

    const cliOutput = resolve(source.directory, 'prepared-cli.json')
    const cli = spawnSync(process.execPath, [TOOL, '--kit', source.kitPath, '--out', cliOutput], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(cli.status, 0, cli.stderr)
    const summary = JSON.parse(cli.stdout)
    assert.equal(summary.ok, true)
    assert.equal(summary.productCount, 4)
    assert.equal(summary.activationStatus, 'not_applied')
    assert.doesNotMatch(cli.stdout, /Confidential client workspace|Founder reviewer|RICE-25KG/)
    assert.equal(JSON.parse(await readFile(cliOutput, 'utf8')).controls.safeToShareExternally, false)

    const verifyCli = spawnSync(process.execPath, [TOOL, '--verify', cliOutput], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(verifyCli.status, 0, verifyCli.stderr)
    assert.equal(JSON.parse(verifyCli.stdout).status, 'verified_not_applied')
    assert.doesNotMatch(verifyCli.stdout, /Confidential client workspace|Founder reviewer|RICE-25KG/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('selected-package server validation rejects duplicate order and split client authority', async () => {
  const source = await fixture()
  try {
    const artifact = await prepareClientDemo({ kitPath: source.kitPath, preparedAt: PREPARED_AT })
    const packages = artifact.products.map((product) => product.stagingPackage)
    const valid = validateSelected(packages)
    assert.equal(valid.status, 0)
    assert.equal(valid.response.selected_product_coverage_complete, true)
    assert.equal(valid.response.profile_coverage_complete, false)
    assert.equal(valid.response.external_writes_performed, false)

    const duplicate = validateSelected([packages[0], packages[0]])
    assert.notEqual(duplicate.status, 0)
    assert.match(duplicate.response.error, /unique products in canonical order/)
    assert.equal(duplicate.response.external_writes_performed, false)

    const splitAuthority = validateSelected([packages[0], { ...packages[1], owner: 'Different owner' }])
    assert.notEqual(splitAuthority.status, 0)
    assert.match(splitAuthority.response.error, /one workspace and responsible owner/)
    assert.equal(JSON.stringify(splitAuthority.response).includes('RICE-25KG'), false)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})
