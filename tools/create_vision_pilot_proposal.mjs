import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const allowedPlatforms = new Set(['windows', 'android', 'both'])

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_required`)
  return value.trim()
}

function positiveNumber(value, field) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field}_must_be_positive`)
  return parsed
}

export function qualifyVisionPilot(input) {
  const company = requiredText(input.company, 'company')
  const workflow = requiredText(input.workflow, 'workflow')
  const platform = requiredText(input.platform, 'platform').toLowerCase()
  if (!allowedPlatforms.has(platform)) throw new Error('platform_must_be_windows_android_or_both')

  const stateCount = Math.ceil(positiveNumber(input.stateCount, 'state_count'))
  if (stateCount > 12) throw new Error('state_count_exceeds_founding_pilot_limit')

  const blockers = []
  if (input.screenshotRights !== true) blockers.push('written_screenshot_rights_required')
  if (input.humanFallback !== true) blockers.push('human_fallback_required')
  if (input.observationOnly !== true) blockers.push('observation_only_first_pilot_required')

  let priceUsd = 1_500
  if (stateCount > 6) priceUsd += 750
  if (platform === 'both') priceUsd += 750
  if (platform === 'android' || platform === 'both') priceUsd += 500
  priceUsd = Math.min(priceUsd, 4_000)

  const weeklyRuns = Number(input.weeklyRuns || 0)
  const minutesPerRun = Number(input.minutesPerRun || 0)
  const laborHourlyUsd = Number(input.laborHourlyUsd || 0)
  const annualTimeValueUsd = weeklyRuns > 0 && minutesPerRun > 0 && laborHourlyUsd > 0
    ? Math.round(weeklyRuns * minutesPerRun / 60 * 52 * laborHourlyUsd)
    : null

  return {
    contract: 'supermega.vision.founding_pilot_qualification.v1',
    company,
    workflow,
    platform,
    stateCount,
    qualified: blockers.length === 0,
    blockers,
    priceUsd,
    durationWeeks: 4,
    annualTimeValueUsd,
  }
}

export function visionInputFromContactEvent(event) {
  if (!event || event.event !== 'supermega.contact.created' || !event.record || event.record.workflow !== 'vision') {
    throw new Error('vision_contact_event_required')
  }
  const vision = event.record.raw?.vision
  if (!vision || typeof vision !== 'object' || Array.isArray(vision)) throw new Error('vision_contact_qualification_missing')
  return {
    company: event.record.company,
    workflow: event.record.goal,
    platform: vision.platform,
    stateCount: vision.state_count,
    screenshotRights: vision.screenshot_rights,
    humanFallback: vision.human_fallback,
    observationOnly: vision.observation_only,
    weeklyRuns: vision.weekly_runs,
    minutesPerRun: vision.minutes_per_run,
    laborHourlyUsd: vision.labor_hourly_usd,
  }
}

export function renderVisionPilotProposal(input) {
  const result = qualifyVisionPilot(input)
  const platformLabel = result.platform === 'both' ? 'Windows and Android' : result.platform[0].toUpperCase() + result.platform.slice(1)
  const valueLine = result.annualTimeValueUsd === null
    ? 'Time-value estimate: pending buyer workload and labor inputs.'
    : `Time-value estimate: USD ${result.annualTimeValueUsd.toLocaleString('en-US')} per year before adoption and error adjustments; this is not a savings guarantee.`
  const gateLines = result.blockers.length
    ? result.blockers.map((blocker) => `- BLOCKED: ${blocker.replaceAll('_', ' ')}`).join('\n')
    : '- Screenshot rights confirmed.\n- Human fallback confirmed.\n- First pilot is observation-only.'

  return `# SuperMega Vision founding pilot — ${result.company}

Status: ${result.qualified ? 'QUALIFIED FOR OWNER REVIEW' : 'NOT READY TO OFFER'}

## Buyer workflow

${result.workflow}

## Four-week deliverable

- One ${platformLabel} workflow with up to ${result.stateCount} approved visual states.
- Local capture and annotation workspace using buyer-authorized screenshots.
- Locally trained recognition model with held-out test evidence.
- Observation-only pilot with confidence thresholds, abstention, and human fallback.
- Reproducible model, evidence receipt, operator notes, and acceptance report.

## Acceptance test

- Buyer approves the state definitions and held-out test set before final measurement.
- Report accuracy, false-positive rate, abstention rate, and device latency; do not hide failed cases.
- No automatic click, message, payment, credential handling, surveillance, or consequential action.
- Physical Android performance is accepted only after testing on the buyer's approved device.

## Commercial draft

- Fixed founding-pilot price: **USD ${result.priceUsd.toLocaleString('en-US')}**.
- Duration: **${result.durationWeeks} weeks** after approved screenshots and workflow access are available.
- Payment and tax terms require owner confirmation before this proposal is sent.
- Additional workflows, states beyond 12, production automation, and hosted operation are separate scope.
- ${valueLine}

## Start gates

${gateLines}

This document is a local draft. It does not contact the buyer, accept payment, or authorize external work.
`
}

async function main() {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf('--input')
  const contactEventIndex = args.indexOf('--contact-event')
  const outputIndex = args.indexOf('--output')
  if (args.includes('--example')) {
    process.stdout.write(`${JSON.stringify({
      company: 'Example Company', workflow: 'Review one owned application screen before release', platform: 'windows', stateCount: 6,
      screenshotRights: true, humanFallback: true, observationOnly: true, weeklyRuns: 10, minutesPerRun: 30, laborHourlyUsd: 8,
    }, null, 2)}\n`)
    return
  }
  const sourceIndex = contactEventIndex >= 0 ? contactEventIndex : inputIndex
  if (sourceIndex < 0 || !args[sourceIndex + 1] || outputIndex < 0 || !args[outputIndex + 1]) {
    throw new Error('usage: node tools/create_vision_pilot_proposal.mjs (--input lead.json | --contact-event event.json) --output proposal.md')
  }
  const inputPath = resolve(args[sourceIndex + 1])
  const outputPath = resolve(args[outputIndex + 1])
  const source = JSON.parse(await readFile(inputPath, 'utf8'))
  const input = contactEventIndex >= 0 ? visionInputFromContactEvent(source) : source
  const proposal = renderVisionPilotProposal(input)
  await writeFile(outputPath, proposal, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(`${JSON.stringify({ ok: true, contract: 'supermega.vision.pilot_proposal.v1', output: outputPath })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`)
    process.exitCode = 1
  })
}
