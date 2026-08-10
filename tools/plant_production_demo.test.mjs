import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUIDED_SAMPLE_PRODUCTION_ACTOR,
  appendGuidedSampleProductionActivity,
  createEmptyProduction,
  createSeedProduction,
  hasGuidedSampleProductionActivity,
  installProductionWorkingSampleJobs,
  isGuidedSampleProduction,
  productionShiftOutput,
  openProductionIssue,
  resolveProductionIssue,
  recordProductionOutput,
  validateProductionState,
} from '../showroom/src/core/production-workspace.ts'
import { plantIndustryPacks } from '../showroom/src/core/plant-industry-packs.ts'

const PLANNING_DAY = '2026-08-07'
const INSTALLED_AT = `${PLANNING_DAY}T01:00:00.000Z`
const SHIFT_REF = `${PLANNING_DAY} Day`

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
