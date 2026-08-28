import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  GUIDED_SAMPLE_PRODUCTION_ACTOR,
  PRODUCTION_QUALITY_CAPA_SCHEMA,
  appendGuidedSampleProductionActivity,
  buildProductionBatchGenealogy,
  buildProductionCertificateOfConformance,
  buildProductionQualityCorrectiveAction,
  buildProductionRecallTrace,
  buildProductionShiftHandoff,
  closeProductionJob,
  compareProductionJobSchedule,
  completeProductionMaintenance,
  createEmptyProduction,
  createSeedProduction,
  endProductionDowntime,
  formatProductionBatchGenealogy,
  formatProductionCertificateOfConformance,
  formatProductionRecallTrace,
  formatProductionShiftHandoff,
  productionCertificateOfConformanceText,
  hasGuidedSampleProductionActivity,
  importProductionJobs,
  installProductionWorkingSampleJobs,
  isGuidedSampleProduction,
  parseProductionMaterialQuantity,
  placeProductionQualityHold,
  productionDowntimeIntervals,
  productionJobPlanSourceDigest,
  productionMaintenanceDueQueue,
  productionMaintenanceFindingSource,
  productionMaintenanceRecords,
  productionShiftCloseSourceDigest,
  productionShiftOutput,
  productionStateCanonical,
  productionWorkingSamplePackId,
  openProductionIssue,
  recordProductionMaterialConsumption,
  recordProductionOutput,
  recordProductionScrap,
  releaseProductionQualityHold,
  resolveProductionIssue,
  recordProductionMachineState,
  startProductionDowntime,
  startProductionMaintenance,
  updateProductionJobPlan,
  validateProductionState,
  productionIssueSeverities,
  productionJobPriorities,
  productionMachineStates,
  productionMaterialUnits,
  productionQualityCauseCategories,
  productionWorkspaceCanWrite,
  currentProductionShiftClose,
  currentProductionShiftCloseEvidence,
  PRODUCTION_WORKSPACE_SCHEMA,
  PRODUCTION_KEY,
  LEGACY_PRODUCTION_KEYS,
  PRODUCTION_LOCK,
  PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT,
  PRODUCTION_BATCH_GENEALOGY_SCHEMA,
  PRODUCTION_RECALL_TRACE_SCHEMA,
  normalizeProduction,
} from '../showroom/src/core/production-workspace.ts'
import { plantIndustryPacks } from '../showroom/src/core/plant-industry-packs.ts'
import {
  applyPlantOrderPlan,
  buildPlantOrderPlan,
  checkPlantOrderAvailability,
  createEmptyPlantOrderState,
  EMPTY_PLANT_ORDER_DIGEST,
} from '../showroom/src/core/plant-order-foundation.ts'
import { upsertProductionOrderExecution } from '../showroom/src/core/production-order-portfolio.ts'

const coreAppSource = await readFile(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
const coreAppCssSource = await readFile(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')

test('the Plant status identifies historical sample dates and uses readable singular copy', () => {
  assert.match(coreAppSource, /Historical sample date/)
  assert.match(coreAppSource, /These dates belong to this browser-local sample, not today's production\./)
  assert.match(coreAppSource, /aria-label=\{managedIdentity \? 'Plant today status' : 'Plant sample status'\}/)
  assert.match(
    coreAppSource,
    /currentShiftMaterialEntries\.length === 1 \? 'record' : 'records'/,
    'one material row must read as one record',
  )
  assert.match(
    coreAppCssSource,
    /\.plant-today-source small \{[^}]*color: var\(--core-muted\)[^}]*font-size: var\(--font-size-xs\)[^}]*line-height: 1\.45/s,
    'the accountable-review note must use readable body-sized contrast instead of the tiny status-label treatment',
  )
  assert.match(
    coreAppCssSource,
    /\.plant-today-source small \{ display: block; margin-left: 0; text-align: left; \}/,
    'the accountable-review note must remain visible and readable on mobile',
  )
})

const PLANNING_DAY = '2026-08-07'
const INSTALLED_AT = `${PLANNING_DAY}T01:00:00.000Z`
const SHIFT_REF = `${PLANNING_DAY} Day`

// Industry packs are generic and install onto the shared seed floor: the pack setup carries
// no machines or opening issue of its own (see plant-industry-packs.ts -- setup is prefixes,
// material, and work centre only). Per-trade floors belong to plant BUSINESS templates, whose
// provisioning path hands installProductionWorkingSampleJobs its own machines/issue (covered
// by tools/test_plant_business_templates.mjs). This mirrors the generic pack call in
// product-onboarding-runtime.ts's provisionLocalPlantWorkingSample.
function installedSample(pack) {
  const jobs = [
    {
      id: `${pack.setup.outputPrefix}-101`,
      line: `${pack.setup.workCentrePrefix}-1`,
      product: `${pack.name} demo order A`,
      target: 200,
      output: 0,
      owner: 'Demo owner',
      priority: 'normal',
      dueAt: '2026-08-21T10:00:00.000Z',
    },
    {
      id: `${pack.setup.outputPrefix}-102`,
      line: `${pack.setup.workCentrePrefix}-1`,
      product: `${pack.name} demo order B`,
      target: 120,
      output: 0,
      owner: 'Demo owner',
      priority: 'normal',
      dueAt: '2026-08-28T10:00:00.000Z',
    },
  ]
  const installed = installProductionWorkingSampleJobs(createSeedProduction(), {
    sampleId: pack.id,
    sampleName: pack.name,
    jobs,
    capturedAt: INSTALLED_AT,
  })
  assert.ok(installed, `${pack.id} working sample must install`)
  return installed
}

function demoActivity(pack) {
  return appendGuidedSampleProductionActivity(installedSample(pack), {
    planningDay: PLANNING_DAY,
    materialRef: pack.setup.materialId,
    materialUnit: pack.setup.materialUnit,
  })
}

test('every plant pack gains valid guided-sample shift activity', () => {
  for (const pack of plantIndustryPacks) {
    const state = demoActivity(pack)
    assert.ok(state, `${pack.id} guided sample must append`)
    validateProductionState(state)
    assert.ok(isGuidedSampleProduction(state))
    assert.ok(hasGuidedSampleProductionActivity(state))

    const shift = productionShiftOutput(state, SHIFT_REF)
    assert.ok(shift.goodUnits >= 1, `${pack.id} shift good units`)
    assert.ok(shift.entryCount >= 1, `${pack.id} shift entry count`)
    const materialEntries = state.events.filter((event) => event.kind === 'material_consumed')
    assert.equal(materialEntries.length, 1)
    assert.equal(materialEntries[0].materialRef, pack.setup.materialId)
    const outputs = state.events.filter((event) => event.kind === 'output_recorded')
    assert.ok(outputs.length >= 2)
    assert.ok(outputs.every((event) => event.shiftRef === SHIFT_REF))
    assert.ok(state.events
      .filter((event) => event.actionId.startsWith('ACT-GUIDED-SAMPLE-'))
      .every((event) => event.actor === GUIDED_SAMPLE_PRODUCTION_ACTOR))
  }
})

test('the guided sample is deterministic for a fixed planning day', () => {
  for (const pack of plantIndustryPacks) {
    assert.deepEqual(demoActivity(pack), demoActivity(pack))
  }
})

test('the guided sample refuses invalid days, empty workspaces, and double application', () => {
  const pack = plantIndustryPacks[0]
  const installed = installedSample(pack)
  const invalidDay = { planningDay: 'today', materialRef: pack.setup.materialId, materialUnit: pack.setup.materialUnit }
  // Invalid input is a real failure.
  assert.equal(appendGuidedSampleProductionActivity(installed, invalidDay), null)
  // Nothing to seed is a no-op: return the exact input so the write boundary reports
  // an unchanged replay and a caller can treat any { ok: false } as a real problem.
  const empty = createEmptyProduction()
  const args = { planningDay: PLANNING_DAY, materialRef: pack.setup.materialId, materialUnit: pack.setup.materialUnit }
  assert.equal(appendGuidedSampleProductionActivity(empty, args), empty)
  const once = demoActivity(pack)
  assert.equal(appendGuidedSampleProductionActivity(once, args), once)
})

test('real operator evidence blocks the guided sample and stays distinguishable', () => {
  const pack = plantIndustryPacks[0]
  const installed = installedSample(pack)
  const withOperatorOutput = recordProductionOutput(installed, `${pack.setup.outputPrefix}-101`, 5, SHIFT_REF, {
    actionId: 'ACT-OPERATOR-001',
    capturedAt: `${PLANNING_DAY}T02:00:00.000Z`,
    actor: 'Shift operator',
    reason: 'Real recorded output.',
    evidenceReference: 'SHIFT-LOG-001',
  })
  assert.ok(withOperatorOutput)
  assert.equal(isGuidedSampleProduction(withOperatorOutput), false)
  assert.equal(appendGuidedSampleProductionActivity(withOperatorOutput, {
    planningDay: PLANNING_DAY,
    materialRef: pack.setup.materialId,
    materialUnit: pack.setup.materialUnit,
  }), withOperatorOutput)
})

test('a workspace carrying controlled-order work is never a replaceable sample', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)
  assert.ok(isGuidedSampleProduction(state), 'a pure guided sample is replaceable')
  // Controlled-order work appends no events, so an events-only check would wrongly
  // report this as a pure sample and a pack switch would destroy the released batch
  // that is the only Plant proof.
  assert.equal(isGuidedSampleProduction({ ...state, orderExecution: { commands: [] } }), false)
})

// Fixtures for the widened order-portfolio branch of isGuidedSampleProduction: a workspace
// whose order portfolio is populated is only replaceable when every retained entry's every
// command proof is guided-sample. These build genuinely valid PlantOrderState command chains
// through the real command-append functions (applyPlantOrderPlan, checkPlantOrderAvailability)
// -- not hand-rolled digests -- so validatePlantOrderState's full replay validation actually
// runs, and the fixture exercises the real widening logic rather than the outer try/catch.
const ORDER_PORTFOLIO_SOURCE_DIGEST = `sha256:${'a'.repeat(64)}`

function orderPortfolioProof(actionId, capturedAt, evidenceReference) {
  return { actionId, capturedAt, actor: GUIDED_SAMPLE_PRODUCTION_ACTOR, reason: 'Guided sample order portfolio command.', evidenceReference }
}

function orderPortfolioPlan(jobId) {
  return buildPlantOrderPlan({
    planId: 'PLN-GUIDED-0001',
    sourceDigest: ORDER_PORTFOLIO_SOURCE_DIGEST,
    job: { jobId, product: 'Guided widget', targetQuantity: 100, outputBatchId: 'BATCH-GUIDED-001' },
    materials: [{ materialId: 'MAT-GUIDED-1', name: 'Guided material', unit: 'pcs', quantityPerUnitMilli: 1_000 }],
    workCentres: [{ workCentreId: 'WC-GUIDED-1', name: 'Guided work centre' }],
    routing: [{ operationId: 'OP-GUIDED-1', sequence: 1, name: 'Guided operation', workCentreId: 'WC-GUIDED-1', minutesPerUnitMilli: 1_000 }],
  })
}

// Two commands (import_plan, availability_check) so the "every command" sweep has more than
// one row to actually iterate. `secondActionId` lets a test swap in a non-guided actionId on
// the SECOND command only, proving the guard inspects every command, not just the first.
function orderPortfolioExecution(jobId, secondActionId = 'ACT-GUIDED-SAMPLE-ORDER-002') {
  const plan = orderPortfolioPlan(jobId)
  const step1 = applyPlantOrderPlan(
    createEmptyPlantOrderState(),
    plan,
    orderPortfolioProof('ACT-GUIDED-SAMPLE-ORDER-001', '2026-08-01T00:00:00.000Z', 'GUIDED-ORDER-001'),
    EMPTY_PLANT_ORDER_DIGEST,
  )
  const step2 = checkPlantOrderAvailability(step1.state, {
    checkId: 'CHK-GUIDED-0001',
    sourceDigest: ORDER_PORTFOLIO_SOURCE_DIGEST,
    materials: [{ materialId: 'MAT-GUIDED-1', inputLotId: 'LOT-GUIDED-1', availableQuantityMilli: 1_000_000 }],
    workCentres: [{ workCentreId: 'WC-GUIDED-1', availableMinutes: 1_000_000 }],
    proof: orderPortfolioProof(secondActionId, '2026-08-01T00:05:00.000Z', 'GUIDED-ORDER-002'),
    expectedHeadDigest: step1.state.headDigest,
  })
  return step2.state
}

function orderPortfolioBaseState(jobId) {
  return {
    schema: PRODUCTION_WORKSPACE_SCHEMA,
    revision: 0,
    jobs: [{ id: jobId, line: 'Guided line', product: 'Guided widget', target: 100, output: 0 }],
    issues: [],
    machines: [],
    events: [],
  }
}

test('a workspace whose entire order portfolio carries guided-sample proof is a replaceable sample', () => {
  const jobId = 'JOB-GUIDED-001'
  const state = upsertProductionOrderExecution(orderPortfolioBaseState(jobId), orderPortfolioExecution(jobId))
  validateProductionState(state) // proves this is a genuinely valid, populated order portfolio
  assert.ok(isGuidedSampleProduction(state), 'an all-guided order portfolio must stay replaceable')
})

test('one operator-authored order-portfolio command anywhere blocks replaceability', () => {
  const jobId = 'JOB-GUIDED-001'
  const state = upsertProductionOrderExecution(orderPortfolioBaseState(jobId), orderPortfolioExecution(jobId, 'ACT-PLANNER-002'))
  validateProductionState(state)
  assert.equal(isGuidedSampleProduction(state), false, 'a single operator command anywhere in the portfolio must block replaceability')
})

test('equipmentMaster stays a hard bar even over an all-guided order portfolio', () => {
  const jobId = 'JOB-GUIDED-001'
  const withPortfolio = upsertProductionOrderExecution(orderPortfolioBaseState(jobId), orderPortfolioExecution(jobId))
  const equipmentActionId = 'ACT-GUIDED-SAMPLE-EQUIP-001'
  const state = {
    ...withPortfolio,
    revision: 1,
    events: [{
      id: `EVT-${equipmentActionId}`,
      actionId: equipmentActionId,
      kind: 'equipment_master_imported',
      subjectId: 'equipment-master',
      createdAt: '2026-08-01T00:00:00.000Z',
      actor: GUIDED_SAMPLE_PRODUCTION_ACTOR,
      reason: 'Imported guided equipment master.',
      evidenceReference: `sha256:${'b'.repeat(64)}`,
      summary: 'Imported 1 equipment master records',
      equipmentIds: ['EQ-GUIDED-001'],
    }],
    equipmentMaster: {
      contract: 'supermega.production.equipment-master.v1',
      assets: [{
        id: 'EQ-GUIDED-001',
        name: 'Guided press',
        workCentreId: 'WC-GUIDED-EQUIP-1',
        criticality: 'medium',
        owner: GUIDED_SAMPLE_PRODUCTION_ACTOR,
        commissioningStatus: 'not_commissioned',
        sourceActionId: equipmentActionId,
        sourcePackageDigest: `sha256:${'b'.repeat(64)}`,
        importedAt: '2026-08-01T00:00:00.000Z',
      }],
    },
  }
  validateProductionState(state) // proves this is genuinely valid, not the outer try/catch
  // Every event and every order-portfolio command here is guided-prefixed, so without the
  // equipment master this workspace would already read as a pure guided sample -- isolating
  // equipmentMaster as the actual reason isGuidedSampleProduction must still refuse it.
  assert.equal(isGuidedSampleProduction(state), false, 'equipmentMaster must block replaceability even when every other record is guided')
})

test('guided evidence never lands after the records it follows', () => {
  for (const pack of plantIndustryPacks) {
    const state = demoActivity(pack)
    const installedAt = Date.parse(INSTALLED_AT)
    const guided = state.events.filter((event) => event.actionId.startsWith('ACT-GUIDED-SAMPLE-'))
    assert.ok(guided.length >= 3, `${pack.id} must seed guided evidence`)
    const newest = Math.max(...guided.map((event) => Date.parse(event.createdAt)))
    assert.ok(newest >= installedAt, `${pack.id} guided evidence must follow the install`)
    // Short close and shift close refuse a capturedAt before the newest event, so the
    // guided window must stay tight instead of drifting into the future.
    assert.ok(newest - installedAt < 30 * 60_000, `${pack.id} guided evidence drifted too far forward`)
  }
})

// A generic industry pack has no floor of its own: every pack installs onto the shared seed
// floor (Mixer 01 / Press 02 / Finishing 01, temperature-drift issue). Only a plant BUSINESS
// template hands installProductionWorkingSampleJobs a trade-specific floor through the
// constructor's optional machines/issue parameters -- so both halves are proven here: the
// generic default and the caller-supplied floor actually travelling with the install.
const CUSTOM_FLOOR = {
  machines: [
    { id: 'OV-01', name: 'Deck oven 01', state: 'running' },
    { id: 'MX-01', name: 'Spiral mixer 01', state: 'attention' },
    { id: 'PF-01', name: 'Proofer 01', state: 'running' },
  ],
  issue: { area: 'Spiral mixer 01', summary: 'Dough temperature runs high on the second batch' },
}

function installedSampleWithFloor(pack, floor) {
  return installProductionWorkingSampleJobs(createSeedProduction(), {
    sampleId: pack.id,
    sampleName: pack.name,
    jobs: [{
      id: `${pack.setup.outputPrefix}-101`,
      line: `${pack.setup.workCentrePrefix}-1`,
      product: `${pack.name} demo order A`,
      target: 200,
      output: 0,
      owner: 'Demo owner',
      priority: 'normal',
      dueAt: '2026-08-21T10:00:00.000Z',
    }],
    capturedAt: INSTALLED_AT,
    machines: floor.machines.map((machine) => ({ ...machine })),
    issue: { ...floor.issue },
  })
}

test('generic packs install onto the seed floor and a caller-supplied floor travels with the install', () => {
  const seed = createSeedProduction()
  for (const pack of plantIndustryPacks) {
    const state = installedSample(pack)
    assert.deepEqual(
      state.machines,
      seed.machines,
      `${pack.id} must install onto the shared seed floor`,
    )
    const issue = state.issues.find((candidate) => candidate.kind === 'quality')
    assert.ok(issue, `${pack.id} must keep the seed opening quality issue`)
    assert.equal(issue.area, seed.issues[0].area)
    assert.equal(issue.summary, seed.issues[0].summary)
  }

  // A business-template-style caller may hand over its own equipment and opening issue.
  const withFloor = installedSampleWithFloor(plantIndustryPacks[0], CUSTOM_FLOOR)
  assert.ok(withFloor, 'a caller-supplied floor must install')
  validateProductionState(withFloor)
  assert.deepEqual(
    withFloor.machines.map((machine) => ({ id: machine.id, name: machine.name, state: machine.state })),
    CUSTOM_FLOOR.machines,
  )
  const customIssue = withFloor.issues.find((candidate) => candidate.kind === 'quality')
  assert.ok(customIssue, 'the caller-supplied opening issue must be present')
  assert.equal(customIssue.area, CUSTOM_FLOOR.issue.area)
  assert.equal(customIssue.summary, CUSTOM_FLOOR.issue.summary)
  // The issue names a real place on the floor the same install just set up.
  assert.ok(CUSTOM_FLOOR.machines.some((machine) => machine.name === customIssue.area))
})

test('switching packs replaces the previous floor instead of refusing', () => {
  const [first, second] = plantIndustryPacks
  const installed = installedSampleWithFloor(first, CUSTOM_FLOOR)
  assert.ok(installed, 'the first pack must install with its caller-supplied floor')
  const switched = installProductionWorkingSampleJobs(installed, {
    sampleId: second.id,
    sampleName: second.name,
    jobs: [{
      id: `${second.setup.outputPrefix}-101`,
      line: `${second.setup.workCentrePrefix}-1`,
      product: `${second.name} order A`,
      target: 200,
      output: 0,
      owner: 'Demo owner',
      priority: 'normal',
      dueAt: '2026-08-21T10:00:00.000Z',
    }],
    capturedAt: INSTALLED_AT,
  })
  assert.ok(switched, 'a pure sample must accept a different pack')
  validateProductionState(switched)
  // The previous caller's floor must not leak into the next pack: with no floor of
  // its own, the switched install lands back on the shared seed floor.
  const seed = createSeedProduction()
  assert.deepEqual(switched.machines, seed.machines)
  assert.equal(switched.issues.find((issue) => issue.kind === 'quality').summary, seed.issues[0].summary)
})

test('a recorded machine change still blocks a sample install', () => {
  const pack = plantIndustryPacks[0]
  const installed = installedSample(pack)
  const target = installed.machines[0]
  const changed = recordProductionMachineState(installed, target.id, target.state, 'stopped', {
    actionId: 'ACT-OPERATOR-MACHINE-001',
    capturedAt: `${PLANNING_DAY}T02:00:00.000Z`,
    actor: 'Shift operator',
    reason: 'Stopped for a real changeover.',
    evidenceReference: 'SHIFT-LOG-002',
  })
  assert.ok(changed, 'the machine state change must be recorded')
  // Normalising the floor must not swallow evidence: the operator event is still
  // present, so a pack install has to refuse rather than overwrite it.
  assert.equal(installProductionWorkingSampleJobs(changed, {
    sampleId: pack.id,
    sampleName: pack.name,
    jobs: [{
      id: `${pack.setup.outputPrefix}-901`,
      line: `${pack.setup.workCentrePrefix}-9`,
      product: 'Replacement order',
      target: 10,
      output: 0,
      owner: 'Demo owner',
      priority: 'normal',
      dueAt: '2026-09-01T10:00:00.000Z',
    }],
    capturedAt: INSTALLED_AT,
  }), null)
})

test('CAPA is required only for a fully specified quality issue', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)
  const proof = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Quality lead',
    reason: 'Recorded during the shift.',
    evidenceReference: 'QA-LOG-001',
  })
  // The seed ships an incomplete legacy quality issue: no severity, owner, due
  // time, or containment. The engine lets it close without CAPA, so the UI must
  // not demand six CAPA fields to dismiss it.
  const legacy = state.issues.find((issue) => issue.kind === 'quality' && !issue.severity)
  assert.ok(legacy, 'the seed must still carry an incomplete quality issue')
  const closedLegacy = resolveProductionIssue(state, legacy.id, proof('ACT-QA-LEGACY-001', `${PLANNING_DAY}T09:00:00.000Z`))
  assert.ok(closedLegacy, 'an incomplete quality issue must close without CAPA')

  // A fully specified quality issue still requires CAPA.
  const withFullIssue = openProductionIssue(state, {
    id: 'ISS-QA-001',
    status: 'open',
    createdAt: `${PLANNING_DAY}T09:15:00.000Z`,
    area: 'Line A',
    summary: 'Seal strength below specification',
    kind: 'quality',
    severity: 'high',
    owner: 'Quality lead',
    dueAt: '2026-09-01T10:00:00.000Z',
    containment: 'Batch held pending review.',
  }, proof('ACT-QA-FULL-001', `${PLANNING_DAY}T09:30:00.000Z`))
  assert.ok(withFullIssue, 'a complete quality issue must open')
  const opened = withFullIssue.issues.find((issue) => issue.summary === 'Seal strength below specification')
  assert.equal(
    resolveProductionIssue(withFullIssue, opened.id, proof('ACT-QA-FULL-002', `${PLANNING_DAY}T10:00:00.000Z`)),
    null,
    'a complete quality issue must not close without CAPA',
  )
})

test('a fully-specified quality issue closes successfully once complete CAPA evidence is provided', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)
  const proof = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Quality lead',
    reason: 'CAPA evidence recorded after root-cause investigation.',
    evidenceReference: 'CAPA-RECORD-001',
  })
  const withFullIssue = openProductionIssue(state, {
    id: 'ISS-CAPA-001',
    status: 'open',
    createdAt: `${PLANNING_DAY}T09:00:00.000Z`,
    area: 'Line A',
    summary: 'Product dimension out of tolerance',
    kind: 'quality',
    severity: 'high',
    owner: 'Quality lead',
    dueAt: '2026-09-01T10:00:00.000Z',
    containment: 'Batch held, inspection in progress.',
  }, proof('ACT-CAPA-OPEN-001', `${PLANNING_DAY}T09:30:00.000Z`))
  assert.ok(withFullIssue, 'the complete quality issue must open')

  const capa = buildProductionQualityCorrectiveAction(withFullIssue, 'ISS-CAPA-001', {
    failureMode: 'Dimension out of tolerance',
    causeCategory: 'machine',
    rootCause: 'Cutting blade worn beyond specification; gap adjustment failed.',
    correctiveAction: 'Replaced blade, recalibrated gap, and ran capability study.',
    verificationResult: 'Three-hour production run confirms dimension is within specification.',
    effectivenessOwner: 'Quality lead',
    effectivenessDue: '2026-09-15T10:00:00.000Z',
  })
  assert.ok(capa, 'CAPA evidence must build from valid inputs')
  assert.equal(capa.contract, PRODUCTION_QUALITY_CAPA_SCHEMA)
  assert.equal(capa.causeCategory, 'machine')
  assert.deepEqual(capa.priorIssueIds, [], 'first occurrence has no prior issue IDs')

  const closed = resolveProductionIssue(
    withFullIssue, 'ISS-CAPA-001',
    proof('ACT-CAPA-CLOSE-001', `${PLANNING_DAY}T11:00:00.000Z`),
    undefined,
    capa,
  )
  assert.ok(closed, 'a complete quality issue must close when CAPA evidence is provided')
  const resolvedIssue = closed.issues.find((issue) => issue.id === 'ISS-CAPA-001')
  assert.equal(resolvedIssue.status, 'resolved')
  assert.ok(resolvedIssue.resolution.qualityCorrectiveAction, 'CAPA must be stored on the resolution')
  assert.equal(resolvedIssue.resolution.qualityCorrectiveAction.causeCategory, 'machine')
  assert.equal(resolvedIssue.resolution.qualityCorrectiveAction.recurrenceKey, 'machine:dimension-out-of-tolerance')
})

test('a second occurrence of the same failure mode records prior issue IDs in CAPA', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)
  const proof = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Quality lead',
    reason: 'CAPA evidence recorded after root-cause investigation.',
    evidenceReference: 'CAPA-RECORD-002',
  })

  const withFirst = openProductionIssue(state, {
    id: 'ISS-RECUR-001',
    status: 'open',
    createdAt: `${PLANNING_DAY}T09:00:00.000Z`,
    area: 'Line A',
    summary: 'Seal strength below specification first occurrence',
    kind: 'quality',
    severity: 'high',
    owner: 'Quality lead',
    dueAt: '2026-09-01T10:00:00.000Z',
    containment: 'Batch held pending first investigation.',
  }, proof('ACT-RECUR-OPEN-001', `${PLANNING_DAY}T09:30:00.000Z`))
  assert.ok(withFirst)

  const capa1 = buildProductionQualityCorrectiveAction(withFirst, 'ISS-RECUR-001', {
    failureMode: 'Seal strength below specification',
    causeCategory: 'machine',
    rootCause: 'Sealing die temperature below minimum.',
    correctiveAction: 'Temperature setpoint adjusted and held for one hour.',
    verificationResult: 'Ten consecutive packs passed tensile test.',
    effectivenessOwner: 'Quality lead',
    effectivenessDue: '2026-09-15T10:00:00.000Z',
  })
  assert.ok(capa1)
  assert.deepEqual(capa1.priorIssueIds, [], 'first occurrence has no history')

  const closedFirst = resolveProductionIssue(
    withFirst, 'ISS-RECUR-001',
    proof('ACT-RECUR-CLOSE-001', `${PLANNING_DAY}T11:00:00.000Z`),
    undefined,
    capa1,
  )
  assert.ok(closedFirst)

  const withSecond = openProductionIssue(closedFirst, {
    id: 'ISS-RECUR-002',
    status: 'open',
    createdAt: `${PLANNING_DAY}T14:00:00.000Z`,
    area: 'Line A',
    summary: 'Seal strength below specification second occurrence',
    kind: 'quality',
    severity: 'high',
    owner: 'Quality lead',
    dueAt: '2026-09-02T10:00:00.000Z',
    containment: 'Batch held pending second investigation.',
  }, proof('ACT-RECUR-OPEN-002', `${PLANNING_DAY}T14:30:00.000Z`))
  assert.ok(withSecond)

  const capa2 = buildProductionQualityCorrectiveAction(withSecond, 'ISS-RECUR-002', {
    failureMode: 'Seal strength below specification',
    causeCategory: 'machine',
    rootCause: 'Temperature sensor drift led to setpoint failure.',
    correctiveAction: 'Sensor replaced and recalibrated.',
    verificationResult: 'Twenty consecutive packs passed tensile test.',
    effectivenessOwner: 'Quality lead',
    effectivenessDue: '2026-09-16T10:00:00.000Z',
  })
  assert.ok(capa2, 'second CAPA must build')
  assert.equal(capa2.recurrenceKey, capa1.recurrenceKey, 'same failure mode must yield the same recurrence key')
  assert.deepEqual(capa2.priorIssueIds, ['ISS-RECUR-001'], 'second occurrence must reference the prior resolved issue')
})

test('a quality hold can be placed on a job and released, and idempotent replay returns the unchanged state', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)
  const jobId = state.jobs[0].id
  const holdProof = {
    actionId: 'ACT-HOLD-001',
    capturedAt: `${PLANNING_DAY}T10:00:00.000Z`,
    actor: 'Quality lead',
    reason: 'Suspected contamination batch flagged for inspection.',
    evidenceReference: 'QA-HOLD-001',
  }
  const held = placeProductionQualityHold(state, jobId, holdProof)
  assert.ok(held, 'quality hold must be placed')
  validateProductionState(held)
  assert.ok(held.jobs.find((job) => job.id === jobId)?.qualityHold, 'job must carry the hold record')

  // Idempotent replay returns the same state.
  const replayHeld = placeProductionQualityHold(held, jobId, holdProof)
  assert.ok(replayHeld, 'idempotent replay must succeed')
  assert.equal(replayHeld, held, 'idempotent replay must return the exact same state reference')

  const releaseProof = {
    actionId: 'ACT-HOLD-002',
    capturedAt: `${PLANNING_DAY}T11:00:00.000Z`,
    actor: 'Quality lead',
    reason: 'Inspection complete: batch cleared.',
    evidenceReference: 'QA-HOLD-002',
  }
  const released = releaseProductionQualityHold(held, jobId, releaseProof)
  assert.ok(released, 'quality hold must be released')
  validateProductionState(released)
  assert.ok(!released.jobs.find((job) => job.id === jobId)?.qualityHold, 'hold must be absent after release')

  // Releasing from a job with no hold returns null.
  assert.equal(
    releaseProductionQualityHold(state, jobId, releaseProof),
    null,
    'releasing a hold on a job that has none must return null',
  )
})

test('batch genealogy captures material, output, and quality-hold events for a job', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const jobId = state.jobs[0].id
  const proofAt = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Shift operator',
    reason: 'Recorded during shift.',
    evidenceReference: 'SHIFT-LOG-GEN-001',
  })

  const withMaterial = recordProductionMaterialConsumption(
    state, jobId,
    pack.setup.materialId,
    'LOT-2026-001',
    50,
    pack.setup.materialUnit,
    SHIFT_REF,
    proofAt('ACT-GEN-MAT-001', `${PLANNING_DAY}T02:00:00.000Z`),
  )
  assert.ok(withMaterial, 'material consumption must record')

  const withOutput = recordProductionOutput(withMaterial, jobId, 40, SHIFT_REF, proofAt('ACT-GEN-OUT-001', `${PLANNING_DAY}T03:00:00.000Z`))
  assert.ok(withOutput, 'output must record')

  const holdProof = { actionId: 'ACT-GEN-HOLD-001', capturedAt: `${PLANNING_DAY}T04:00:00.000Z`, actor: 'Quality lead', reason: 'Hold for inspection.', evidenceReference: 'QA-GEN-001' }
  const withHold = placeProductionQualityHold(withOutput, jobId, holdProof)
  assert.ok(withHold, 'hold must be placed')

  const genealogy = buildProductionBatchGenealogy(withHold, jobId)
  assert.ok(genealogy, 'genealogy must build')
  assert.equal(genealogy.job.id, jobId)
  assert.equal(genealogy.evidenceCoverage.materialEntryCount, 1)
  assert.equal(genealogy.evidenceCoverage.materialLotEntryCount, 1)
  assert.equal(genealogy.evidenceCoverage.outputEntryCount, 1)
  assert.equal(genealogy.evidenceCoverage.qualityEventCount, 1)
  assert.equal(genealogy.materialEntries[0].materialLot, 'LOT-2026-001')
  assert.equal(genealogy.job.status, 'quality_hold')
  assert.ok(genealogy.digest, 'genealogy must carry a digest')

  // Unknown job returns null.
  assert.equal(buildProductionBatchGenealogy(withHold, 'UNKNOWN-JOB'), null)
})

test('certificate of conformance is only available for a closed job and carries its closure, lot, and quality-hold evidence', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const jobId = state.jobs[0].id
  const proofAt = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Shift operator',
    reason: 'Recorded during shift.',
    evidenceReference: 'SHIFT-LOG-COC-001',
  })

  // An active job (no closure) has no certificate.
  assert.equal(buildProductionCertificateOfConformance(state, jobId), null, 'an active job must not yield a certificate')

  const withMaterial = recordProductionMaterialConsumption(
    state, jobId,
    pack.setup.materialId,
    'LOT-COC-001',
    50,
    pack.setup.materialUnit,
    SHIFT_REF,
    proofAt('ACT-COC-MAT-001', `${PLANNING_DAY}T02:00:00.000Z`),
  )
  assert.ok(withMaterial, 'material consumption must record')

  const withOutput = recordProductionOutput(withMaterial, jobId, 40, SHIFT_REF, proofAt('ACT-COC-OUT-001', `${PLANNING_DAY}T03:00:00.000Z`))
  assert.ok(withOutput, 'output must record')

  // A hold placed and released during the job's life must not block eligibility;
  // it must appear in the certificate's quality-hold history instead.
  const holdProof = { actionId: 'ACT-COC-HOLD-001', capturedAt: `${PLANNING_DAY}T03:30:00.000Z`, actor: 'Quality lead', reason: 'Hold for inspection.', evidenceReference: 'QA-COC-001' }
  const withHold = placeProductionQualityHold(withOutput, jobId, holdProof)
  assert.ok(withHold, 'hold must be placed')

  // While the hold is active, the job cannot be closed and has no certificate.
  assert.equal(closeProductionJob(withHold, jobId, SHIFT_REF, proofAt('ACT-COC-CLOSE-BLOCKED', `${PLANNING_DAY}T03:45:00.000Z`)), null, 'closing a held job must be blocked')
  assert.equal(buildProductionCertificateOfConformance(withHold, jobId), null, 'a job under an active quality hold must not yield a certificate')

  const releaseProof = { actionId: 'ACT-COC-HOLD-002', capturedAt: `${PLANNING_DAY}T04:00:00.000Z`, actor: 'Quality lead', reason: 'Inspection complete: cleared.', evidenceReference: 'QA-COC-002' }
  const released = releaseProductionQualityHold(withHold, jobId, releaseProof)
  assert.ok(released, 'hold must be released')

  const closeProof = proofAt('ACT-COC-CLOSE-001', `${PLANNING_DAY}T05:00:00.000Z`)
  const closed = closeProductionJob(released, jobId, SHIFT_REF, closeProof)
  assert.ok(closed, 'job must close after the hold is released')

  const certificate = buildProductionCertificateOfConformance(closed, jobId)
  assert.ok(certificate, 'a closed, quality-clear job must yield a certificate')
  assert.equal(certificate.job.id, jobId)
  assert.equal(certificate.job.goodUnits, 40)
  assert.deepEqual(certificate.materialLots, ['LOT-COC-001'])
  assert.equal(certificate.qualityEvents.length, 2, 'both the hold and its release must appear in the certificate')
  assert.equal(certificate.closure.actionId, 'ACT-COC-CLOSE-001')
  assert.equal(certificate.closure.closedBy, 'Shift operator')
  assert.equal(certificate.qualityReleaseStatus, 'not_tracked', 'a job with no bound controlled execution plan has no controlled batch-release status')
  assert.ok(certificate.digest, 'certificate must carry a digest')

  // formatProductionCertificateOfConformance: valid JSON that round-trips the job id.
  const certificateJson = formatProductionCertificateOfConformance(certificate)
  assert.ok(typeof certificateJson === 'string' && certificateJson.trim().length > 0)
  assert.equal(JSON.parse(certificateJson).job.id, jobId)

  // productionCertificateOfConformanceText: a human-readable, printable document
  // that includes the retained closure and material-lot evidence.
  const certificateText = productionCertificateOfConformanceText(certificate)
  assert.ok(certificateText.startsWith('SUPERMEGA CERTIFICATE OF CONFORMANCE'))
  assert.ok(certificateText.includes(jobId))
  assert.ok(certificateText.includes('LOT-COC-001'))
  assert.ok(certificateText.includes('ACT-COC-CLOSE-001'))

  // Unknown job returns null.
  assert.equal(buildProductionCertificateOfConformance(closed, 'UNKNOWN-JOB'), null)
})

test('recall trace finds a job by input lot and returns null for an unrecognised lot', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const jobId = state.jobs[0].id
  const proofAt = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Shift operator',
    reason: 'Recorded during shift.',
    evidenceReference: 'SHIFT-LOG-RECALL-001',
  })

  const withMaterial = recordProductionMaterialConsumption(
    state, jobId,
    pack.setup.materialId,
    'LOT-RECALL-001',
    50,
    pack.setup.materialUnit,
    SHIFT_REF,
    proofAt('ACT-RECALL-MAT-001', `${PLANNING_DAY}T02:00:00.000Z`),
  )
  assert.ok(withMaterial, 'material consumption must record')

  const trace = buildProductionRecallTrace(withMaterial, 'LOT-RECALL-001')
  assert.ok(trace, 'recall trace must resolve for a known input lot')
  assert.ok(trace.match.matchedAsInputLot, 'the trace must report a match as an input lot')
  assert.ok(trace.match.directJobIds.includes(jobId), 'the matched job must appear in directJobIds')
  assert.ok(trace.digest, 'recall trace must carry a digest')

  // Case-insensitive: the lot was stored as-is but identity is uppercased.
  const traceLower = buildProductionRecallTrace(withMaterial, 'lot-recall-001')
  assert.ok(traceLower, 'recall trace must resolve regardless of case')

  // An unrecognised lot must return null.
  assert.equal(buildProductionRecallTrace(withMaterial, 'LOT-UNKNOWN-999'), null)

  // An empty string or blank query must return null.
  assert.equal(buildProductionRecallTrace(withMaterial, ''), null)
})

test('shift handoff collects output and material entries for the planning day shift', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)

  const handoff = buildProductionShiftHandoff(state, SHIFT_REF)
  assert.ok(handoff, 'shift handoff must build for a shift that has activity')
  assert.equal(handoff.shiftRef, SHIFT_REF)
  assert.ok(handoff.shiftEntries.length >= 1, 'handoff must include output entries for the shift')
  assert.ok(handoff.materialEntries.length >= 1, 'handoff must include material entries for the shift')
  assert.ok(handoff.shiftOutput.goodUnits >= 1, 'shift output must have at least one good unit')
  assert.ok(handoff.materialTotals.length >= 1, 'handoff must aggregate material totals')
  assert.ok(handoff.machineObservations.length >= 1, 'handoff must carry machine observations')

  // A shift with no recorded activity produces an empty but valid handoff.
  const emptyShift = buildProductionShiftHandoff(state, '2026-01-01 Night')
  assert.ok(emptyShift, 'a valid but unrecorded shift must still return a handoff')
  assert.equal(emptyShift.shiftEntries.length, 0)
  assert.equal(emptyShift.materialEntries.length, 0)

  // An invalid shift reference returns null.
  assert.equal(buildProductionShiftHandoff(state, ''), null)
})

test('scrap recording accumulates on the job and a short-close captures the remaining units', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const jobId = state.jobs[0].id
  const job0 = state.jobs.find((j) => j.id === jobId)
  const proofAt = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Shift operator',
    reason: 'Recorded during shift.',
    evidenceReference: 'SHIFT-LOG-SC-001',
  })

  const withOutput = recordProductionOutput(state, jobId, 100, SHIFT_REF, proofAt('ACT-SC-OUT-001', `${PLANNING_DAY}T02:00:00.000Z`))
  assert.ok(withOutput, 'output must record')
  assert.equal(withOutput.jobs.find((j) => j.id === jobId).output, 100)

  const withScrap = recordProductionScrap(withOutput, jobId, 10, SHIFT_REF, proofAt('ACT-SC-SCRAP-001', `${PLANNING_DAY}T02:30:00.000Z`))
  assert.ok(withScrap, 'scrap must record')
  const jobAfterScrap = withScrap.jobs.find((j) => j.id === jobId)
  assert.equal(jobAfterScrap.scrap, 10, 'scrap must accumulate on the job')

  // Idempotent replay returns unchanged state.
  const replay = recordProductionScrap(withScrap, jobId, 10, SHIFT_REF, proofAt('ACT-SC-SCRAP-001', `${PLANNING_DAY}T02:30:00.000Z`))
  assert.equal(replay, withScrap, 'idempotent scrap replay must return the same state')

  // Short-close the job before it reaches its target.
  const closeProof = proofAt('ACT-SC-CLOSE-001', `${PLANNING_DAY}T03:00:00.000Z`)
  const closed = closeProductionJob(withScrap, jobId, SHIFT_REF, closeProof)
  assert.ok(closed, 'short-close must succeed when remaining units > 0')
  const closedJob = closed.jobs.find((j) => j.id === jobId)
  assert.ok(closedJob.closure, 'closed job must carry closure metadata')
  assert.equal(closedJob.closure.remainingUnits, job0.target - 100 - 10)

  // Closing an already-closed job must return null.
  const secondClose = closeProductionJob(closed, jobId, SHIFT_REF, proofAt('ACT-SC-CLOSE-002', `${PLANNING_DAY}T03:01:00.000Z`))
  assert.equal(secondClose, null, 'closing an already-closed job must return null')

  // Recording scrap after a close must also return null.
  const scrapAfterClose = recordProductionScrap(closed, jobId, 5, SHIFT_REF, proofAt('ACT-SC-SCRAP-002', `${PLANNING_DAY}T03:01:00.000Z`))
  assert.equal(scrapAfterClose, null, 'recording scrap on a closed job must return null')
})

test('downtime can be started and ended on a machine and double-start is blocked', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const machineId = state.machines[0].id

  const startProof = {
    actionId: 'ACT-DT-START-001',
    capturedAt: `${PLANNING_DAY}T04:00:00.000Z`,
    actor: 'Operator',
    reason: 'Machine overheating.',
    evidenceReference: 'DT-LOG-001',
  }
  const withDowntime = startProductionDowntime(state, machineId, startProof)
  assert.ok(withDowntime, 'downtime must start')
  const intervals = productionDowntimeIntervals(withDowntime)
  assert.equal(intervals.length, 1)
  assert.equal(intervals[0].machineId, machineId)
  assert.ok(!intervals[0].end, 'interval must be open after start')

  // Double-start must return null.
  const doubleStart = startProductionDowntime(withDowntime, machineId, {
    actionId: 'ACT-DT-START-002',
    capturedAt: `${PLANNING_DAY}T04:01:00.000Z`,
    actor: 'Operator',
    reason: 'Second attempt.',
    evidenceReference: 'DT-LOG-002',
  })
  assert.equal(doubleStart, null, 'starting downtime on a machine already in downtime must return null')

  // End the downtime.
  const endProof = {
    actionId: 'ACT-DT-END-001',
    capturedAt: `${PLANNING_DAY}T05:00:00.000Z`,
    actor: 'Operator',
    reason: 'Machine cooled down.',
    evidenceReference: 'DT-LOG-001',
  }
  const withEnd = endProductionDowntime(withDowntime, machineId, startProof.actionId, endProof)
  assert.ok(withEnd, 'downtime must end')
  const closedIntervals = productionDowntimeIntervals(withEnd)
  assert.equal(closedIntervals.length, 1)
  assert.ok(closedIntervals[0].end, 'interval must be closed after end')
  assert.ok(closedIntervals[0].durationMs > 0, 'duration must be positive')

  // Ending again must return null (no open interval).
  const doubleEnd = endProductionDowntime(withEnd, machineId, startProof.actionId, {
    actionId: 'ACT-DT-END-002',
    capturedAt: `${PLANNING_DAY}T05:01:00.000Z`,
    actor: 'Operator',
    reason: 'Second end attempt.',
    evidenceReference: 'DT-LOG-003',
  })
  assert.equal(doubleEnd, null, 'ending downtime when no interval is open must return null')
})

test('updateProductionJobPlan updates priority, due date, and owner and blocks invalid cases', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const jobId = state.jobs[0].id

  const proof = {
    actionId: 'ACT-PLAN-UPDATE-001',
    capturedAt: `${PLANNING_DAY}T01:30:00.000Z`,
    actor: 'Planner',
    reason: 'Urgency escalation.',
    evidenceReference: 'PLAN-LOG-001',
  }

  const updated = updateProductionJobPlan(
    state, jobId, 'urgent', '2026-09-01T10:00:00.000Z', 'New owner', proof,
  )
  assert.ok(updated, 'plan update must succeed')
  const job = updated.jobs.find((j) => j.id === jobId)
  assert.equal(job.priority, 'urgent')
  assert.equal(job.owner, 'New owner')

  // Idempotent replay returns the same state.
  const replay = updateProductionJobPlan(updated, jobId, 'urgent', '2026-09-01T10:00:00.000Z', 'New owner', proof)
  assert.equal(replay, updated, 'idempotent plan update must return the same state')

  // Updating a closed job must return null.
  const closeProof = {
    actionId: 'ACT-PLAN-CLOSE-001',
    capturedAt: `${PLANNING_DAY}T08:00:00.000Z`,
    actor: 'Operator',
    reason: 'Short close.',
    evidenceReference: 'PLAN-LOG-002',
  }
  const withOutput = recordProductionOutput(state, jobId, 10, SHIFT_REF, {
    actionId: 'ACT-PLAN-OUT-001',
    capturedAt: `${PLANNING_DAY}T02:00:00.000Z`,
    actor: 'Operator',
    reason: 'Output.',
    evidenceReference: 'PLAN-LOG-003',
  })
  assert.ok(withOutput)
  const closed = closeProductionJob(withOutput, jobId, SHIFT_REF, closeProof)
  assert.ok(closed, 'close must succeed')
  const updateOnClosed = updateProductionJobPlan(closed, jobId, 'normal', '2026-09-02T10:00:00.000Z', 'Owner', {
    actionId: 'ACT-PLAN-UPDATE-002',
    capturedAt: `${PLANNING_DAY}T09:00:00.000Z`,
    actor: 'Planner',
    reason: 'Try to update closed job.',
    evidenceReference: 'PLAN-LOG-004',
  })
  assert.equal(updateOnClosed, null, 'updating a closed job must return null')
})

test('startProductionMaintenance and completeProductionMaintenance run a full lifecycle', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const machineId = state.machines[0].id

  const startProof = {
    actionId: 'ACT-MAINT-START-001',
    capturedAt: `${PLANNING_DAY}T06:00:00.000Z`,
    actor: 'Maintenance technician',
    reason: 'Scheduled preventive maintenance.',
    evidenceReference: 'MAINT-LOG-001',
  }
  const afterStart = startProductionMaintenance(state, machineId, 'Maintenance technician', startProof)
  assert.ok(afterStart, 'maintenance must start')
  const records = productionMaintenanceRecords(afterStart)
  assert.equal(records.length, 1)
  assert.equal(records[0].machineId, machineId)
  assert.ok(!records[0].completion, 'maintenance record must be open after start')

  // Double-start must return null.
  const doubleStart = startProductionMaintenance(afterStart, machineId, 'Maintenance technician', {
    actionId: 'ACT-MAINT-START-002',
    capturedAt: `${PLANNING_DAY}T06:01:00.000Z`,
    actor: 'Maintenance technician',
    reason: 'Second attempt.',
    evidenceReference: 'MAINT-LOG-002',
  })
  assert.equal(doubleStart, null, 'starting maintenance on a machine already under maintenance must return null')

  // Complete maintenance (no strategy → no result required).
  const endProof = {
    actionId: 'ACT-MAINT-END-001',
    capturedAt: `${PLANNING_DAY}T07:00:00.000Z`,
    actor: 'Maintenance technician',
    reason: 'Maintenance completed.',
    evidenceReference: 'MAINT-LOG-001',
  }
  const completed = completeProductionMaintenance(afterStart, machineId, startProof.actionId, endProof)
  assert.ok(completed, 'maintenance must complete')
  const completedRecords = productionMaintenanceRecords(completed)
  assert.equal(completedRecords.length, 1)
  assert.ok(completedRecords[0].completion, 'maintenance record must carry completion after close')

  // Completing again must return null (no open record).
  const doubleComplete = completeProductionMaintenance(completed, machineId, startProof.actionId, {
    actionId: 'ACT-MAINT-END-002',
    capturedAt: `${PLANNING_DAY}T07:01:00.000Z`,
    actor: 'Maintenance technician',
    reason: 'Second complete attempt.',
    evidenceReference: 'MAINT-LOG-003',
  })
  assert.equal(doubleComplete, null, 'completing maintenance with no open record must return null')
})

test('importProductionJobs creates new jobs, detects already-present ids, and reports replayed state', () => {
  const pack = plantIndustryPacks[0]
  const state = installedSample(pack)
  const SOURCE_DIGEST = `sha256:${'a'.repeat(64)}`

  const newJobs = [
    {
      id: `${pack.setup.outputPrefix}-201`,
      line: `${pack.setup.workCentrePrefix}-2`,
      product: 'Import batch A',
      target: 50,
      output: 0,
      owner: 'Import planner',
      priority: 'urgent',
      dueAt: '2026-09-15T10:00:00.000Z',
    },
    {
      id: `${pack.setup.outputPrefix}-202`,
      line: `${pack.setup.workCentrePrefix}-2`,
      product: 'Import batch B',
      target: 80,
      output: 0,
      owner: 'Import planner',
      priority: 'normal',
      dueAt: '2026-09-22T10:00:00.000Z',
    },
  ]

  const result = importProductionJobs(state, {
    jobs: newJobs,
    sourceDigest: SOURCE_DIGEST,
    capturedAt: `${PLANNING_DAY}T08:00:00.000Z`,
    actor: 'Production planner',
  })
  assert.ok(result, 'import must succeed')
  assert.equal(result.created, 2, 'both new jobs must be created')
  assert.equal(result.alreadyPresent, 0)
  assert.equal(result.replayed, false)
  validateProductionState(result.state)
  assert.ok(result.state.jobs.some((j) => j.id === newJobs[0].id))
  assert.ok(result.state.jobs.some((j) => j.id === newJobs[1].id))

  // Re-importing the same jobs returns alreadyPresent=2, created=0, replayed=true.
  const reImport = importProductionJobs(result.state, {
    jobs: newJobs,
    sourceDigest: SOURCE_DIGEST,
    capturedAt: `${PLANNING_DAY}T08:01:00.000Z`,
    actor: 'Production planner',
  })
  assert.ok(reImport, 're-import must not fail')
  assert.equal(reImport.created, 0)
  assert.equal(reImport.alreadyPresent, 2)
  assert.equal(reImport.replayed, true)

  // Invalid source digest format returns null.
  assert.equal(
    importProductionJobs(state, { jobs: newJobs, sourceDigest: 'not-a-sha256', capturedAt: `${PLANNING_DAY}T08:00:00.000Z`, actor: 'Planner' }),
    null,
  )

  // Empty jobs list returns null.
  assert.equal(
    importProductionJobs(state, { jobs: [], sourceDigest: SOURCE_DIGEST, capturedAt: `${PLANNING_DAY}T08:00:00.000Z`, actor: 'Planner' }),
    null,
  )
})

test('parseProductionMaterialQuantity and compareProductionJobSchedule behave correctly', () => {
  // parseProductionMaterialQuantity: valid integer and decimal strings.
  assert.equal(parseProductionMaterialQuantity('50'), 50)
  assert.equal(parseProductionMaterialQuantity('2.5'), 2.5)
  assert.equal(parseProductionMaterialQuantity('0.001'), 0.001)
  assert.equal(parseProductionMaterialQuantity('100.000'), 100)

  // Invalid inputs return null.
  assert.equal(parseProductionMaterialQuantity('0'), null)        // below minimum (scaled = 0)
  assert.equal(parseProductionMaterialQuantity('abc'), null)      // non-numeric
  assert.equal(parseProductionMaterialQuantity(''), null)         // empty
  assert.equal(parseProductionMaterialQuantity('2.5000'), null)   // four decimal places — pattern only allows 1-3

  // compareProductionJobSchedule: urgent before normal before low, undefined priority last.
  const urgentJob = { id: 'JOB-A', priority: 'urgent', product: 'A', target: 1, output: 0, scrap: 0, line: 'L1' }
  const normalJob = { id: 'JOB-B', priority: 'normal', product: 'B', target: 1, output: 0, scrap: 0, line: 'L1' }
  const lowJob    = { id: 'JOB-C', priority: 'low',    product: 'C', target: 1, output: 0, scrap: 0, line: 'L1' }
  const noPrioJob = { id: 'JOB-D',                     product: 'D', target: 1, output: 0, scrap: 0, line: 'L1' }

  assert.ok(compareProductionJobSchedule(urgentJob, normalJob) < 0, 'urgent < normal')
  assert.ok(compareProductionJobSchedule(normalJob, lowJob) < 0, 'normal < low')
  assert.ok(compareProductionJobSchedule(lowJob, noPrioJob) < 0, 'low < undefined')
  assert.ok(compareProductionJobSchedule(noPrioJob, urgentJob) > 0, 'undefined > urgent')

  // Same priority: earlier dueAt sorts first.
  const earlyDue = { ...normalJob, id: 'JOB-E', dueAt: '2026-08-10T08:00:00.000Z' }
  const lateDue  = { ...normalJob, id: 'JOB-F', dueAt: '2026-08-20T08:00:00.000Z' }
  assert.ok(compareProductionJobSchedule(earlyDue, lateDue) < 0, 'earlier dueAt sorts first')

  // Same priority: job with dueAt sorts before job without.
  const noDueJob = { ...normalJob, id: 'JOB-G' }
  assert.ok(compareProductionJobSchedule(earlyDue, noDueJob) < 0, 'dueAt before no-dueAt')

  // Identical priority and dueAt: lexicographic id order.
  const sameDueA = { ...normalJob, id: 'JOB-H', dueAt: '2026-08-15T08:00:00.000Z' }
  const sameDueB = { ...normalJob, id: 'JOB-I', dueAt: '2026-08-15T08:00:00.000Z' }
  assert.ok(compareProductionJobSchedule(sameDueA, sameDueB) < 0, 'JOB-H < JOB-I by id')
  assert.equal(compareProductionJobSchedule(sameDueA, sameDueA), 0, 'same job compares to 0')
})

test('productionMaintenanceDueQueue and productionWorkingSamplePackId behave correctly', () => {
  const AS_OF = `${PLANNING_DAY}T06:00:00.000Z`

  // productionMaintenanceDueQueue: seed state has no equipmentMaster → empty items.
  const queue = productionMaintenanceDueQueue(createSeedProduction(), AS_OF)
  assert.equal(queue.contract, 'supermega.production.maintenance-due-queue.v1')
  assert.equal(queue.asOf, AS_OF)
  assert.deepEqual(queue.items, [])

  // Invalid asOf (non-UTC or non-millisecond precision) must throw.
  assert.throws(() => productionMaintenanceDueQueue(createSeedProduction(), '2026-08-07'), /canonical UTC millisecond/)
  assert.throws(() => productionMaintenanceDueQueue(createSeedProduction(), 'not-a-date'), /canonical UTC millisecond/)

  // productionWorkingSamplePackId: empty state → null (no sample events).
  assert.equal(productionWorkingSamplePackId(createSeedProduction()), null)
  assert.equal(productionWorkingSamplePackId(createEmptyProduction()), null)

  // An installed sample state → the sampleId (== pack.id) used during installation.
  const pack = plantIndustryPacks[0]
  const withSample = installedSample(pack)
  assert.equal(productionWorkingSamplePackId(withSample), pack.id)

  // After appending guided activity the pack id is still readable.
  const withActivity = demoActivity(pack)
  assert.equal(productionWorkingSamplePackId(withActivity), pack.id)
})

test('format functions produce structured text from shift handoff, genealogy, and recall trace', () => {
  const pack = plantIndustryPacks[0]
  const state = demoActivity(pack)
  const jobId = state.jobs[0].id
  const proof = (actionId, at) => ({
    actionId,
    capturedAt: at,
    actor: 'Shift operator',
    reason: 'Format test.',
    evidenceReference: 'FMT-LOG-001',
  })

  // Build supporting state for genealogy and recall.
  const withMaterial = recordProductionMaterialConsumption(
    state, jobId, pack.setup.materialId, 'LOT-FMT-001', 10, pack.setup.materialUnit,
    SHIFT_REF, proof('ACT-FMT-MAT-001', `${PLANNING_DAY}T09:00:00.000Z`),
  )
  assert.ok(withMaterial)
  const withOutput = recordProductionOutput(withMaterial, jobId, 8, SHIFT_REF, proof('ACT-FMT-OUT-001', `${PLANNING_DAY}T09:30:00.000Z`))
  assert.ok(withOutput)

  // formatProductionShiftHandoff: produces the expected section headers.
  const handoff = buildProductionShiftHandoff(state, SHIFT_REF)
  assert.ok(handoff)
  const handoffText = formatProductionShiftHandoff(handoff)
  assert.ok(typeof handoffText === 'string' && handoffText.length > 0)
  assert.ok(handoffText.startsWith('Plant shift handoff —'), 'must open with the expected header')
  assert.ok(handoffText.includes(SHIFT_REF), 'must include the shift reference')
  assert.ok(handoffText.includes('Shift entries'), 'must include shift entries section')

  // productionShiftCloseSourceDigest: starts with sha256:, stable for the same handoff.
  const digest = productionShiftCloseSourceDigest(handoff)
  assert.ok(digest.startsWith('sha256:'))
  assert.equal(productionShiftCloseSourceDigest(handoff), digest, 'digest must be deterministic')

  // formatProductionBatchGenealogy: valid JSON that contains the job id.
  const genealogy = buildProductionBatchGenealogy(withOutput, jobId)
  assert.ok(genealogy)
  const genealogyText = formatProductionBatchGenealogy(genealogy)
  assert.ok(typeof genealogyText === 'string' && genealogyText.trim().length > 0)
  const genealogyParsed = JSON.parse(genealogyText)
  assert.equal(genealogyParsed.job.id, jobId)

  // formatProductionRecallTrace: valid JSON that includes the queried lot id.
  const trace = buildProductionRecallTrace(withMaterial, 'LOT-FMT-001')
  assert.ok(trace)
  const traceText = formatProductionRecallTrace(trace)
  assert.ok(typeof traceText === 'string' && traceText.trim().length > 0)
  const traceParsed = JSON.parse(traceText)
  assert.ok(traceParsed.query)
})

test('productionShiftOutput, productionStateCanonical, productionDowntimeIntervals, productionMaintenanceRecords, productionJobPlanSourceDigest, and productionMaintenanceFindingSource behave correctly', () => {
  const seed = createSeedProduction()
  const empty = createEmptyProduction()

  // productionShiftOutput: invalid ref and empty events both return zero output.
  const zeroOut = { goodUnits: 0, scrapUnits: 0, entryCount: 0 }
  assert.deepEqual(productionShiftOutput(seed, 'SHIFT-001'), zeroOut)
  assert.deepEqual(productionShiftOutput(seed, 'x'.repeat(81)), zeroOut)
  assert.deepEqual(productionShiftOutput(empty, ''), zeroOut)

  // productionStateCanonical: returns a string and is deterministic.
  const canonical = productionStateCanonical(seed)
  assert.equal(typeof canonical, 'string')
  assert.ok(canonical.length > 0)
  assert.equal(productionStateCanonical(seed), canonical)
  assert.notEqual(productionStateCanonical(empty), canonical)

  // productionDowntimeIntervals: returns empty array when no events recorded.
  assert.deepEqual(productionDowntimeIntervals(seed), [])
  assert.deepEqual(productionDowntimeIntervals(empty), [])

  // productionMaintenanceRecords: returns empty array when no events recorded.
  assert.deepEqual(productionMaintenanceRecords(seed), [])
  assert.deepEqual(productionMaintenanceRecords(empty), [])

  // productionJobPlanSourceDigest: returns a deterministic sha256 string.
  const job = seed.jobs[0]
  assert.ok(job)
  const digest = productionJobPlanSourceDigest('plant:local-sample', job)
  assert.ok(digest.startsWith('sha256:'))
  assert.equal(productionJobPlanSourceDigest('plant:local-sample', job), digest)
  assert.notEqual(productionJobPlanSourceDigest('plant:other-scope', job), digest)

  // productionMaintenanceFindingSource: returns null when no matching maintenance record.
  assert.equal(productionMaintenanceFindingSource(empty, ''), null)
  assert.equal(productionMaintenanceFindingSource(seed, 'ACT-NO-SUCH-RECORD'), null)
})

test('productionIssueSeverities, productionJobPriorities, productionMachineStates, productionMaterialUnits, productionQualityCauseCategories, and productionWorkspaceCanWrite are correct', () => {
  // productionIssueSeverities: 4 ordered severity levels.
  assert.deepEqual(productionIssueSeverities, ['critical', 'high', 'medium', 'low'])

  // productionJobPriorities: 3 priority levels.
  assert.deepEqual(productionJobPriorities, ['urgent', 'normal', 'low'])

  // productionMachineStates: 3 machine states.
  assert.deepEqual(productionMachineStates, ['running', 'attention', 'stopped'])

  // productionMaterialUnits: standard set of measurement units.
  assert.ok(productionMaterialUnits.includes('kg'))
  assert.ok(productionMaterialUnits.includes('pcs'))
  assert.ok(productionMaterialUnits.length >= 6)

  // productionQualityCauseCategories: classic 6M categories.
  assert.ok(productionQualityCauseCategories.includes('material'))
  assert.ok(productionQualityCauseCategories.includes('machine'))
  assert.equal(productionQualityCauseCategories.length, 6)

  // productionWorkspaceCanWrite: returns false without browser storage and lock manager.
  assert.equal(productionWorkspaceCanWrite(undefined, undefined), false)
  // No storage → false.
  assert.equal(productionWorkspaceCanWrite(null, undefined), false)
})

test('currentProductionShiftClose and currentProductionShiftCloseEvidence return null when no eligible event exists', () => {
  // Empty production has no events → both return null.
  assert.equal(currentProductionShiftClose(createEmptyProduction()), null)
  assert.equal(currentProductionShiftCloseEvidence(createEmptyProduction()), null)

  // Seed production has events but none of kind 'shift_closed' as the first event.
  const seed = createSeedProduction()
  assert.equal(currentProductionShiftClose(seed), null)
  assert.equal(currentProductionShiftCloseEvidence(seed), null)
})

test('production workspace schema constants have the correct values', () => {
  assert.equal(PRODUCTION_WORKSPACE_SCHEMA, 'supermega.production.workspace.v2')
  assert.equal(PRODUCTION_KEY, 'supermega.production.workspace.v2')
  assert.ok(Array.isArray(LEGACY_PRODUCTION_KEYS))
  assert.ok(LEGACY_PRODUCTION_KEYS.length >= 2)
  assert.ok(LEGACY_PRODUCTION_KEYS.includes('supermega.production.workspace.v1'))
  assert.equal(PRODUCTION_LOCK, 'supermega-production-workspace-v2')
  assert.equal(PRODUCTION_SHOP_DEMAND_SOURCE_CONTRACT, 'supermega.production.shop-demand-source.v1')
  assert.equal(PRODUCTION_BATCH_GENEALOGY_SCHEMA, 'supermega.production.batch-genealogy.v1')
  assert.equal(PRODUCTION_RECALL_TRACE_SCHEMA, 'supermega.production.recall-trace.v1')
})

test('normalizeProduction accepts a v2 workspace and rejects invalid input', () => {
  // Valid v2 workspace is returned as a validated ProductionState.
  const empty = createEmptyProduction()
  const normalized = normalizeProduction(empty)
  assert.equal(normalized.schema, PRODUCTION_WORKSPACE_SCHEMA)
  assert.deepEqual(normalized.jobs, [])

  // null is not a record → migrateLegacyProduction throws.
  assert.throws(() => normalizeProduction(null))
  // {} has no jobs/issues/machines arrays → migrateLegacyProduction throws.
  assert.throws(() => normalizeProduction({}))
})

// ==============================================================================================
// The browser-local (signed-out) Plant provisioning lane, executed end to end.
//
// Everything above drives the pure constructors -- installProductionWorkingSampleJobs and
// appendGuidedSampleProductionActivity -- with a hand-built job list. This block drives the REAL
// provisioner through the REAL write boundary: provisionLocalPlantWorkingSample ->
// mutateProductionWorkingSample -> window.localStorage. That is the lane a signed-out owner
// actually gets from Plant setup, and it is the thing most likely to break silently while the
// managed lane is being made honest.
//
// Context: startGuidedWorkspace used to run this provisioner for EVERY caller, managed or not.
// mutateProductionWorkingSample is window.localStorage, which a managed Plant never reads, so a
// signed-in owner was told her jobs, floor and line were ready while the company workspace stayed
// at version 0 and ProductionPage rendered 'managed-unprovisioned'. Measured before the guard was
// added: disposition 'installed' with ZERO fetch calls, across all five plant packs. The guard is
// pinned in tools/verify_app_build.mjs. What is asserted HERE is the other half -- that adding it
// changed nothing whatsoever for the signed-out owner. These assertions were run against unfixed
// origin/main first and were already green, so they lock existing behaviour rather than
// describing new behaviour.
import { provisionLocalPlantWorkingSample } from '../showroom/src/core/product-onboarding-runtime.ts'
import { clientImportTemplate, createClientImportPreview } from '../showroom/src/core/client-onboarding.ts'

test('the browser-local lane still installs every plant pack through the real write boundary', async () => {
  const fetchCalls = []
  const realFetch = globalThis.fetch
  const realWindow = globalThis.window
  const realLocalStorage = globalThis.localStorage
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  globalThis.fetch = async (...args) => {
    fetchCalls.push(String(args[0]))
    throw new Error('the browser-local onboarding lane must not make network calls')
  }
  // Node's own `navigator` global is a read-only accessor (Node 21+), so it cannot be assigned.
  Object.defineProperty(globalThis, 'navigator', {
    value: { locks: { request: async (_name, _options, callback) => callback() } },
    configurable: true,
  })

  try {
    assert.equal(plantIndustryPacks.length, 5, 'all five shipped plant packs are present')

    for (const pack of plantIndustryPacks) {
      // mutateProductionWorkspace refuses to write into a store that was never initialized, so
      // the seed goes in first -- exactly as loadProductionWorkspace does in the browser.
      const map = new Map([[PRODUCTION_KEY, JSON.stringify(createSeedProduction())]])
      const store = {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, value) },
        removeItem: (key) => { map.delete(key) },
      }
      globalThis.window = { localStorage: store }
      globalThis.localStorage = store

      const disposition = await provisionLocalPlantWorkingSample(pack.id, '', 'Daw Hla Myaing')
      assert.equal(disposition, 'installed', `${pack.id}: a signed-out install still reports 'installed'`)

      const state = validateProductionState(JSON.parse(map.get(PRODUCTION_KEY)))
      assert.equal(productionWorkingSamplePackId(state), pack.id, `${pack.id}: the installed sample is stamped with this pack`)
      // The jobs are DERIVED from the pack's own sample CSV -- the same source the provisioner
      // reads -- rather than transcribed here, so this stays a statement about the lane and not
      // about today's sample content. A pack whose CSV changes still has to land its own rows.
      const preview = await createClientImportPreview(
        clientImportTemplate('production', '', { plantIndustryPackId: pack.id }),
        'production', undefined, `sample-${pack.id}.csv`, '',
      )
      assert.ok(preview.rows.length > 0, `${pack.id}: the pack ships a sample job CSV`)
      assert.equal(state.jobs.length, preview.rows.length, `${pack.id}: every sample row landed as a job`)
      assert.equal(new Set(state.jobs.map((job) => job.id)).size, state.jobs.length, `${pack.id}: the jobs are distinct`)
      for (const row of preview.rows) {
        const job = state.jobs.find((candidate) => candidate.id === row.values.jobCode)
        assert.ok(job, `${pack.id}: sample job ${row.values.jobCode} landed`)
        assert.equal(job.line, row.values.line, `${pack.id}: ${job.id} kept the pack's own line`)
        assert.equal(job.product, row.values.productName, `${pack.id}: ${job.id} kept the pack's own product`)
        assert.equal(job.target, Number(row.values.targetQuantity), `${pack.id}: ${job.id} kept its target`)
        assert.equal(job.output, 0, `${pack.id}: ${job.id} starts with no output recorded against it`)
        assert.equal(job.owner, 'Daw Hla Myaing', `${pack.id}: ${job.id} carries the owner setup was given`)
      }
      // The floor and the opening issue are what turn a job list into a plant the owner can see
      // running. Generic packs install onto the SHARED SEED floor -- the pack setup carries no
      // machines or opening issue of its own -- so those are asserted as present, not as the
      // pack's own. Per-trade floors belong to plant BUSINESS templates, whose provisioning path
      // hands installProductionWorkingSampleJobs its own machines and issue.
      assert.ok(state.machines.length > 0, `${pack.id}: the sample floor still lands`)
      assert.ok(state.issues.length > 0, `${pack.id}: the opening issue still lands`)
      assert.equal(state.events.length, state.jobs.length, `${pack.id}: the install is evidenced once per job`)
      assert.ok(isGuidedSampleProduction(state), `${pack.id}: the installed workspace is still a replaceable guided sample`)
      // Measured, and pinned deliberately: the GENERIC pack path installs jobs and stops. It does
      // not call appendGuidedSampleProductionActivity -- only the plant business-template path
      // does (covered by tools/test_plant_business_templates.mjs). A signed-out owner on a generic
      // pack gets jobs to run, not a shift already part-run, and that distinction is the lane's
      // real behaviour rather than an oversight to paper over here.
      assert.equal(
        hasGuidedSampleProductionActivity(state), false,
        `${pack.id}: the generic pack path installs jobs without pre-running a shift`,
      )
    }

    assert.equal(fetchCalls.length, 0, `the browser-local lane made no network calls, got ${JSON.stringify(fetchCalls)}`)
  } finally {
    globalThis.fetch = realFetch
    globalThis.window = realWindow
    globalThis.localStorage = realLocalStorage
    if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator)
  }
})
