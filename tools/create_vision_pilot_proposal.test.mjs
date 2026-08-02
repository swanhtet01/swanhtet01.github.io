import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { qualifyVisionPilot, renderVisionPilotProposal, visionInputFromContactEvent } from './create_vision_pilot_proposal.mjs'

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

test('converts a sanitized SuperMega Vision contact event directly into proposal input', () => {
  const input = visionInputFromContactEvent({
    event: 'supermega.contact.created',
    record: {
      company: 'Test Company',
      workflow: 'vision',
      goal: 'Review an owned application screen before release',
      raw: {
        vision: {
          platform: 'windows', state_count: 6, weekly_runs: 10, minutes_per_run: 30, labor_hourly_usd: 8,
          screenshot_rights: true, human_fallback: true, observation_only: true,
        },
      },
    },
  })
  assert.deepEqual(input, qualifiedLead)
  assert.match(renderVisionPilotProposal(input), /QUALIFIED FOR OWNER REVIEW/)
  assert.throws(() => visionInputFromContactEvent({ event: 'supermega.contact.created', record: { workflow: 'shop' } }), /vision_contact_event_required/)
})

test('CLI creates a sales-ready draft directly from a contact event file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-vision-proposal-'))
  const inputPath = join(directory, 'contact-event.json')
  const outputPath = join(directory, 'proposal.md')
  try {
    await writeFile(inputPath, JSON.stringify({
      event: 'supermega.contact.created',
      record: {
        company: 'Test Company', workflow: 'vision', goal: 'Review an owned application screen before release',
        raw: { vision: { platform: 'windows', state_count: 6, weekly_runs: 10, minutes_per_run: 30, labor_hourly_usd: 8, screenshot_rights: true, human_fallback: true, observation_only: true } },
      },
    }))
    const result = spawnSync(process.execPath, [resolve('tools/create_vision_pilot_proposal.mjs'), '--contact-event', inputPath, '--output', outputPath], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /supermega\.vision\.pilot_proposal\.v1/)
    assert.match(await readFile(outputPath, 'utf8'), /Fixed founding-pilot price: \*\*USD 1,500\*\*/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
