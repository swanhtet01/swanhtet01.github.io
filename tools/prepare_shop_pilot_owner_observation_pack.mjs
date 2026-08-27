#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_DAY0_READINESS_CONTRACT,
  buildShopPilotDay0ReadinessPacket,
  sampleShopPilotDay0ReadinessInput,
  validateShopPilotDay0ReadinessPacket,
} from './prepare_shop_pilot_day0_readiness_packet.mjs'
import {
  SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT,
  buildShopPilotDay0OwnerBaselineActionCard,
  validateShopPilotDay0OwnerBaselineActionCard,
} from './prepare_shop_pilot_day0_owner_baseline_action_card.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  CURRENT_RELEASE_CONTROL_INDEX_CONTRACT,
  buildCurrentReleaseControlIndex,
  sampleCurrentReleaseControlIndexInput,
  validateCurrentReleaseControlIndex,
} from './prepare_current_release_control_index.mjs'
import {
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
} from './verify_shop_pilot_launch_gate.mjs'

export const SHOP_PILOT_OWNER_OBSERVATION_PACK_CONTRACT = 'supermega.shop-pilot-owner-observation-pack.v1'

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SHA_PATTERN = /^[a-f0-9]{40}$/
const OBSERVATION_READY_DAY0_STATUSES = [
  'blocked_owner_baseline_and_intake_required',
  'blocked_owner_observed_baseline_required',
]
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
const NON_CLAIMS = [
  'not_a_release_approval',
  'not_a_branch_push_or_pull_request_approval',
  'not_a_deployment_or_promotion',
  'not_a_managed_activation',
  'not_customer_contact_authority',
  'not_payment_or_stock_movement',
  'not_pilot_success_or_revenue_proof',
]
const RUN_ACCEPTANCE_RULES = [
  'real_manual_operations_only',
  'operator_reviewed_every_run',
  'target_correct_before_acceptance',
  'no_supermega_demo_or_synthetic_run',
  'no_customer_message_payment_stock_movement_or_hosted_write',
  'owner_safe_packet_contains_counts_labels_digests_only',
]
const OBSERVED_RUN_EVIDENCE_COMMANDS = [
  'npm.cmd run client:pilot:observed-evidence:template -- --workspace "<private-observed-workspace>" --output "<private-observed-run-input.json>"',
  'npm.cmd run client:pilot:observed-evidence:validate -- --run-input "<private-observed-run-input.json>"',
  'npm.cmd run client:pilot:observed-evidence -- --record --workspace "<private-observed-workspace>" --run-input "<private-observed-run-input.json>"',
  'npm.cmd run client:pilot:observed-evidence -- --verify --workspace "<private-observed-workspace>"',
  'npm.cmd run shop:pilot:decision-packet -- --baseline-packet "<owner-safe-baseline-packet.json>" --observed-workspace "<private-observed-workspace>" --output "<owner-safe-decision-packet.json>" --markdown-output "<owner-safe-decision-packet.md>"',
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

function assertNoPrivateOrSecretShape(value, code = 'shop_pilot_owner_observation_pack_private_or_secret_shape') {
  if (hasPrivateOrSecretShape(value)) fail(code)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function assertDigest(value, code) {
  const normalized = String(value || '')
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function assertSha(value, code) {
  const normalized = String(value || '')
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function safeFileName(path) {
  if (!path) return null
  const name = basename(String(path))
  if (!name || name.includes('\\') || name.includes('/') || hasPrivateOrSecretShape(name)) {
    fail('shop_pilot_owner_observation_pack_source_file_name_invalid')
  }
  return name
}

function flowChecklist(flow) {
  return {
    id: String(flow.id || ''),
    label: String(flow.label || ''),
    requiredUninterruptedRuns: flow.requiredUninterruptedRuns,
    observedRunsNow: flow.observedRuns,
    uninterruptedRunsNow: flow.uninterruptedRuns,
    acceptedNow: flow.accepted === true,
  }
}

function controlIndexSummary(controlIndex) {
  if (!controlIndex) return null
  return {
    contract: CURRENT_RELEASE_CONTROL_INDEX_CONTRACT,
    digest: controlIndex.digest,
    currentGateId: controlIndex.currentOwnerAction.gateId,
    ownerApprovalPacketFileName: controlIndex.currentOwnerAction.sourcePacketFileName,
    ownerActionCardFileName: controlIndex.currentOwnerAction.sourceActionCardFileName,
    exactCommit: controlIndex.currentOwnerAction.exactCommit,
    label: controlIndex.currentOwnerAction.label,
    externalWriteRequiresOwnerApproval: true,
    branchPushAllowedNow: false,
    pullRequestAllowedNow: false,
    deployAllowedNow: false,
    supabaseWriteAllowedNow: false,
    customerContactAllowedNow: false,
    paymentOrStockAllowedNow: false,
    managedActivationAllowedNow: false,
  }
}

function assertSourceAlignment({ day0Packet, ownerBaselineActionCard, currentReleaseControlIndex }) {
  if (ownerBaselineActionCard.source.day0Digest !== day0Packet.digest) {
    fail('shop_pilot_owner_observation_pack_day0_card_digest_mismatch')
  }
  if (ownerBaselineActionCard.source.day0Status !== day0Packet.status) {
    fail('shop_pilot_owner_observation_pack_day0_card_status_mismatch')
  }
  if (ownerBaselineActionCard.candidate.head !== day0Packet.candidate?.head) {
    fail('shop_pilot_owner_observation_pack_day0_card_candidate_mismatch')
  }
  if (!OBSERVATION_READY_DAY0_STATUSES.includes(day0Packet.status)) {
    fail('shop_pilot_owner_observation_pack_day0_status_not_observation_ready')
  }
  if (ownerBaselineActionCard.action.id !== 'capture-owner-observed-baseline') {
    fail('shop_pilot_owner_observation_pack_card_action_invalid')
  }
  if (currentReleaseControlIndex) {
    if (currentReleaseControlIndex.candidate.commit !== ownerBaselineActionCard.candidate.head) {
      fail('shop_pilot_owner_observation_pack_control_index_candidate_mismatch')
    }
    if (currentReleaseControlIndex.authoritativeArtifacts?.shopPilotDay0Readiness?.digest !== day0Packet.digest) {
      fail('shop_pilot_owner_observation_pack_control_index_day0_digest_mismatch')
    }
    if (currentReleaseControlIndex.authoritativeArtifacts?.shopPilotDay0OwnerBaselineActionCard?.digest !== ownerBaselineActionCard.digest) {
      fail('shop_pilot_owner_observation_pack_control_index_card_digest_mismatch')
    }
    if (currentReleaseControlIndex.shopPilot?.day0Status !== day0Packet.status) {
      fail('shop_pilot_owner_observation_pack_control_index_shop_status_mismatch')
    }
    if (currentReleaseControlIndex.shopPilot?.customerContactAllowed !== false
      || currentReleaseControlIndex.shopPilot?.managedActivationAllowed !== false) {
      fail('shop_pilot_owner_observation_pack_control_index_authority_invalid')
    }
  }
}

function assertCommandOrder(commands) {
  const lintIndex = commands.findIndex((command) => command.includes('--lint-input "<private-baseline-input.json>"'))
  const generateIndex = commands.findIndex((command) => command.includes('--input "<private-baseline-input.json>"') && command.includes('--output "<owner-safe-baseline-packet.json>"'))
  if (lintIndex < 0 || generateIndex < 0 || lintIndex > generateIndex) {
    fail('shop_pilot_owner_observation_pack_command_order_invalid')
  }
}

function assertObservedRunCommandOrder(commands) {
  const templateIndex = commands.findIndex((command) => command.includes('client:pilot:observed-evidence:template'))
  const validateIndex = commands.findIndex((command) => command.includes('client:pilot:observed-evidence:validate'))
  const recordIndex = commands.findIndex((command) => command.includes('--record') && command.includes('client:pilot:observed-evidence'))
  const verifyIndex = commands.findIndex((command) => command.includes('--verify') && command.includes('client:pilot:observed-evidence'))
  const decisionIndex = commands.findIndex((command) => command.includes('shop:pilot:decision-packet') && command.includes('--observed-workspace'))
  if (templateIndex < 0
    || validateIndex < 0
    || recordIndex < 0
    || verifyIndex < 0
    || decisionIndex < 0
    || templateIndex > validateIndex
    || validateIndex > recordIndex
    || recordIndex > verifyIndex
    || verifyIndex > decisionIndex) {
    fail('shop_pilot_owner_observation_pack_observed_run_command_order_invalid')
  }
}

export function buildShopPilotOwnerObservationPack(input = {}) {
  const day0Packet = validateShopPilotDay0ReadinessPacket(input.day0Packet)
  const ownerBaselineActionCard = validateShopPilotDay0OwnerBaselineActionCard(input.ownerBaselineActionCard)
  const currentReleaseControlIndex = input.currentReleaseControlIndex
    ? validateCurrentReleaseControlIndex(input.currentReleaseControlIndex)
    : null
  assertSourceAlignment({ day0Packet, ownerBaselineActionCard, currentReleaseControlIndex })

  const evidence = ownerBaselineActionCard.minimumEvidence
  const commands = [...ownerBaselineActionCard.commandPlan.commands]
  assertCommandOrder(commands)
  const body = {
    contract: SHOP_PILOT_OWNER_OBSERVATION_PACK_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    product: 'shop',
    pilotMode: 'owner_named',
    status: 'blocked_owner_private_observation_required',
    source: {
      day0Contract: SHOP_PILOT_DAY0_READINESS_CONTRACT,
      day0Digest: day0Packet.digest,
      ownerBaselineActionCardContract: SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT,
      ownerBaselineActionCardDigest: ownerBaselineActionCard.digest,
      currentReleaseControlIndexContract: currentReleaseControlIndex ? CURRENT_RELEASE_CONTROL_INDEX_CONTRACT : null,
      currentReleaseControlIndexDigest: currentReleaseControlIndex?.digest || null,
      day0FileName: safeFileName(input.sourceFileNames?.day0Readiness),
      ownerBaselineActionCardFileName: safeFileName(input.sourceFileNames?.ownerBaselineActionCard),
      currentReleaseControlIndexFileName: safeFileName(input.sourceFileNames?.currentReleaseControlIndex),
    },
    candidate: {
      branch: ownerBaselineActionCard.candidate.branch || day0Packet.candidate?.branch || null,
      head: assertSha(ownerBaselineActionCard.candidate.head, 'shop_pilot_owner_observation_pack_candidate_invalid'),
      clean: ownerBaselineActionCard.candidate.clean === true && day0Packet.candidate?.clean === true,
      aheadOfOriginMain: ownerBaselineActionCard.candidate.aheadOfOriginMain ?? day0Packet.candidate?.aheadOfOriginMain ?? null,
    },
    currentReleaseGate: controlIndexSummary(currentReleaseControlIndex),
    ownerAction: {
      id: 'observe-manual-shop-baseline',
      label: 'Observe real manual Shop work, fill the private baseline input, lint it, then generate only owner-safe digests/counts',
      allowedNow: 'owner_private_local_observation_only',
      privateWorkspaceRequired: true,
      safeBeforeReleaseGate: true,
      releaseGateStillRequiredBeforePilotActivation: true,
      completionSignal: 'owner_safe_baseline_packet_digest',
    },
    observationChecklist: {
      evidenceKind: evidence.evidenceKind,
      minimumUninterruptedRunsPerFlow: 3,
      flows: evidence.requiredFlows.map(flowChecklist),
      requiredMetrics: [...evidence.requiredMetrics],
      requiredConfirmations: [...evidence.requiredConfirmations],
      promotionEvidenceRequirement: { ...(evidence.promotionEvidenceRequirement || {}) },
      runAcceptanceRules: [...RUN_ACCEPTANCE_RULES],
      stopConditions: [...evidence.stopConditions],
    },
    ownerSafeOutputPolicy: {
      allowedFields: ['contract', 'stage', 'counts', 'labels', 'booleans', 'dates', 'durations', 'digests', 'derived readiness status'],
      forbiddenFields: ['names', 'contacts', 'raw notes', 'local paths', 'credentials', 'payment details', 'stock movement details', 'row-level private evidence'],
      localPathsIncluded: false,
      rawIdentityIncluded: false,
      rawPrivateNotesIncluded: false,
      credentialValuesIncluded: false,
    },
    commandPlan: {
      placeholdersOnly: true,
      mustGenerateBlankTemplateFirst: true,
      mustRunLintBeforeOwnerSafePacket: true,
      commands,
    },
    observedRunEvidenceCommandPlan: {
      placeholdersOnly: true,
      privateRunInputTemplateRequiredBeforeEachRun: true,
      metadataOnlyValidationRequiredBeforeRecord: true,
      receiptDigestRequiredBeforeRecord: true,
      independentAnchorDigestRequiredBeforeRecord: true,
      decisionPacketOnlyAfterObservedSummaryVerify: true,
      requiredAcceptedConsecutiveRuns: REQUIRED_PROMOTION_ACCEPTED_RUNS,
      requiredPilotDayIndexes: [...REQUIRED_PROMOTION_PILOT_DAY_INDEXES],
      commands: [...OBSERVED_RUN_EVIDENCE_COMMANDS],
    },
    blockersStillActive: [...ownerBaselineActionCard.blockersStillActive],
    nonClaims: [...NON_CLAIMS],
    controls: Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((key) => [key, false])),
  }
  assertNoPrivateOrSecretShape(body)
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotOwnerObservationPack(packet) {
  assertNoPrivateOrSecretShape(packet)
  if (!isRecord(packet) || packet.contract !== SHOP_PILOT_OWNER_OBSERVATION_PACK_CONTRACT) {
    fail('shop_pilot_owner_observation_pack_contract_invalid')
  }
  const { digest: actualDigest, ...body } = packet
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) {
    fail('shop_pilot_owner_observation_pack_digest_invalid')
  }
  if (packet.product !== 'shop'
    || packet.pilotMode !== 'owner_named'
    || packet.status !== 'blocked_owner_private_observation_required') {
    fail('shop_pilot_owner_observation_pack_scope_invalid')
  }
  if (!isRecord(packet.source)
    || packet.source.day0Contract !== SHOP_PILOT_DAY0_READINESS_CONTRACT
    || !DIGEST_PATTERN.test(packet.source.day0Digest || '')
    || packet.source.ownerBaselineActionCardContract !== SHOP_PILOT_DAY0_OWNER_BASELINE_ACTION_CARD_CONTRACT
    || !DIGEST_PATTERN.test(packet.source.ownerBaselineActionCardDigest || '')
    || (packet.source.currentReleaseControlIndexContract !== null && packet.source.currentReleaseControlIndexContract !== CURRENT_RELEASE_CONTROL_INDEX_CONTRACT)
    || (packet.source.currentReleaseControlIndexDigest !== null && !DIGEST_PATTERN.test(packet.source.currentReleaseControlIndexDigest))) {
    fail('shop_pilot_owner_observation_pack_source_invalid')
  }
  if (!isRecord(packet.candidate)
    || !SHA_PATTERN.test(packet.candidate.head || '')
    || packet.candidate.clean !== true) {
    fail('shop_pilot_owner_observation_pack_candidate_invalid')
  }
  if (packet.currentReleaseGate !== null) {
    const gate = packet.currentReleaseGate
    if (!isRecord(gate)
      || gate.contract !== CURRENT_RELEASE_CONTROL_INDEX_CONTRACT
      || !DIGEST_PATTERN.test(gate.digest || '')
      || gate.exactCommit !== packet.candidate.head
      || gate.externalWriteRequiresOwnerApproval !== true
      || gate.branchPushAllowedNow !== false
      || gate.pullRequestAllowedNow !== false
      || gate.deployAllowedNow !== false
      || gate.supabaseWriteAllowedNow !== false
      || gate.customerContactAllowedNow !== false
      || gate.paymentOrStockAllowedNow !== false
      || gate.managedActivationAllowedNow !== false) {
      fail('shop_pilot_owner_observation_pack_release_gate_invalid')
    }
  }
  const action = packet.ownerAction
  if (!isRecord(action)
    || action.id !== 'observe-manual-shop-baseline'
    || action.allowedNow !== 'owner_private_local_observation_only'
    || action.privateWorkspaceRequired !== true
    || action.safeBeforeReleaseGate !== true
    || action.releaseGateStillRequiredBeforePilotActivation !== true
    || action.completionSignal !== 'owner_safe_baseline_packet_digest') {
    fail('shop_pilot_owner_observation_pack_owner_action_invalid')
  }
  const checklist = packet.observationChecklist
  const promotion = checklist?.promotionEvidenceRequirement
  if (!isRecord(checklist)
    || checklist.evidenceKind !== 'owner_observed_manual_operations_only'
    || checklist.minimumUninterruptedRunsPerFlow !== 3
    || !Array.isArray(checklist.flows)
    || checklist.flows.length !== 3
    || !sameArray(checklist.flows.map((flow) => flow.id), ['manual_order', 'package_redemption', 'daily_close'])
    || checklist.flows.some((flow) => flow.requiredUninterruptedRuns !== 3 || flow.acceptedNow !== false)
    || !Array.isArray(checklist.requiredMetrics)
    || !checklist.requiredMetrics.includes('weekly_orders')
    || !checklist.requiredMetrics.includes('daily_close_minutes')
    || !Array.isArray(checklist.requiredConfirmations)
    || !checklist.requiredConfirmations.includes('no_external_effects')
    || !isRecord(promotion)
    || promotion.requiredAcceptedConsecutiveRuns !== REQUIRED_PROMOTION_ACCEPTED_RUNS
    || promotion.acceptedConsecutiveRuns !== 0
    || !sameArray(promotion.requiredPilotDayIndexes, REQUIRED_PROMOTION_PILOT_DAY_INDEXES)
    || !sameArray(promotion.acceptedConsecutivePilotDayIndexes, [])
    || promotion.pilotSequenceCoverageMet !== false
    || promotion.readyForPromotionEvidence !== false
    || promotion.syntheticEvidenceAccepted !== false
    || !Array.isArray(checklist.runAcceptanceRules)
    || !RUN_ACCEPTANCE_RULES.every((rule) => checklist.runAcceptanceRules.includes(rule))
    || !Array.isArray(checklist.stopConditions)
    || !checklist.stopConditions.includes('raw_identity_or_private_note_would_enter_owner_safe_packet')) {
    fail('shop_pilot_owner_observation_pack_checklist_invalid')
  }
  const policy = packet.ownerSafeOutputPolicy
  if (!isRecord(policy)
    || policy.localPathsIncluded !== false
    || policy.rawIdentityIncluded !== false
    || policy.rawPrivateNotesIncluded !== false
    || policy.credentialValuesIncluded !== false
    || !Array.isArray(policy.allowedFields)
    || !policy.allowedFields.includes('digests')
    || !Array.isArray(policy.forbiddenFields)
    || !policy.forbiddenFields.includes('local paths')) {
    fail('shop_pilot_owner_observation_pack_output_policy_invalid')
  }
  if (!isRecord(packet.commandPlan)
    || packet.commandPlan.placeholdersOnly !== true
    || packet.commandPlan.mustGenerateBlankTemplateFirst !== true
    || packet.commandPlan.mustRunLintBeforeOwnerSafePacket !== true
    || !Array.isArray(packet.commandPlan.commands)) {
    fail('shop_pilot_owner_observation_pack_command_plan_invalid')
  }
  assertCommandOrder(packet.commandPlan.commands)
  const observedRunPlan = packet.observedRunEvidenceCommandPlan
  if (!isRecord(observedRunPlan)
    || observedRunPlan.placeholdersOnly !== true
    || observedRunPlan.privateRunInputTemplateRequiredBeforeEachRun !== true
    || observedRunPlan.metadataOnlyValidationRequiredBeforeRecord !== true
    || observedRunPlan.receiptDigestRequiredBeforeRecord !== true
    || observedRunPlan.independentAnchorDigestRequiredBeforeRecord !== true
    || observedRunPlan.decisionPacketOnlyAfterObservedSummaryVerify !== true
    || observedRunPlan.requiredAcceptedConsecutiveRuns !== REQUIRED_PROMOTION_ACCEPTED_RUNS
    || !sameArray(observedRunPlan.requiredPilotDayIndexes, REQUIRED_PROMOTION_PILOT_DAY_INDEXES)
    || !Array.isArray(observedRunPlan.commands)
    || observedRunPlan.commands.length !== OBSERVED_RUN_EVIDENCE_COMMANDS.length
    || observedRunPlan.commands.some((command) => !OBSERVED_RUN_EVIDENCE_COMMANDS.includes(command))) {
    fail('shop_pilot_owner_observation_pack_observed_run_plan_invalid')
  }
  assertObservedRunCommandOrder(observedRunPlan.commands)
  if (!Array.isArray(packet.blockersStillActive)
    || !packet.blockersStillActive.includes('owner_observed_baseline_packet_missing')
    || !Array.isArray(packet.nonClaims)
    || !NON_CLAIMS.every((claim) => packet.nonClaims.includes(claim))) {
    fail('shop_pilot_owner_observation_pack_blockers_invalid')
  }
  if (!isRecord(packet.controls) || REQUIRED_FALSE_CONTROLS.some((key) => packet.controls[key] !== false)) {
    fail('shop_pilot_owner_observation_pack_controls_invalid')
  }
  return packet
}

export function renderShopPilotOwnerObservationPackMarkdown(packet) {
  validateShopPilotOwnerObservationPack(packet)
  const releaseGate = packet.currentReleaseGate
  const flows = packet.observationChecklist.flows
    .map((flow) => `- ${flow.label}: currently ${flow.uninterruptedRunsNow}/${flow.observedRunsNow}; required uninterrupted ${flow.requiredUninterruptedRuns}`)
    .join('\n')
  const metrics = packet.observationChecklist.requiredMetrics.map((metric) => `- ${metric}`).join('\n')
  const confirmations = packet.observationChecklist.requiredConfirmations.map((confirmation) => `- ${confirmation}`).join('\n')
  const promotion = packet.observationChecklist.promotionEvidenceRequirement
  const acceptanceRules = packet.observationChecklist.runAcceptanceRules.map((rule) => `- ${rule}`).join('\n')
  const stopConditions = packet.observationChecklist.stopConditions.map((condition) => `- ${condition}`).join('\n')
  const commands = packet.commandPlan.commands.map((command) => `- ${command}`).join('\n')
  const observedRunCommands = packet.observedRunEvidenceCommandPlan.commands.map((command) => `- ${command}`).join('\n')
  const blockers = packet.blockersStillActive.map((blocker) => `- ${blocker}`).join('\n')
  const nonClaims = packet.nonClaims.map((claim) => `- ${claim}`).join('\n')
  return `# Shop Pilot Owner Observation Pack

Contract: \`${packet.contract}\`
Digest: \`${packet.digest}\`
Status: \`${packet.status}\`
Candidate: \`${packet.candidate.branch || 'unknown'} @ ${packet.candidate.head}\`

## Current release gate

${releaseGate ? `Current gate: \`${releaseGate.currentGateId}\`
Owner approval packet: \`${releaseGate.ownerApprovalPacketFileName}\`
Owner action card: \`${releaseGate.ownerActionCardFileName}\`
External writes allowed now: false` : 'No current release-control index was attached; keep all external actions blocked.'}

## Owner observation task

Observe real manual Shop work in the private workspace, then create only an owner-safe baseline packet. This pack does not authorize a branch push, PR, merge, deployment, database write, customer contact, payment, stock movement, or managed activation.

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

Accepted runs must satisfy:

${acceptanceRules}

Stop and do not generate the owner-safe packet if any condition occurs:

${stopConditions}

## Commands after the private observation

Use placeholder filenames inside the private workspace. The owner-safe packet may contain counts, labels, booleans, durations, dates, and digests only; no names, contacts, raw notes, local paths, credentials, payment details, stock movement details, or row-level private evidence.

${commands}

## Commands during the five-day private pilot

After the owner-safe baseline packet exists and the owner starts real private pilot observation, use a new private run input for each real run. Template creation and metadata-only validation do not record evidence. Recording requires both a private receipt digest and an independent private anchor digest, and the decision packet remains owner-review only.

${observedRunCommands}

## Blockers still active

${blockers}

## What this pack does not claim

${nonClaims}
`
}

function sampleDay0Packet() {
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

function sampleCurrentIndex(day0Packet, ownerBaselineActionCard) {
  const base = sampleCurrentReleaseControlIndexInput()
  const currentGateId = 'review_branch_push'
  return buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    reviewBranchPushPlan: {
      ...base.reviewBranchPushPlan,
      possibleWrite: { kind: 'fast_forward_branch_push' },
    },
    operatorBoard: {
      ...base.operatorBoard,
      currentAction: { gateId: currentGateId },
    },
    productReadinessMatrix: {
      ...base.productReadinessMatrix,
      release: { currentGateId },
    },
    statusBrief: {
      ...base.statusBrief,
      release: { currentGateId },
    },
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId,
    },
    shopPilotDay0Readiness: day0Packet,
    shopPilotDay0OwnerBaselineActionCard: ownerBaselineActionCard,
  }))
}

function runSelfTest() {
  const day0Packet = sampleDay0Packet()
  const ownerBaselineActionCard = buildShopPilotDay0OwnerBaselineActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet,
  })
  const currentReleaseControlIndex = sampleCurrentIndex(day0Packet, ownerBaselineActionCard)
  const pack = buildShopPilotOwnerObservationPack({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet,
    ownerBaselineActionCard,
    currentReleaseControlIndex,
    sourceFileNames: {
      day0Readiness: 'supermega.shop-pilot-day0-readiness.v99.generated-20260826.json',
      ownerBaselineActionCard: 'supermega.shop-pilot-day0-owner-baseline-action-card.v99.generated-20260826.json',
      currentReleaseControlIndex: 'supermega.current-release-control-index.v99.generated-20260826.json',
    },
  })
  const markdown = renderShopPilotOwnerObservationPackMarkdown(pack)
  const staleIndex = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  let staleRejected = false
  try {
    buildShopPilotOwnerObservationPack({ day0Packet, ownerBaselineActionCard, currentReleaseControlIndex: staleIndex })
  } catch (error) {
    staleRejected = String(error?.message || '').includes('control_index_day0_digest_mismatch')
  }
  return {
    ok: validateShopPilotOwnerObservationPack(pack) === pack
      && markdown.includes('Observe real manual Shop work')
      && markdown.includes('--lint-input "<private-baseline-input.json>"')
      && markdown.includes('client:pilot:observed-evidence:template')
      && markdown.includes('client:pilot:observed-evidence:validate')
      && !hasPrivateOrSecretShape(markdown)
      && staleRejected,
    contract: `${SHOP_PILOT_OWNER_OBSERVATION_PACK_CONTRACT}.self-test`,
    checks: {
      pack_valid: true,
      current_release_gate_bound: pack.currentReleaseGate?.currentGateId === 'review_branch_push',
      lint_before_owner_safe_packet: markdown.includes('--lint-input "<private-baseline-input.json>"'),
      private_run_template_before_record: markdown.indexOf('client:pilot:observed-evidence:template') < markdown.indexOf('--record --workspace "<private-observed-workspace>"'),
      metadata_validation_before_record: markdown.indexOf('client:pilot:observed-evidence:validate') < markdown.indexOf('--record --workspace "<private-observed-workspace>"'),
      markdown_safe: !hasPrivateOrSecretShape(markdown),
      stale_control_index_rejected: staleRejected,
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
    ownerBaselineActionCardPath: null,
    currentReleaseControlIndexPath: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--day0-readiness') options.day0ReadinessPath = argv[++index] || null
    else if (arg === '--owner-baseline-action-card') options.ownerBaselineActionCardPath = argv[++index] || null
    else if (arg === '--current-release-control-index') options.currentReleaseControlIndexPath = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`shop_pilot_owner_observation_pack_usage_invalid:${arg}`)
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
    const pack = validateShopPilotOwnerObservationPack(await readJson(options.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: pack.contract,
      status: pack.status,
      sourceDay0Digest: pack.source.day0Digest,
      sourceOwnerBaselineActionCardDigest: pack.source.ownerBaselineActionCardDigest,
      externalWritesPerformed: false,
    }))
    return
  }
  if (!options.day0ReadinessPath) fail('shop_pilot_owner_observation_pack_day0_readiness_required')
  if (!options.ownerBaselineActionCardPath) fail('shop_pilot_owner_observation_pack_owner_baseline_action_card_required')
  const pack = validateShopPilotOwnerObservationPack(buildShopPilotOwnerObservationPack({
    day0Packet: await readJson(options.day0ReadinessPath),
    ownerBaselineActionCard: await readJson(options.ownerBaselineActionCardPath),
    currentReleaseControlIndex: options.currentReleaseControlIndexPath
      ? await readJson(options.currentReleaseControlIndexPath)
      : null,
    sourceFileNames: {
      day0Readiness: options.day0ReadinessPath,
      ownerBaselineActionCard: options.ownerBaselineActionCardPath,
      currentReleaseControlIndex: options.currentReleaseControlIndexPath,
    },
  }))
  if (options.output) await writeOutput(options.output, `${JSON.stringify(pack, null, 2)}\n`)
  if (options.markdownOutput) await writeOutput(options.markdownOutput, `${renderShopPilotOwnerObservationPackMarkdown(pack)}\n`)
  if (!options.output && !options.markdownOutput) {
    console.log(JSON.stringify({
      ok: true,
      contract: pack.contract,
      status: pack.status,
      sourceDay0Digest: pack.source.day0Digest,
      sourceOwnerBaselineActionCardDigest: pack.source.ownerBaselineActionCardDigest,
      externalWritesPerformed: false,
    }, null, 2))
  } else {
    console.log(JSON.stringify({
      ok: true,
      contract: pack.contract,
      status: pack.status,
      output: options.output ? resolve(options.output) : null,
      markdownOutput: options.markdownOutput ? resolve(options.markdownOutput) : null,
      digest: pack.digest,
      externalWritesPerformed: false,
    }))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_OWNER_OBSERVATION_PACK_CONTRACT,
      error: String(error?.message || 'shop_pilot_owner_observation_pack_failed').slice(0, 260),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
