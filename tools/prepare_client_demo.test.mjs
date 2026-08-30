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
  CLIENT_DEMO_REHEARSAL_OBSERVATIONS_CONTRACT,
  CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT,
  CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT,
  CLIENT_CONTACT_INTAKE_CONTRACT,
  CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT,
  CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT,
  CLIENT_INTAKE_WORKSPACE_CONTRACT,
  buildClientContactIntake,
  buildShopPilotClientIntake,
  buildClientDemoRehearsalPlan,
  buildClientDemoRehearsalResult,
  clientDemoPreparationSummary,
  initializeClientWorkspace,
  initializeClientWorkspaceFromContact,
  initializeClientWorkspaceFromShopPilot,
  prepareClientDemo,
  verifyClientContactIntake,
  verifyContactClientWorkspace,
  verifyClientDemoPreparation,
  verifyClientDemoRehearsalPlan,
  verifyClientDemoRehearsalResult,
  writeClientDemoPreparation,
  writeClientDemoRehearsalPlan,
  writeClientDemoRehearsalResult,
} from './prepare_client_demo.mjs'

function readySpaOwnerInput(overrides = {}) {
  return {
    tenantLabel: 'private-spa-workspace',
    startDate: '2026-08-24',
    reviewDate: '2026-08-28',
    fixedPilotFeeUsd: 500,
    contactIsNamedOperator: true,
    contactBaselineReviewed: true,
    spaBaseline: {
      clientImportRowCount: 120,
      weeklyPackageSales: 14,
      weeklyTreatmentRedemptions: 31,
      medianMinutesPerRedemption: 4,
      weeklyPackageCorrectionCount: 2,
    },
    isolatedNonProductionTenantApproved: true,
    namedOperatorAuthorized: true,
    pilotDataHandlingApproved: true,
    ownerReviewedCommercialDraft: true,
    ...overrides,
  }
}

function spaContactEvent() {
  return {
    event: 'supermega.contact.created',
    record: {
      lead_id: 'SPA-202608220001-DEADBEEF',
      workflow: 'commerce',
      company: 'Example Wellness Studio',
      name: 'Example Operator',
      email: 'operator@example.invalid',
      goal: 'Make package sales and treatment redemption reliable.',
      raw: { shop: { operator_role: 'Spa manager', weekly_orders: 45, median_minutes_per_order: 8, weekly_exception_count: 3, close_minutes_per_day: 25, contact_is_operator: true } },
    },
  }
}

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

function contactEvent(workflow = 'commerce') {
  return {
    event: 'supermega.contact.created',
    record: {
      lead_id: 'LEAD-ABCDEF1234567890',
      workflow,
      company: 'Original Company Legal Name',
      name: 'Private Requester Name',
      email: 'private.requester@example.com',
      goal: 'Reduce the time needed to review and close the first operating job.',
      requested_package: workflow === 'commerce' ? 'retail-wholesale' : '',
      submitted_at: '2026-08-03T08:00:00.000Z',
      raw: { private_note: 'must not enter the client workspace' },
    },
  }
}

function contactReview({ products = ['shop'], presetId = 'retail-network', overrides = {} } = {}) {
  return {
    contract: CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT,
    leadId: 'LEAD-ABCDEF1234567890',
    workspace: 'Reviewed client workspace',
    implementationOwner: 'Implementation owner',
    presetId,
    products,
    companyReviewed: true,
    goalReviewed: true,
    privateWorkspaceApproved: true,
    reviewedAt: '2026-08-03T09:00:00.000Z',
    ...overrides,
  }
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
    assert.deepEqual(artifact.topology, {
      schema: 'supermega.client_operational_topology.v1',
      locations: [{ id: 'LOC-MAIN', code: 'MAIN', name: 'Main operating unit', kind: 'plant', timeZone: 'Asia/Yangon', active: true }],
      channels: [
        { id: 'shop-counter', label: 'Counter and assisted orders', kind: 'assisted-sales', locationId: 'LOC-MAIN', owningProduct: 'commerce' },
        { id: 'plant-execution', label: 'Production execution', kind: 'production-execution', locationId: 'LOC-MAIN', owningProduct: 'production' },
        { id: 'website-inquiry', label: 'Website inquiries', kind: 'lead-capture', locationId: 'LOC-MAIN', owningProduct: 'website' },
        { id: 'ecommerce-storefront', label: 'Digital storefront', kind: 'digital-sales', locationId: 'LOC-MAIN', owningProduct: 'ecommerce' },
      ],
      recordAuthorities: [
        { product: 'commerce', label: 'Shop', locationIds: ['LOC-MAIN'], owns: ['catalog', 'inventory', 'orders', 'payments', 'customer_accounts'], consumesFrom: ['production'], writePolicy: 'human_review_required' },
        { product: 'production', label: 'Plant', locationIds: ['LOC-MAIN'], owns: ['materials', 'work_orders', 'quality', 'maintenance', 'released_stock'], consumesFrom: ['commerce'], writePolicy: 'human_review_required' },
        { product: 'website', label: 'Website', locationIds: ['LOC-MAIN'], owns: ['pages', 'content', 'releases', 'lead_intake'], consumesFrom: [], writePolicy: 'human_review_required' },
        { product: 'ecommerce', label: 'Ecommerce', locationIds: ['LOC-MAIN'], owns: ['storefront', 'collections', 'carts', 'quotes', 'order_requests'], consumesFrom: ['commerce', 'website'], writePolicy: 'human_review_required' },
      ],
      controls: { canonicalLocationRequired: true, crossProductReferencesRequired: true, unmanagedWritesAllowed: false },
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
    const topologyTamper = structuredClone(artifact)
    topologyTamper.topology.recordAuthorities[3].consumesFrom = []
    assert.throws(() => verifyClientDemoPreparation(topologyTamper), /client_demo_topology_drift/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('client rehearsal plan binds reconciliation, reload, mobile, replay, export, reset, and rollback without claiming execution', async () => {
  const source = await fixture()
  try {
    const preparation = await prepareClientDemo({ kitPath: source.kitPath, preparedAt: PREPARED_AT })
    const plan = buildClientDemoRehearsalPlan(preparation, '2026-07-29T05:00:00.000Z')
    assert.equal(plan.contract, CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT)
    assert.equal(plan.preparation.bundleDigest, preparation.bundleDigest)
    assert.deepEqual(plan.run, {
      status: 'not_started',
      installOrder: ['commerce', 'production', 'website', 'ecommerce'],
      viewportWidths: [390, 1280],
      completedChecks: 0,
      totalChecks: 36,
    })
    assert.equal(plan.products.every((product) => product.status === 'not_started' && product.rollback.status === 'pending'), true)
    assert.equal(plan.products.every((product) => Object.values(product.acceptance).every((status) => status === 'pending')), true)
    assert.equal(plan.products[0].reconciliation.firstApplyEquation, 'created_plus_already_present_equals_row_count')
    assert.equal(plan.products[0].reconciliation.replayEquation, 'created_zero_and_already_present_equals_row_count')
    assert.deepEqual(plan.controls, {
      planOnly: true,
      containsClientValues: false,
      safeToShareExternally: false,
      localBrowserRehearsalRequired: true,
      browserWritesPerformed: false,
      resetPerformed: false,
      restorePerformed: false,
      hostedWritesPerformed: false,
      externalWritesPerformed: false,
      connectorCallsPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    })
    assert.doesNotMatch(JSON.stringify(plan), /Confidential client workspace|Founder reviewer|RICE-25KG/)
    assert.equal(verifyClientDemoRehearsalPlan(plan, preparation).status, 'not_started')
    const tampered = structuredClone(plan)
    tampered.products[0].acceptance.local_apply_confirmed = 'passed'
    assert.throws(() => verifyClientDemoRehearsalPlan(tampered, preparation), /client_demo_rehearsal_drift/)

    const preparationPath = resolve(source.directory, 'prepared.json')
    const planPath = resolve(source.directory, 'rehearsal.json')
    const cliPlanPath = resolve(source.directory, 'cli-rehearsal.json')
    await writeClientDemoPreparation(preparation, preparationPath)
    assert.equal(await writeClientDemoRehearsalPlan(plan, planPath), planPath)
    const planCli = spawnSync(process.execPath, [TOOL, '--rehearse', preparationPath, '--out', cliPlanPath], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true,
    })
    assert.equal(planCli.status, 0, planCli.stderr)
    assert.equal(JSON.parse(planCli.stdout).status, 'not_started')
    const verifyCli = spawnSync(process.execPath, [TOOL, '--verify-rehearsal', cliPlanPath, '--preparation', preparationPath], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true,
    })
    assert.equal(verifyCli.status, 0, verifyCli.stderr)
    assert.deepEqual(JSON.parse(verifyCli.stdout).completedChecks, 0)
    assert.doesNotMatch(verifyCli.stdout, /Confidential client workspace|Founder reviewer/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('client rehearsal result records explicit partial browser evidence without self-certifying unrun checks', async () => {
  const source = await fixture()
  try {
    const preparation = await prepareClientDemo({ kitPath: source.kitPath, preparedAt: PREPARED_AT })
    const plan = buildClientDemoRehearsalPlan(preparation, '2026-07-29T05:00:00.000Z')
    const observations = {
      contract: CLIENT_DEMO_REHEARSAL_OBSERVATIONS_CONTRACT,
      observedAt: '2026-07-31T10:00:00.000Z',
      operator: { kind: 'codex_in_app_browser', label: 'Codex local product rehearsal' },
      environment: {
        origin: 'http://127.0.0.1:5173',
        browser: 'Codex In-app Browser',
        workspaceKind: 'sample_browser_local',
      },
      products: plan.products.map((product) => ({
        product: product.product,
        acceptance: {
          baseline_exported: 'not_run',
          local_apply_confirmed: 'not_run',
          reload_verified: product.product === 'ecommerce' ? 'passed' : 'not_run',
          mobile_390_verified: 'passed',
          desktop_1280_verified: 'passed',
          idempotent_replay_verified: 'not_run',
          evidence_exported: 'not_run',
          reset_verified: 'not_run',
          baseline_restored: 'not_run',
        },
        scenario: {
          id: {
            commerce: 'sale_review_boundary',
            production: 'execution_guard',
            website: 'editor_mobile_preview',
            ecommerce: 'cart_reload_persistence',
          }[product.product],
          status: 'passed',
          evidence: {
            commerce: 'Added one local sample item, opened the accountable sale review, cancelled it, and cleared the cart.',
            production: 'Observed active jobs, material and routing controls, and the stale-plan reconciliation guard.',
            website: 'Opened the real page editor and switched the local draft preview to its mobile layout.',
            ecommerce: 'Observed one cart item and two tracked requests before and after a hard reload.',
          }[product.product],
        },
      })),
      controls: {
        browserInteractionPerformed: true,
        productRecordsChanged: false,
        resetPerformed: false,
        restorePerformed: false,
        containsClientValues: false,
        safeToShareExternally: false,
        hostedWritesPerformed: false,
        externalWritesPerformed: false,
        connectorCallsPerformed: false,
        modelCallsPerformed: false,
      },
    }
    const result = buildClientDemoRehearsalResult(plan, preparation, observations)
    assert.equal(result.contract, CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT)
    assert.equal(result.plan.digest, plan.digest)
    assert.equal(result.run.status, 'partial')
    assert.deepEqual(result.run, {
      status: 'partial',
      passedChecks: 9,
      failedChecks: 0,
      notRunChecks: 27,
      totalChecks: 36,
      passedScenarios: 4,
      failedScenarios: 0,
    })
    assert.equal(result.controls.selfCertificationAllowed, false)
    assert.equal(result.controls.productRecordsChanged, false)
    assert.equal(verifyClientDemoRehearsalResult(result, plan, preparation).status, 'partial')
    assert.doesNotMatch(JSON.stringify(result), /Confidential client workspace|Founder reviewer|RICE-25KG/)

    const forgedObservation = structuredClone(observations)
    forgedObservation.products[0].acceptance.local_apply_confirmed = 'passed'
    assert.throws(() => buildClientDemoRehearsalResult(plan, preparation, forgedObservation), /client_demo_rehearsal_observation_control_drift/)
    const tamperedResult = structuredClone(result)
    tamperedResult.products[0].acceptance.idempotent_replay_verified = 'passed'
    assert.throws(() => verifyClientDemoRehearsalResult(tamperedResult, plan, preparation), /client_demo_rehearsal_result_drift/)

    const preparationPath = resolve(source.directory, 'prepared-result.json')
    const planPath = resolve(source.directory, 'plan-result.json')
    const observationsPath = resolve(source.directory, 'observations.json')
    const resultPath = resolve(source.directory, 'result.json')
    const directResultPath = resolve(source.directory, 'direct-result.json')
    await writeClientDemoPreparation(preparation, preparationPath)
    await writeClientDemoRehearsalPlan(plan, planPath)
    await writeFile(observationsPath, JSON.stringify(observations), 'utf8')
    assert.equal(await writeClientDemoRehearsalResult(result, directResultPath), directResultPath)
    const recordCli = spawnSync(process.execPath, [
      TOOL, '--record-rehearsal', planPath, '--preparation', preparationPath,
      '--observations', observationsPath, '--out', resultPath,
    ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true })
    assert.equal(recordCli.status, 0, recordCli.stderr)
    assert.equal(JSON.parse(recordCli.stdout).status, 'partial')
    const verifyCli = spawnSync(process.execPath, [
      TOOL, '--verify-rehearsal-result', resultPath, '--plan', planPath, '--preparation', preparationPath,
    ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true })
    assert.equal(verifyCli.status, 0, verifyCli.stderr)
    assert.equal(JSON.parse(verifyCli.stdout).passedChecks, 9)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('legacy v1 and v2 setup kits migrate to the canonical shared operating foundation and topology', async () => {
  const source = await fixture()
  try {
    const legacy = structuredClone(source.kit)
    legacy.schema = 'supermega.client_demo_kit.v1'
    legacy.blueprint.schema = 'supermega.client_demo_blueprint.v1'
    delete legacy.blueprint.foundation
    delete legacy.blueprint.topology
    const legacyPath = resolve(source.directory, 'legacy-kit.json')
    await writeFile(legacyPath, JSON.stringify(legacy), 'utf8')

    const artifact = await prepareClientDemo({ kitPath: legacyPath, preparedAt: PREPARED_AT })

    assert.equal(artifact.kit.schema, 'supermega.client_demo_kit.v3')
    assert.equal(artifact.foundation.organization.displayName, source.blueprint.client.workspace)
    assert.equal(artifact.foundation.operatingUnit.kind, 'plant')
    assert.equal(artifact.topology.recordAuthorities.length, 4)
    assert.deepEqual(verifyClientDemoPreparation(artifact).status, 'verified_not_applied')

    const legacyV2 = structuredClone(source.kit)
    legacyV2.schema = 'supermega.client_demo_kit.v2'
    legacyV2.blueprint.schema = 'supermega.client_demo_blueprint.v2'
    delete legacyV2.blueprint.topology
    const legacyV2Path = resolve(source.directory, 'legacy-v2-kit.json')
    await writeFile(legacyV2Path, JSON.stringify(legacyV2), 'utf8')
    const migratedV2 = await prepareClientDemo({ kitPath: legacyV2Path, preparedAt: PREPARED_AT })
    assert.equal(migratedV2.kit.schema, 'supermega.client_demo_kit.v3')
    assert.deepEqual(migratedV2.topology, source.blueprint.topology)
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

test('one private client folder builds the setup kit and four-product review artifact without using the app', async () => {
  const source = await fixture()
  try {
    const dataDirectory = resolve(source.directory, 'one-folder-client')
    await mkdir(dataDirectory)
    await writeFile(resolve(dataDirectory, 'client.json'), JSON.stringify({
      schema: 'supermega.client_profile.v1',
      workspace: 'One-folder client',
      owner: 'Implementation owner',
      presetId: 'manufacturing',
      products: ['commerce', 'production', 'website', 'ecommerce'],
    }), 'utf8')
    const commerce = source.blueprint.products.find((product) => product.product === 'commerce')
    assert.ok(commerce)
    await writeFile(resolve(dataDirectory, 'commerce.csv'), commerce.sampleCsv, 'utf8')

    const artifact = await prepareClientDemo({ dataDirectory, preparedAt: PREPARED_AT })
    assert.equal(artifact.client.workspace, 'One-folder client')
    assert.equal(artifact.client.owner, 'Implementation owner')
    assert.deepEqual(artifact.products.map((product) => product.product), ['commerce', 'production', 'website', 'ecommerce'])
    assert.equal(artifact.products[0].sourceMode, 'client_csv')
    assert.equal(artifact.products.slice(1).every((product) => product.sourceMode === 'kit_sample_fixture'), true)
    assert.equal(artifact.kit.schema, 'supermega.client_demo_kit.v3')
    assert.deepEqual(verifyClientDemoPreparation(artifact).status, 'verified_not_applied')

    const cliOutput = resolve(source.directory, 'one-folder-review.json')
    const cli = spawnSync(process.execPath, [TOOL, '--data-dir', dataDirectory, '--out', cliOutput], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(JSON.parse(cli.stdout).clientDataFiles, 1)
    assert.doesNotMatch(cli.stdout, /One-folder client|Implementation owner/)
    assert.equal(JSON.parse(await readFile(cliOutput, 'utf8')).review.status, 'awaiting_founder_review')
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('one command creates a private four-product intake workspace that becomes a verified review artifact', async () => {
  const source = await fixture()
  try {
    const intakeDirectory = resolve(source.directory, 'new-client-intake')
    const initialized = await initializeClientWorkspace({ directory: intakeDirectory })
    assert.deepEqual(initialized, {
      ok: true,
      contract: CLIENT_INTAKE_WORKSPACE_CONTRACT,
      presetId: 'manufacturing',
      productCount: 4,
      templateCount: 4,
      containsClientData: false,
      externalWritesPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    })
    const profilePath = resolve(intakeDirectory, 'client.json')
    const profile = JSON.parse(await readFile(profilePath, 'utf8'))
    assert.deepEqual(profile.products, ['commerce', 'production', 'website', 'ecommerce'])
    assert.equal(profile.workspace, 'REPLACE WITH CLIENT WORKSPACE')
    assert.match(await readFile(resolve(intakeDirectory, 'START-HERE.md'), 'utf8'), /No model, connector, hosted write, activation, inventory change, order, or production action occurs/)
    for (const product of ['commerce', 'production', 'website', 'ecommerce']) {
      assert.ok((await stat(resolve(intakeDirectory, '_templates', `${product}.csv`))).size > 0)
    }
    await assert.rejects(prepareClientDemo({ dataDirectory: intakeDirectory, preparedAt: PREPARED_AT }), /client_profile_contract_invalid/)
    await writeFile(profilePath, JSON.stringify({ ...profile, workspace: 'Prepared client', owner: 'Implementation owner' }), 'utf8')
    await writeFile(resolve(intakeDirectory, 'commerce.csv'), await readFile(resolve(intakeDirectory, '_templates', 'commerce.csv'), 'utf8'), 'utf8')
    const artifact = await prepareClientDemo({ dataDirectory: intakeDirectory, preparedAt: PREPARED_AT })
    assert.equal(artifact.products.length, 4)
    assert.equal(artifact.products[0].sourceMode, 'client_csv')
    assert.equal(verifyClientDemoPreparation(artifact).status, 'verified_not_applied')
    await assert.rejects(initializeClientWorkspace({ directory: intakeDirectory }), /client_workspace_init_exists/)

    const cliDirectory = resolve(source.directory, 'cli-client-intake')
    const cli = spawnSync(process.execPath, [TOOL, '--init', cliDirectory, '--preset', 'service-business', '--products', 'shop,website,ecommerce'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(cli.status, 0, cli.stderr)
    const cliSummary = JSON.parse(cli.stdout)
    assert.equal(cliSummary.contract, CLIENT_INTAKE_WORKSPACE_CONTRACT)
    assert.equal(cliSummary.productCount, 3)
    assert.equal(cliSummary.containsClientData, false)
    assert.doesNotMatch(cli.stdout, /cli-client-intake|REPLACE WITH/)
    assert.deepEqual(JSON.parse(await readFile(resolve(cliDirectory, 'client.json'), 'utf8')).products, ['commerce', 'website', 'ecommerce'])
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('contact intake routes every public product into one private reviewed client plan', () => {
  const cases = [
    ['commerce', ['shop'], 'commerce'],
    ['plant', ['plant'], 'production'],
    ['website', ['website'], 'website'],
    ['ecommerce', ['shop', 'ecommerce'], 'ecommerce'],
    ['guide', ['website'], 'guide'],
  ]
  for (const [workflow, products, expectedProduct] of cases) {
    const presetId = expectedProduct === 'production' ? 'manufacturing' : expectedProduct === 'website' || expectedProduct === 'guide' ? 'service-business' : 'retail-network'
    const packet = buildClientContactIntake(contactEvent(workflow), contactReview({ products, presetId }))
    assert.equal(packet.contract, CLIENT_CONTACT_INTAKE_CONTRACT)
    assert.equal(packet.client.requestedProduct, expectedProduct)
    assert.deepEqual(packet.client.products, products.map((product) => product === 'shop' ? 'commerce' : product === 'plant' ? 'production' : product))
    assert.equal(verifyClientContactIntake(packet), packet)
    const encoded = JSON.stringify(packet)
    assert.doesNotMatch(encoded, /Private Requester Name|private\.requester@example\.com|Original Company Legal Name|must not enter/)
    assert.match(packet.source.leadDigest, /^sha256:[0-9a-f]{64}$/)
    assert.match(packet.source.companyDigest, /^sha256:[0-9a-f]{64}$/)
    assert.deepEqual(packet.controls, {
      privateArtifact: true,
      requesterNameRetained: false,
      requesterEmailRetained: false,
      rawContactRetained: false,
      externalWritesPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    })
  }
})

test('contact intake rejects unreviewed, mismatched, unsafe, or incomplete product routing', () => {
  assert.throws(() => buildClientContactIntake(contactEvent('ecommerce'), contactReview({ products: ['ecommerce'] })), /client_contact_ecommerce_requires_shop/)
  assert.throws(() => buildClientContactIntake(contactEvent('plant'), contactReview({ products: ['shop'] })), /client_contact_requested_product_missing/)
  assert.throws(() => buildClientContactIntake(contactEvent(), contactReview({ overrides: { leadId: 'LEAD-0000000000000000' } })), /client_contact_lead_mismatch/)
  assert.throws(() => buildClientContactIntake(contactEvent(), contactReview({ overrides: { privateWorkspaceApproved: false } })), /client_contact_review_approval_required/)
  assert.throws(() => buildClientContactIntake(contactEvent(), contactReview({ overrides: { reviewedAt: '2026-08-03T07:59:59.000Z' } })), /client_contact_review_time_invalid/)
  assert.throws(() => buildClientContactIntake(contactEvent('unknown'), contactReview()), /client_contact_product_invalid/)
  assert.throws(() => buildClientContactIntake(contactEvent(), { ...contactReview(), extra: true }), /client_contact_review_invalid/)
  const valid = buildClientContactIntake(contactEvent(), contactReview())
  assert.throws(() => verifyClientContactIntake({ ...valid, request: { ...valid.request, goal: 'changed' } }), /client_contact_intake_invalid/)
})

test('owner-reviewed contact creates and verifies a usable private workspace without contact PII', async () => {
  const source = await fixture()
  try {
    const directory = resolve(source.directory, 'contact-client-intake')
    const event = contactEvent('ecommerce')
    const review = contactReview({ products: ['shop', 'ecommerce'], presetId: 'social-seller' })
    const initialized = await initializeClientWorkspaceFromContact({ directory, event, review })
    assert.equal(initialized.contract, CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT)
    assert.equal(initialized.requestedProduct, 'ecommerce')
    assert.equal(initialized.productCount, 2)
    assert.equal(initialized.containsClientData, true)
    assert.equal(initialized.externalWritesPerformed, false)
    const profile = JSON.parse(await readFile(resolve(directory, 'client.json'), 'utf8'))
    assert.deepEqual(profile, {
      schema: 'supermega.client_profile.v1',
      workspace: 'Reviewed client workspace',
      owner: 'Implementation owner',
      presetId: 'social-seller',
      products: ['commerce', 'ecommerce'],
    })
    const intakeText = await readFile(resolve(directory, 'CONTACT-INTAKE.json'), 'utf8')
    assert.doesNotMatch(intakeText, /Private Requester Name|private\.requester@example\.com|Original Company Legal Name|must not enter/)
    assert.match(await readFile(resolve(directory, 'START-HERE.md'), 'utf8'), /requester name, email, and raw contact record were not copied/)
    const verified = await verifyContactClientWorkspace(directory)
    assert.equal(verified.contract, CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT)
    assert.equal(verified.contactIntakeDigest, initialized.contactIntakeDigest)
    assert.equal(verified.requesterEmailRetained, false)
    const preparation = await prepareClientDemo({ dataDirectory: directory, preparedAt: PREPARED_AT })
    assert.deepEqual(preparation.products.map((product) => product.product), ['commerce', 'ecommerce'])
    assert.equal(verifyClientDemoPreparation(preparation).status, 'verified_not_applied')
    await assert.rejects(initializeClientWorkspaceFromContact({ directory, event, review }), /client_workspace_init_exists/)
    const intakePath = resolve(directory, 'CONTACT-INTAKE.json')
    const intake = JSON.parse(await readFile(intakePath, 'utf8'))
    await writeFile(intakePath, JSON.stringify({ ...intake, request: { ...intake.request, goal: 'tampered goal' } }), 'utf8')
    await assert.rejects(verifyContactClientWorkspace(directory), /client_contact_intake_invalid/)
    await writeFile(intakePath, JSON.stringify(intake), 'utf8')
    await writeFile(resolve(directory, 'client.json'), JSON.stringify({ ...profile, owner: 'Changed owner' }), 'utf8')
    await assert.rejects(verifyContactClientWorkspace(directory), /client_contact_workspace_binding_invalid/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('approved Spa intake creates one isolated beauty-and-spa Shop portal workspace without requester identity', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'supermega-spa-client-workspace-'))
  const directory = resolve(parent, 'portal')
  try {
    const intake = buildShopPilotClientIntake(spaContactEvent(), readySpaOwnerInput(), 'Responsible delivery operator', '2026-08-22T08:00:00.000Z')
    assert.equal(intake.client.presetId, 'service-business')
    assert.deepEqual(intake.client.products, ['commerce'])
    assert.equal(intake.request.requestedTemplate, 'beauty-spa')
    assert.equal(intake.controls.activationStatus, 'not_applied')
    assert.doesNotMatch(JSON.stringify(intake), /Example Operator|operator@example\.invalid/)

    const initialized = await initializeClientWorkspaceFromShopPilot({
      directory,
      event: spaContactEvent(),
      ownerInput: readySpaOwnerInput(),
      implementationOwner: 'Responsible delivery operator',
      reviewedAt: '2026-08-22T08:00:00.000Z',
    })
    assert.equal(initialized.productCount, 1)
    assert.equal(initialized.containsClientData, true)
    assert.equal(initialized.activationStatus, 'not_applied')
    const profile = JSON.parse(await readFile(resolve(directory, 'client.json'), 'utf8'))
    assert.equal(profile.presetId, 'service-business')
    assert.deepEqual(profile.products, ['commerce'])
    assert.match(await readFile(resolve(directory, '_templates', 'commerce.csv'), 'utf8'), /SPA-SVC-MASSAGE/)
    const privateFiles = `${await readFile(resolve(directory, 'CONTACT-INTAKE.json'), 'utf8')}\n${await readFile(resolve(directory, 'START-HERE.md'), 'utf8')}`
    assert.doesNotMatch(privateFiles, /Example Operator|operator@example\.invalid/)
    assert.equal((await verifyContactClientWorkspace(directory)).ok, true)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('Spa portal creation fails closed before writing when any owner gate is missing', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'supermega-spa-client-blocked-'))
  const directory = resolve(parent, 'portal')
  try {
    await assert.rejects(
      initializeClientWorkspaceFromShopPilot({
        directory,
        event: spaContactEvent(),
        ownerInput: readySpaOwnerInput({ pilotDataHandlingApproved: false }),
        implementationOwner: 'Responsible delivery operator',
        reviewedAt: '2026-08-22T08:00:00.000Z',
      }),
      /shop_pilot_client_workspace_owner_approval_required/,
    )
    await assert.rejects(stat(directory))
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('contact workspace CLI is metadata-only and verifies the exact private result', async () => {
  const source = await fixture()
  try {
    const event = contactEvent('website')
    const eventPath = resolve(source.directory, 'private-contact-event.json')
    const reviewPath = resolve(source.directory, 'private-owner-review.json')
    const directory = resolve(source.directory, 'private-contact-workspace')
    await writeFile(eventPath, JSON.stringify(event), 'utf8')
    const reviewTemplate = spawnSync(process.execPath, [TOOL, '--contact-review-template', eventPath, '--out', reviewPath], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(reviewTemplate.status, 0, reviewTemplate.stderr)
    assert.equal(JSON.parse(reviewTemplate.stdout).reviewApproved, false)
    assert.doesNotMatch(reviewTemplate.stdout, /Private Requester Name|private\.requester@example\.com|Original Company Legal Name|Reduce the time needed/)
    const generatedReview = JSON.parse(await readFile(reviewPath, 'utf8'))
    assert.deepEqual(generatedReview.products, ['website'])
    assert.equal(generatedReview.presetId, 'service-business')
    assert.equal(generatedReview.companyReviewed, false)
    assert.doesNotMatch(JSON.stringify(generatedReview), /Private Requester Name|private\.requester@example\.com|Original Company Legal Name|Reduce the time needed/)
    await writeFile(reviewPath, JSON.stringify({
      ...generatedReview,
      workspace: 'Reviewed client workspace',
      implementationOwner: 'Implementation owner',
      companyReviewed: true,
      goalReviewed: true,
      privateWorkspaceApproved: true,
      reviewedAt: '2026-08-03T09:00:00.000Z',
    }), 'utf8')
    const initialized = spawnSync(process.execPath, [TOOL, '--init-from-contact', directory, '--contact-event', eventPath, '--owner-review', reviewPath], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(initialized.status, 0, initialized.stderr)
    const summary = JSON.parse(initialized.stdout)
    assert.equal(summary.contract, CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT)
    assert.equal(summary.requestedProduct, 'website')
    assert.doesNotMatch(initialized.stdout, /Private Requester Name|private\.requester@example\.com|Original Company Legal Name|Reviewed client workspace|private-contact-workspace/)
    const verified = spawnSync(process.execPath, [TOOL, '--verify-contact-workspace', directory], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).contactIntakeDigest, summary.contactIntakeDigest)
    assert.doesNotMatch(verified.stdout, /Private Requester Name|private\.requester@example\.com|Original Company Legal Name|Reviewed client workspace|private-contact-workspace/)
  } finally {
    await rm(source.directory, { recursive: true, force: true })
  }
})

test('one-folder setup rejects ambiguous profiles and CSVs that are not selected', async () => {
  const source = await fixture()
  try {
    const dataDirectory = resolve(source.directory, 'ambiguous-client')
    await mkdir(dataDirectory)
    const profile = {
      schema: 'supermega.client_profile.v1',
      workspace: 'Ambiguous client',
      owner: 'Implementation owner',
      presetId: 'service-business',
      products: ['commerce', 'website'],
    }
    await writeFile(resolve(dataDirectory, 'client.json'), JSON.stringify(profile), 'utf8')
    await writeFile(resolve(dataDirectory, 'production.csv'), 'sku,name,quantity,line\nX,Unexpected,1,Line 1\n', 'utf8')
    await assert.rejects(
      prepareClientDemo({ dataDirectory, preparedAt: PREPARED_AT }),
      /client_data_file_unrecognized/,
    )

    await rm(resolve(dataDirectory, 'production.csv'))
    await assert.rejects(
      prepareClientDemo({ kitPath: source.kitPath, dataDirectory, preparedAt: PREPARED_AT }),
      /client_data_profile_conflict/,
    )

    await writeFile(resolve(dataDirectory, 'client.json'), JSON.stringify({ ...profile, products: ['website', 'commerce'] }), 'utf8')
    await assert.rejects(
      prepareClientDemo({ dataDirectory, preparedAt: PREPARED_AT }),
      /client_profile_contract_invalid/,
    )
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
