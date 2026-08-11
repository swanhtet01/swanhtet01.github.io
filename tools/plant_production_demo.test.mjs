import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUIDED_SAMPLE_PRODUCTION_ACTOR,
  PRODUCTION_QUALITY_CAPA_SCHEMA,
  appendGuidedSampleProductionActivity,
  buildProductionBatchGenealogy,
  buildProductionQualityCorrectiveAction,
  buildProductionRecallTrace,
  createEmptyProduction,
  createSeedProduction,
  hasGuidedSampleProductionActivity,
  installProductionWorkingSampleJobs,
  isGuidedSampleProduction,
  placeProductionQualityHold,
  productionShiftOutput,
  openProductionIssue,
  recordProductionMaterialConsumption,
  recordProductionOutput,
  releaseProductionQualityHold,
  resolveProductionIssue,
  recordProductionMachineState,
  validateProductionState,
} from '../showroom/src/core/production-workspace.ts'
import { plantIndustryPacks } from '../showroom/src/core/plant-industry-packs.ts'

const PLANNING_DAY = '2026-08-07'
const INSTALLED_AT = `${PLANNING_DAY}T01:00:00.000Z`
const SHIFT_REF = `${PLANNING_DAY} Day`

function packFloor(pack) {
  return {
    machines: pack.setup.machines.map((machine) => ({ ...machine })),
    issue: { ...pack.setup.issue },
  }
}

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
    ...packFloor(pack),
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

// A sewing floor showing a mixer and a press, reporting temperature drift, is
// visibly not the client's factory. The equipment travels with the pack.
test('every pack installs its own equipment and opening issue', () => {
  const seededNames = new Set()
  for (const pack of plantIndustryPacks) {
    const state = installedSample(pack)
    assert.deepEqual(
      state.machines.map((machine) => ({ id: machine.id, name: machine.name, state: machine.state })),
      pack.setup.machines.map((machine) => ({ ...machine })),
      `${pack.id} must install its own equipment`,
    )
    const issue = state.issues.find((candidate) => candidate.kind === 'quality')
    assert.ok(issue, `${pack.id} must keep an opening quality issue`)
    assert.equal(issue.area, pack.setup.issue.area)
    assert.equal(issue.summary, pack.setup.issue.summary)
    // The issue names a real place on that floor, so the area has to be one of
    // the machines or lines the same pack just installed.
    const floorNames = new Set([...pack.setup.machines.map((machine) => machine.name), pack.setup.workCentreName])
    assert.ok(floorNames.has(issue.area), `${pack.id} issue area ${issue.area} is not on its own floor`)
    const signature = JSON.stringify(pack.setup.machines)
    assert.ok(!seededNames.has(signature), `${pack.id} reuses another pack's equipment`)
    seededNames.add(signature)
  }
})

test('switching packs replaces the previous floor instead of refusing', () => {
  const [first, second] = plantIndustryPacks
  const installed = installedSample(first)
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
    ...packFloor(second),
  })
  assert.ok(switched, 'a pure sample must accept a different pack')
  validateProductionState(switched)
  assert.deepEqual(
    switched.machines.map((machine) => machine.name),
    second.setup.machines.map((machine) => machine.name),
  )
  assert.equal(switched.issues.find((issue) => issue.kind === 'quality').area, second.setup.issue.area)
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
    ...packFloor(pack),
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
