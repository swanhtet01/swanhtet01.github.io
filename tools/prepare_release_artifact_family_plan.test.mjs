import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT,
  buildReleaseArtifactFamilyPlan,
  runSelfTest,
  validateReleaseArtifactFamilyPlan,
} from './prepare_release_artifact_family_plan.mjs'

const candidateHead = 'a'.repeat(40)

function plan(overrides = {}) {
  return buildReleaseArtifactFamilyPlan({
    version: 'v167',
    date: '20260827',
    artifactsDir: 'artifacts',
    candidateHead,
    remoteReviewBranchCommit: 'b'.repeat(40),
    remoteMainCommit: 'c'.repeat(40),
    ...overrides,
  })
}

function resign(packet) {
  const copy = { ...packet }
  delete copy.digest
  packet.digest = `sha256:${createHash('sha256').update(JSON.stringify(copy).replace(/\r\n?/g, '\n')).digest('hex')}`
  return packet
}

test('builds a local-only release artifact family command plan', () => {
  const packet = plan()
  assert.equal(packet.contract, RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT)
  assert.equal(packet.mode, 'plan_only_no_external_write')
  assert.equal(packet.candidate.head, candidateHead)
  assert.equal(packet.commands.length, 20)
  assert.equal(packet.commands.at(0).id, 'release_handoff')
  assert.equal(packet.commands.at(-1).id, 'release_artifact_family_verify')
  assert.equal(validateReleaseArtifactFamilyPlan(packet), packet)
})

test('pins operator board to the GitHub protection snapshot', () => {
  const packet = plan()
  const operator = packet.commands.find((entry) => entry.id === 'operator_board')
  assert.ok(operator.command.includes('--github-protection-snapshot'))

  const tampered = structuredClone(packet)
  const tamperedOperator = tampered.commands.find((entry) => entry.id === 'operator_board')
  const index = tamperedOperator.command.indexOf('--github-protection-snapshot')
  tamperedOperator.command.splice(index, 2)
  resign(tampered)
  assert.throws(
    () => validateReleaseArtifactFamilyPlan(tampered),
    /release_artifact_family_plan_operator_snapshot_missing/,
  )
})

test('uses launch-gate evidence for Day 0 readiness without reopening intake packet input', () => {
  const packet = plan()
  const launchGate = packet.commands.find((entry) => entry.id === 'shop_launch_gate_report')
  assert.ok(launchGate.command.includes('--intake-packet'))
  assert.equal(launchGate.command.includes('--baseline-template'), false)
  assert.equal(launchGate.command.includes('--baseline-worksheet'), false)

  const day0 = packet.commands.find((entry) => entry.id === 'shop_day0_readiness')
  assert.ok(day0.command.includes('--launch-gate-report'))
  assert.equal(day0.command.includes('--intake-packet'), false)

  const tampered = structuredClone(packet)
  const tamperedDay0 = tampered.commands.find((entry) => entry.id === 'shop_day0_readiness')
  tamperedDay0.command.push('--intake-packet', packet.paths.shopPrivateIntakeJson)
  resign(tampered)
  assert.throws(
    () => validateReleaseArtifactFamilyPlan(tampered),
    /release_artifact_family_plan_day0_launch_gate_binding_invalid/,
  )
})

test('rejects private baseline template input on the launch-gate command', () => {
  const packet = plan()
  const tampered = structuredClone(packet)
  const launchGate = tampered.commands.find((entry) => entry.id === 'shop_launch_gate_report')
  launchGate.command.splice(launchGate.command.indexOf('--output'), 0, '--baseline-template', packet.paths.shopBaselineTemplate)
  resign(tampered)
  assert.throws(
    () => validateReleaseArtifactFamilyPlan(tampered),
    /release_artifact_family_plan_launch_gate_input_invalid/,
  )
})

test('rejects external write commands in the artifact preparation plan', () => {
  const packet = plan()
  const tampered = structuredClone(packet)
  tampered.commands.find((entry) => entry.id === 'review_branch_push_plan').command = ['git', 'push', 'origin', candidateHead]
  resign(tampered)
  assert.throws(
    () => validateReleaseArtifactFamilyPlan(tampered),
    /release_artifact_family_plan_command_invalid:review_branch_push_plan/,
  )
})

test('self-test covers the planner invariants', () => {
  const result = runSelfTest()
  assert.equal(result.ok, true)
  assert.deepEqual(result.failedChecks, [])
  assert.equal(result.externalWritesPerformed, false)
})
