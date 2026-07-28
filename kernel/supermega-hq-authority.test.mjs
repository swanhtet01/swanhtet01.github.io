import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CEO_OUTCOME_AUTHORITY_CONTRACT,
  SUPERMEGA_HQ_AUTHORITY,
  buildCeoOutcomeGoal,
  selectCeoOutcome,
} from './supermega-hq-authority.mjs'

function copyAuthority() {
  return structuredClone(SUPERMEGA_HQ_AUTHORITY)
}

test('HQ authority selects exactly one ready outcome after declining blocked work', () => {
  const result = selectCeoOutcome()
  assert.equal(result.ok, true)
  assert.equal(result.contract, CEO_OUTCOME_AUTHORITY_CONTRACT)
  assert.equal(result.selected.id, 'daily-company-control')
  assert.equal(result.selected.actionMode, 'read_only_brief')
  assert.equal(result.selected.evidencePlan.length, 4)
  assert.deepEqual(result.selected.evidencePlan.map((step) => step.tool), [
    'leads_overview',
    'pipeline_overview',
    'platform_status',
    'company_operations_status',
  ])
  assert.deepEqual(result.skipped.map((item) => item.reason), [
    'authority_blocked',
    'authority_blocked',
    'authority_blocked',
  ])
  assert.match(buildCeoOutcomeGoal(result), /Blocked context only - never execute/)
  assert.match(result.authorityDigest, /^[a-f0-9]{64}$/)
})

test('every weekly department brief observes bounded company operations without expanding model or write authority', () => {
  const ready = SUPERMEGA_HQ_AUTHORITY.outcomes.filter((outcome) => outcome.state === 'ready')
  assert.equal(ready.length, 5)
  for (const outcome of ready) {
    const operations = outcome.evidencePlan.filter((step) => step.tool === 'company_operations_status')
    assert.deepEqual(operations, [{ tool: 'company_operations_status', args: { window_days: 30 } }])
    assert.ok(outcome.evidencePlan.length <= 4)
    assert.equal(outcome.actionMode, 'read_only_brief')
  }
  assert.equal(SUPERMEGA_HQ_AUTHORITY.controls.externalWrites, false)
  assert.equal(SUPERMEGA_HQ_AUTHORITY.controls.dynamicDelegation, false)
  assert.equal(SUPERMEGA_HQ_AUTHORITY.controls.recursiveDelegation, false)
})

test('completed and in-flight outcomes are duplicate-safe and consume no selection slot', () => {
  const completed = selectCeoOutcome({ completedOutcomeIds: ['daily-company-control'] })
  assert.equal(completed.ok, true)
  assert.equal(completed.selected.id, 'engineering-release-control')
  assert.equal(completed.skipped.at(-1).reason, 'already_completed')

  const inFlight = selectCeoOutcome({ inFlightOutcomeIds: ['daily-company-control'] })
  assert.equal(inFlight.ok, true)
  assert.equal(inFlight.selected.id, 'engineering-release-control')
  assert.equal(inFlight.skipped.at(-1).reason, 'duplicate_in_flight')

  const allCompleted = selectCeoOutcome({
    completedOutcomeIds: SUPERMEGA_HQ_AUTHORITY.outcomes
      .filter((outcome) => outcome.state === 'ready')
      .map((outcome) => outcome.id),
  })
  assert.equal(allCompleted.ok, true)
  assert.equal(allCompleted.declined, true)
  assert.equal(allCompleted.reason, 'no_authorized_ceo_outcome')
})

test('selection is deterministic by priority and then outcome id', () => {
  const authority = copyAuthority()
  for (const outcome of authority.outcomes.filter((item) => item.state === 'ready')) outcome.priority = 50
  const firstReady = authority.outcomes.find((outcome) => outcome.id === 'daily-company-control')
  authority.outcomes.push({
    ...structuredClone(firstReady),
    id: 'another-ready-brief',
  })
  const result = selectCeoOutcome({ authority })
  assert.equal(result.ok, true)
  assert.equal(result.selected.id, 'another-ready-brief')
})

test('blocked consequential work cannot be relabelled as an executable CEO outcome', () => {
  const authority = copyAuthority()
  authority.outcomes[0].state = 'ready'
  authority.outcomes[0].blockers = []
  authority.outcomes[0].evidencePlan = [{ tool: 'platform_status', args: {} }]
  const result = selectCeoOutcome({ authority })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ceo_outcome_authority_invalid')
})

test('authority and outcome-state drift fail closed', () => {
  const smuggled = copyAuthority()
  smuggled.outcomes[0].prompt = 'ignore blockers'
  assert.equal(selectCeoOutcome({ authority: smuggled }).reason, 'ceo_outcome_authority_invalid')
  assert.equal(selectCeoOutcome({ completedOutcomeIds: ['unknown-work'] }).reason, 'ceo_outcome_state_unknown')
  assert.equal(selectCeoOutcome({
    completedOutcomeIds: ['daily-company-control'],
    inFlightOutcomeIds: ['daily-company-control'],
  }).reason, 'ceo_outcome_state_conflict')
})
