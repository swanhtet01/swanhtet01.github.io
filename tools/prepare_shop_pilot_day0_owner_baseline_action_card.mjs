#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_DAY0_READINESS_CONTRACT,
  buildShopPilotDay0ReadinessPacket,
  sampleShopPilotDay0ReadinessInput,
  validateShopPilotDay0ReadinessPacket,
} from './prepare_shop_pilot_day0_readiness_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
} from './verify_shop_pilot_launch_gate.mjs'

export const SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT = 'supermega.shop-pilot-day0-owner-baseline-action-card.v1'

const BASELINE_REQUIRED_STATUSES = [
  'blocked_owner_baseline_and_intake_required',
  'blocked_owner_observed_baseline_required',
]
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SECRET_OR_PRIVATE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /[A-Za-z]:\\+[^"\n]+/,
  /(?:^|["\s])\/(?:Users|home)\/[^\s"]+/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]
const REQUIRED_FALSE_CONTROLS = [
  'localPathsIncluded',
  'rawIdentityIncluded',
  'rawPrivateNotesIncluded',
  'credentialValuesIncluded',
  'externalEffectsAllowed',
  'customerContactAllowed',
  'paymentAllowed',
  'stockMovementAllowed',
  'hostedWritesAllowed',
  'githubWritesAllowed',
  'vercelDeployAllowed',
  'supabaseWritesAllowed',
  'productionReleaseAllowed',
  'managedActivationAllowed',
]
const BASELINE_COMMANDS = [
  'npm.cmd run shop:pilot:baseline-packet -- --template "<private-baseline-input.json>" --worksheet-output "<private-baseline-worksheet.md>"',
  'npm.cmd run shop:pilot:baseline-packet -- --lint-input "<private-baseline-input.json>"',
  'npm.cmd run shop:pilot:baseline-packet -- --input "<private-baseline-input.json>" --output "<owner-safe-baseline-packet.json>" --markdown-output "<owner-safe-baseline-packet.md>"',
  'npm.cmd run shop:pilot:baseline-packet -- --verify "<owner-safe-baseline-packet.json>"',
  'npm.cmd run shop:pilot:launch-gate -- --baseline-packet "<owner-safe-baseline-packet.json>" --intake-packet "<owner-safe-intake-packet.json>" --output "<owner-safe-launch-gate-report.json>"',
  'npm.cmd run shop:pilot:launch-gate:verify -- --verify-report "<owner-safe-launch-gate-report.json>"',
  'npm.cmd run shop:pilot:day0-readiness -- --launch-gate-report "<owner-safe-launch-gate-report.json>" --release-handoff "<release-handoff.json>" --github-protection-snapshot "<github-protection-snapshot.json>" --output "<owner-safe-day0-packet.json>" --markdown-output "<owner-safe-day0-packet.md>"',
]
const NON_CLAIMS = [
  'not_production_release',
  'not_deployment_or_promotion',
  'not_managed_activation',
  'not_customer_contact_authority',
  'not_payment_or_stock_movement',
  'not_revenue_or_pilot_proof',
]
const RELEASE_CONTROL_GATE_IDS = [
  'github_main_protection',
  'review_branch_push',
  'pull_request_creation',
]
const REQUIRED_PROMOTION_ACCEPTED_RUNS = 20
const REQUIRED_PROMOTION_PILOT_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5])

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function hasPrivateOrSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(text))
}

function assertNoPrivateOrSecretShape(value, code = 'shop_pilot_day0_owner_baseline_card_private_or_secret_shape') {
  if (hasPrivateOrSecretShape(value)) fail(code)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function sourceDigest(value, code) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value)
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function releaseBlockerForGate(gateId) {
  if (gateId === 'github_main_protection') return 'github_main_protection_unverified'
  if (gateId === 'review_branch_push') return 'review_branch_push_missing'
  if (gateId === 'pull_request_creation') return 'pull_request_creation_missing'
  return null
}

function requiredFlowSummary(packet) {
  const flows = packet.ownerPrivateBaselineChecklist?.requiredFlows || []
  return flows.map((flow) => ({
    id: flow.id,
    label: flow.label,
    requiredUninterruptedRuns: flow.requiredUninterruptedRuns,
    requiredDistinctCalendarDateCount: flow.requiredDistinctCalendarDateCount ?? null,
    observedRuns: flow.observedRuns,
    uninterruptedRuns: flow.uninterruptedRuns,
    observedDistinctCalendarDateCount: flow.observedDistinctCalendarDateCount ?? null,
    accepted: flow.accepted === true,
  }))
}

function assertSafeDay0ForBaselineCard(packet) {
  validateShopPilotDay0ReadinessPacket(packet)
  if (!BASELINE_REQUIRED_STATUSES.includes(packet.status)) {
    fail('shop_pilot_day0_owner_baseline_card_not_applicable')
  }
  if (packet.ownerPrivatePreparation?.outputPolicy?.localPathsIncluded !== false
    || packet.ownerPrivatePreparation?.outputPolicy?.externalEffectsAllowed !== false
    || packet.ownerPrivateBaselineChecklist?.publicOutputAllowed?.localPaths !== false
    || packet.ownerPrivateBaselineChecklist?.publicOutputAllowed?.rawIdentity !== false
    || packet.ownerPrivateBaselineChecklist?.publicOutputAllowed?.rawNotes !== false) {
    fail('shop_pilot_day0_owner_baseline_card_day0_output_policy_invalid')
  }
  if (!packet.privateCommands?.some((command) => command.includes('--lint-input "<private-baseline-input.json>"'))) {
    fail('shop_pilot_day0_owner_baseline_card_day0_lint_command_missing')
  }
  assertNoPrivateOrSecretShape(packet)
  return packet
}

export function buildShopPilotDay0OwnerBaselineActionCard(input = {}) {
  const day0Packet = assertSafeDay0ForBaselineCard(input.day0Packet)
  const prep = day0Packet.ownerPrivatePreparation || {}
  const checklist = day0Packet.ownerPrivateBaselineChecklist || {}
  const body = {
    contract: SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    product: 'shop',
    pilotMode: 'owner_named',
    status: 'owner_observed_baseline_action_required',
    source: {
      day0Contract: SHOP_PILOT_DAY0_READINESS_CONTRACT,
      day0Digest: day0Packet.digest,
      day0Status: day0Packet.status,
      launchGateDigest: day0Packet.sourceDigests?.launchGateDigest || null,
      acceptedIntakePacketDigest: sourceDigest(prep.acceptedIntakePacketDigest, 'shop_pilot_day0_owner_baseline_card_intake_digest_invalid'),
      releaseHandoffDigest: sourceDigest(day0Packet.sourceDigests?.releaseHandoffDigest, 'shop_pilot_day0_owner_baseline_card_release_handoff_digest_invalid'),
      githubMainProtectionSnapshotDigest: sourceDigest(day0Packet.sourceDigests?.githubMainProtectionSnapshotDigest, 'shop_pilot_day0_owner_baseline_card_github_snapshot_digest_invalid'),
      releaseGateEvidenceProvided: day0Packet.releaseGate?.releaseEvidenceProvided === true,
      releaseGateCurrentGateId: day0Packet.releaseGate?.currentGateId || null,
      releaseGateCurrentBlocker: day0Packet.releaseGate?.currentBlocker || null,
      mainProtectionVerified: day0Packet.releaseGate?.mainProtectionVerified === true,
    },
    candidate: {
      branch: day0Packet.candidate?.branch || null,
      head: day0Packet.candidate?.head || null,
      clean: day0Packet.candidate?.clean === true,
      aheadOfOriginMain: day0Packet.candidate?.aheadOfOriginMain ?? null,
    },
    action: {
      id: 'capture-owner-observed-baseline',
      label: 'Capture owner-observed manual Shop baseline, lint it locally, then generate an owner-safe baseline packet',
      allowedNow: day0Packet.ownerPrivateObservationBridge?.allowedNow || 'owner_private_local_observation_only',
      privateWorkspaceRequired: true,
      safeBeforeReleaseGate: day0Packet.nextOwnerPrivateStep?.safeBeforeReleaseGate === true,
      releaseGateStillRequiredBeforePilotActivation: true,
      nextRequiredDigest: 'baseline_packet_digest',
      expectedPreflightStatus: 'baseline_input_ready',
      completionSignal: 'public_safe_baseline_packet_digest',
    },
    ownerPrivatePrepArtifacts: {
      artifactPolicy: 'digests_only_no_paths',
      baselineInputTemplate: {
        provided: prep.baselineInputTemplate?.provided === true,
        contract: prep.baselineInputTemplate?.contract || null,
        digest: sourceDigest(prep.baselineInputTemplate?.digest, 'shop_pilot_day0_owner_baseline_card_template_digest_invalid'),
        blankTemplate: prep.baselineInputTemplate?.blankTemplate === true,
      },
      baselineWorksheet: {
        provided: prep.baselineWorksheet?.provided === true,
        contract: prep.baselineWorksheet?.contract || null,
        digest: sourceDigest(prep.baselineWorksheet?.digest, 'shop_pilot_day0_owner_baseline_card_worksheet_digest_invalid'),
        blankWorksheet: prep.baselineWorksheet?.blankWorksheet === true,
      },
      localPathsIncluded: false,
      rawIdentityIncluded: false,
    },
    minimumEvidence: {
      evidenceKind: checklist.evidenceKind || 'owner_observed_manual_operations_only',
      requiredFlows: requiredFlowSummary(day0Packet),
      requiredMetrics: [...(checklist.requiredMetrics || [])],
      requiredConfirmations: [...(checklist.requiredConfirmations || [])],
      promotionEvidenceRequirement: { ...(day0Packet.promotionEvidenceRequirement || checklist.promotionEvidenceRequirement || {}) },
      stopConditions: [...(checklist.stopConditions || [])],
    },
    commandPlan: {
      placeholdersOnly: true,
      mustRunLintBeforePublicPacket: true,
      commands: [...BASELINE_COMMANDS],
    },
    blockersStillActive: [...(day0Packet.blockers || [])],
    nonClaims: [...NON_CLAIMS],
    controls: Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((key) => [key, false])),
  }
  assertNoPrivateOrSecretShape(body)
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotDay0OwnerBaselineActionCard(card) {
  assertNoPrivateOrSecretShape(card)
  if (!isRecord(card) || card.contract !== SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT) {
    fail('shop_pilot_day0_owner_baseline_card_contract_invalid')
  }
  const { digest: actualDigest, ...body } = card
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) {
    fail('shop_pilot_day0_owner_baseline_card_digest_invalid')
  }
  if (card.product !== 'shop' || card.pilotMode !== 'owner_named' || card.status !== 'owner_observed_baseline_action_required') {
    fail('shop_pilot_day0_owner_baseline_card_scope_invalid')
  }
  if (!isRecord(card.source)
    || card.source.day0Contract !== SHOP_PILOT_DAY0_READINESS_CONTRACT
    || !DIGEST_PATTERN.test(card.source.day0Digest || '')
    || !BASELINE_REQUIRED_STATUSES.includes(card.source.day0Status)
    || !DIGEST_PATTERN.test(card.source.launchGateDigest || '')
    || (card.source.acceptedIntakePacketDigest !== null && !DIGEST_PATTERN.test(card.source.acceptedIntakePacketDigest))
    || !RELEASE_CONTROL_GATE_IDS.includes(card.source.releaseGateCurrentGateId)
    || card.source.releaseGateCurrentBlocker !== releaseBlockerForGate(card.source.releaseGateCurrentGateId)
    || typeof card.source.releaseGateEvidenceProvided !== 'boolean'
    || typeof card.source.mainProtectionVerified !== 'boolean'
    || (card.source.releaseHandoffDigest !== null && !DIGEST_PATTERN.test(card.source.releaseHandoffDigest))
    || (card.source.githubMainProtectionSnapshotDigest !== null && !DIGEST_PATTERN.test(card.source.githubMainProtectionSnapshotDigest))
    || (card.source.releaseGateEvidenceProvided === true && (!DIGEST_PATTERN.test(card.source.releaseHandoffDigest || '') || !DIGEST_PATTERN.test(card.source.githubMainProtectionSnapshotDigest || '')))) {
    fail('shop_pilot_day0_owner_baseline_card_source_invalid')
  }
  if (!isRecord(card.action)
    || card.action.id !== 'capture-owner-observed-baseline'
    || card.action.privateWorkspaceRequired !== true
    || card.action.safeBeforeReleaseGate !== true
    || card.action.releaseGateStillRequiredBeforePilotActivation !== true
    || card.action.nextRequiredDigest !== 'baseline_packet_digest'
    || card.action.expectedPreflightStatus !== 'baseline_input_ready'
    || card.action.completionSignal !== 'public_safe_baseline_packet_digest') {
    fail('shop_pilot_day0_owner_baseline_card_action_invalid')
  }
  const artifacts = card.ownerPrivatePrepArtifacts
  if (!isRecord(artifacts)
    || artifacts.artifactPolicy !== 'digests_only_no_paths'
    || artifacts.localPathsIncluded !== false
    || artifacts.rawIdentityIncluded !== false
    || artifacts.baselineInputTemplate?.provided !== true
    || artifacts.baselineInputTemplate?.blankTemplate !== true
    || !DIGEST_PATTERN.test(artifacts.baselineInputTemplate?.digest || '')
    || artifacts.baselineWorksheet?.provided !== true
    || artifacts.baselineWorksheet?.blankWorksheet !== true
    || !DIGEST_PATTERN.test(artifacts.baselineWorksheet?.digest || '')) {
    fail('shop_pilot_day0_owner_baseline_card_artifacts_invalid')
  }
  const evidence = card.minimumEvidence
  const promotion = evidence.promotionEvidenceRequirement
  if (!isRecord(evidence)
    || evidence.evidenceKind !== 'owner_observed_manual_operations_only'
    || !Array.isArray(evidence.requiredFlows)
    || evidence.requiredFlows.length !== 3
    || !sameArray(evidence.requiredFlows.map((flow) => flow.id), ['manual_order', 'package_redemption', 'daily_close'])
    || evidence.requiredFlows.some((flow) => flow.requiredUninterruptedRuns !== 3 || flow.accepted !== false)
    || evidence.requiredFlows.some((flow) => flow.id === 'daily_close'
      && (flow.requiredDistinctCalendarDateCount !== 3 || flow.observedDistinctCalendarDateCount !== 0))
    || evidence.requiredFlows.some((flow) => flow.id !== 'daily_close'
      && (flow.requiredDistinctCalendarDateCount !== null || flow.observedDistinctCalendarDateCount !== null))
    || !Array.isArray(evidence.requiredMetrics)
    || !evidence.requiredMetrics.includes('daily_close_minutes')
    || !Array.isArray(evidence.requiredConfirmations)
    || !evidence.requiredConfirmations.includes('no_external_effects')
    || !isRecord(promotion)
    || promotion.requiredAcceptedConsecutiveRuns !== REQUIRED_PROMOTION_ACCEPTED_RUNS
    || promotion.acceptedConsecutiveRuns !== 0
    || !sameArray(promotion.requiredPilotDayIndexes, REQUIRED_PROMOTION_PILOT_DAY_INDEXES)
    || !sameArray(promotion.acceptedConsecutivePilotDayIndexes, [])
    || promotion.pilotSequenceCoverageMet !== false
    || promotion.readyForPromotionEvidence !== false
    || promotion.syntheticEvidenceAccepted !== false
    || !Array.isArray(evidence.stopConditions)
    || !evidence.stopConditions.includes('raw_identity_or_private_note_would_enter_owner_safe_packet')) {
    fail('shop_pilot_day0_owner_baseline_card_evidence_invalid')
  }
  if (!isRecord(card.commandPlan)
    || card.commandPlan.placeholdersOnly !== true
    || card.commandPlan.mustRunLintBeforePublicPacket !== true
    || !Array.isArray(card.commandPlan.commands)
    || card.commandPlan.commands.length !== BASELINE_COMMANDS.length
    || !card.commandPlan.commands.includes('npm.cmd run shop:pilot:baseline-packet -- --lint-input "<private-baseline-input.json>"')
    || card.commandPlan.commands.some((command) => !BASELINE_COMMANDS.includes(command))) {
    fail('shop_pilot_day0_owner_baseline_card_commands_invalid')
  }
  if (!Array.isArray(card.blockersStillActive)
    || !card.blockersStillActive.includes('owner_observed_baseline_packet_missing')
    || !card.blockersStillActive.includes(releaseBlockerForGate(card.source.releaseGateCurrentGateId))
    || (card.source.releaseGateCurrentGateId !== 'github_main_protection' && card.blockersStillActive.includes('github_main_protection_unverified'))
    || !Array.isArray(card.nonClaims)
    || !NON_CLAIMS.every((claim) => card.nonClaims.includes(claim))) {
    fail('shop_pilot_day0_owner_baseline_card_blockers_invalid')
  }
  if (!isRecord(card.controls) || REQUIRED_FALSE_CONTROLS.some((key) => card.controls[key] !== false)) {
    fail('shop_pilot_day0_owner_baseline_card_controls_invalid')
  }
  return card
}

export function renderShopPilotDay0OwnerBaselineActionCardMarkdown(card) {
  validateShopPilotDay0OwnerBaselineActionCard(card)
  const artifact = card.ownerPrivatePrepArtifacts
  const evidence = card.minimumEvidence
  const flows = evidence.requiredFlows.map((flow) => {
    const calendarDateText = Number.isInteger(flow.requiredDistinctCalendarDateCount)
      ? `; required distinct close dates ${flow.requiredDistinctCalendarDateCount}; observed distinct close dates ${flow.observedDistinctCalendarDateCount}`
      : ''
    return `- ${flow.label}: ${flow.uninterruptedRuns}/${flow.observedRuns} uninterrupted/observed now; required uninterrupted ${flow.requiredUninterruptedRuns}${calendarDateText}`
  }).join('\n')
  const metrics = evidence.requiredMetrics.map((metric) => `- ${metric}`).join('\n')
  const confirmations = evidence.requiredConfirmations.map((confirmation) => `- ${confirmation}`).join('\n')
  const promotion = evidence.promotionEvidenceRequirement
  const stopConditions = evidence.stopConditions.map((condition) => `- ${condition}`).join('\n')
  const commands = card.commandPlan.commands.map((command) => `- ${command}`).join('\n')
  const blockers = card.blockersStillActive.map((blocker) => `- ${blocker}`).join('\n')
  const nonClaims = card.nonClaims.map((claim) => `- ${claim}`).join('\n')
  return `# Shop Pilot Day-0 Owner Baseline Action Card

Contract: \`${card.contract}\`
Digest: \`${card.digest}\`
Status: \`${card.status}\`
Source Day-0 digest: \`${card.source.day0Digest}\`
Candidate: \`${card.candidate.branch || 'unknown'} @ ${card.candidate.head || 'unknown'}\`

## Owner action now

Capture the owner-observed manual Shop baseline in the private workspace, run the local baseline input preflight, then generate only the owner-safe baseline packet if the preflight returns \`${card.action.expectedPreflightStatus}\`.

- Allowed now: ${card.action.allowedNow}
- Private workspace required: true
- Safe before release gate: true
- Release gate still required before pilot activation: true
- Next required digest: ${card.action.nextRequiredDigest}
- External effects allowed: false

## Prep artifacts

- Artifact policy: ${artifact.artifactPolicy}
- Baseline input template digest: ${artifact.baselineInputTemplate.digest}
- Baseline worksheet digest: ${artifact.baselineWorksheet.digest}
- Accepted intake packet digest: ${card.source.acceptedIntakePacketDigest || 'not accepted yet'}
- Local paths included: false
- Raw identity included: false

## Minimum evidence before packet generation

Required flows:

${flows}

Required metrics:

${metrics}

Required confirmations:

${confirmations}

Promotion evidence threshold:

- Required accepted real runs: ${promotion.requiredAcceptedConsecutiveRuns}
- Required pilot days covered: ${promotion.requiredPilotDayIndexes.join(', ')}
- Accepted run count now: ${promotion.acceptedConsecutiveRuns}
- Accepted pilot days now: ${promotion.acceptedConsecutivePilotDayIndexes.length ? promotion.acceptedConsecutivePilotDayIndexes.join(', ') : 'none'}
- Synthetic evidence accepted: false

Stop and do not generate the owner-safe baseline packet if any condition occurs:

${stopConditions}

## Commands

Use placeholder filenames in the private workspace. Do not paste local paths, names, contacts, raw notes, credentials, payment, or stock details into any owner-safe packet. Owner-safe does not mean public website, customer-facing, or publishable.

${commands}

## Blockers still active

${blockers}

## What this card does not claim

${nonClaims}
`
}

function sampleCardDay0Packet() {
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  return buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
    ownerPrivatePreparation: {
      baselineInputTemplateDigest: `sha256:${'a'.repeat(64)}`,
      baselineInputTemplateBlank: true,
      baselineWorksheetDigest: `sha256:${'b'.repeat(64)}`,
      baselineWorksheetBlank: true,
    },
  }))
}

function runSelfTest() {
  const card = buildShopPilotDay0OwnerBaselineActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet: sampleCardDay0Packet(),
  })
  const markdown = renderShopPilotDay0OwnerBaselineActionCardMarkdown(card)
  const tampered = { ...card, controls: { ...card.controls, githubWritesAllowed: true } }
  let tamperDetected = false
  try {
    validateShopPilotDay0OwnerBaselineActionCard(tampered)
  } catch (error) {
    tamperDetected = String(error?.message || '').includes('digest_invalid')
  }
  return {
    ok: validateShopPilotDay0OwnerBaselineActionCard(card) === card
      && markdown.includes('--lint-input "<private-baseline-input.json>"')
      && !hasPrivateOrSecretShape(markdown)
      && !/ready for managed activation|production release ready|pilot proof/i.test(markdown)
      && tamperDetected,
    contract: `${SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT}.self-test`,
    checks: {
      card_valid: true,
      markdown_safe: !hasPrivateOrSecretShape(markdown),
      lint_before_owner_safe_packet: markdown.includes('--lint-input "<private-baseline-input.json>"'),
      tamper_detected: tamperDetected,
    },
    externalWritesPerformed: false,
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path || ''), 'utf8'))
}

async function writeOutput(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    verify: null,
    day0ReadinessPath: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--day0-readiness') options.day0ReadinessPath = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`shop_pilot_day0_owner_baseline_card_usage_invalid:${arg}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.verify) {
    const card = validateShopPilotDay0OwnerBaselineActionCard(await readJson(options.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: card.contract,
      status: card.status,
      sourceDay0Digest: card.source.day0Digest,
      externalWritesPerformed: false,
    }))
    return
  }
  if (!options.day0ReadinessPath) fail('shop_pilot_day0_owner_baseline_card_day0_readiness_required')
  const card = validateShopPilotDay0OwnerBaselineActionCard(buildShopPilotDay0OwnerBaselineActionCard({
    day0Packet: await readJson(options.day0ReadinessPath),
  }))
  if (options.output) await writeOutput(options.output, `${JSON.stringify(card, null, 2)}\n`)
  if (options.markdownOutput) await writeOutput(options.markdownOutput, `${renderShopPilotDay0OwnerBaselineActionCardMarkdown(card)}\n`)
  if (!options.output && !options.markdownOutput) {
    console.log(JSON.stringify({
      ok: true,
      contract: card.contract,
      status: card.status,
      sourceDay0Digest: card.source.day0Digest,
      externalWritesPerformed: false,
    }, null, 2))
  } else {
    console.log(JSON.stringify({
      ok: true,
      contract: card.contract,
      status: card.status,
      output: options.output ? resolve(options.output) : null,
      markdownOutput: options.markdownOutput ? resolve(options.markdownOutput) : null,
      digest: card.digest,
      externalWritesPerformed: false,
    }))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT,
      error: String(error?.message || 'shop_pilot_day0_owner_baseline_card_failed').slice(0, 260),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
