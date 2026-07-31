import assert from 'node:assert/strict'
import test from 'node:test'
import { qualifyVisionPilot, renderVisionPilotProposal } from './create_vision_pilot_proposal.mjs'

const qualifiedLead = {
  company: 'Test Company',
  workflow: 'Review an owned application screen before release',
  platform: 'windows',
  stateCount: 6,
  screenshotRights: true,
  humanFallback: true,
  observationOnly: true,
  weeklyRuns: 10,
  minutesPerRun: 30,
  laborHourlyUsd: 8,
}

test('qualifies a bounded observation-only Vision pilot and calculates transparent value', () => {
  const result = qualifyVisionPilot(qualifiedLead)
  assert.equal(result.qualified, true)
  assert.equal(result.priceUsd, 1_500)
  assert.equal(result.annualTimeValueUsd, 2_080)
  assert.deepEqual(result.blockers, [])
})

test('fails closed when screenshot rights, fallback, or observation-only scope is absent', () => {
  const result = qualifyVisionPilot({ ...qualifiedLead, screenshotRights: false, humanFallback: false, observationOnly: false })
  assert.equal(result.qualified, false)
  assert.deepEqual(result.blockers, [
    'written_screenshot_rights_required',
    'human_fallback_required',
    'observation_only_first_pilot_required',
  ])
  assert.match(renderVisionPilotProposal({ ...qualifiedLead, screenshotRights: false }), /NOT READY TO OFFER/)
})

test('prices bounded extra platform and state scope without exceeding the founding range', () => {
  const result = qualifyVisionPilot({ ...qualifiedLead, platform: 'both', stateCount: 12 })
  assert.equal(result.priceUsd, 3_500)
  assert.match(renderVisionPilotProposal({ ...qualifiedLead, platform: 'both', stateCount: 12 }), /USD 3,500/)
})

test('rejects oversized or malformed leads', () => {
  assert.throws(() => qualifyVisionPilot({ ...qualifiedLead, stateCount: 13 }), /founding_pilot_limit/)
  assert.throws(() => qualifyVisionPilot({ ...qualifiedLead, platform: 'web' }), /platform_must_be/)
  assert.throws(() => qualifyVisionPilot({ ...qualifiedLead, workflow: '' }), /workflow_required/)
})
