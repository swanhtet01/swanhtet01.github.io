#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_LAUNCH_GATE_CONTRACT,
  assessShopPilotLaunchGate,
  currentShopPilotLaunchGateReport,
  sampleShopPilotLaunchGateInput,
  validateShopPilotLaunchGate,
} from './verify_shop_pilot_launch_gate.mjs'
import {
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
  buildShopPilotBaselinePacket,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'

export const SHOP_PILOT_DAY0_READINESS_CONTRACT = 'supermega.shop-pilot-day0-readiness.v1'

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const STATUSES = [
  'blocked_launch_gate_failed',
  'blocked_owner_baseline_and_intake_required',
  'blocked_owner_private_intake_required',
  'blocked_owner_observed_baseline_required',
  'day0_owner_private_handoff_ready',
]
const SECRET_OR_PRIVATE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]
const REQUIRED_FALSE_CONTROLS = [
  'noWritePacket',
  'customerContactAllowed',
  'paymentAllowed',
  'stockMovementAllowed',
  'hostedWritesAllowed',
  'githubWritesAllowed',
  'vercelDeployAllowed',
  'supabaseWritesAllowed',
  'productionReleaseAllowed',
  'managedActivationAllowed',
  'externalEffectsAllowed',
  'privateIdentityIncluded',
  'credentialValuesIncluded',
]

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code) {
  throw new Error(code)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function hasPrivateOrSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(text))
}

function assertNoPrivateOrSecretShape(value, code = 'shop_pilot_day0_private_or_secret_shape') {
  if (hasPrivateOrSecretShape(value)) fail(code)
}

function validateLaunchGateDigest(report) {
  if (!isRecord(report) || report.contract !== SHOP_PILOT_LAUNCH_GATE_CONTRACT) {
    fail('shop_pilot_day0_launch_gate_contract_invalid')
  }
  const { digest: actualDigest, ...body } = report
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) {
    fail('shop_pilot_day0_launch_gate_digest_invalid')
  }
  if (report.ok === true) validateShopPilotLaunchGate(report)
  return report
}

function day0Status(launchGateReport) {
  if (launchGateReport.ok !== true) return 'blocked_launch_gate_failed'
  const baselineReady = launchGateReport.launchReadiness?.baselinePacketAccepted === true
  const intakeReady = launchGateReport.launchReadiness?.intakePacketAccepted === true
  if (baselineReady && intakeReady) return 'day0_owner_private_handoff_ready'
  if (baselineReady) return 'blocked_owner_private_intake_required'
  if (intakeReady) return 'blocked_owner_observed_baseline_required'
  return 'blocked_owner_baseline_and_intake_required'
}

function blockersFor(status, launchGateReport) {
  const blockers = []
  if (status === 'blocked_launch_gate_failed') blockers.push(...(launchGateReport.failures || ['launch_gate_failed']))
  if (status === 'blocked_owner_baseline_and_intake_required' || status === 'blocked_owner_observed_baseline_required') {
    blockers.push('owner_observed_baseline_packet_missing')
  }
  if (status === 'blocked_owner_baseline_and_intake_required' || status === 'blocked_owner_private_intake_required') {
    blockers.push('owner_private_intake_packet_missing')
  }
  blockers.push('github_main_protection_unverified')
  blockers.push('preview_rehearsal_missing')
  blockers.push('real_pilot_evidence_missing')
  return [...new Set(blockers)]
}

function ownerActionFor(status) {
  if (status === 'day0_owner_private_handoff_ready') {
    return 'Prepare the owner-private Shop handoff using the accepted baseline and intake digests; still do not contact the participant or enable hosted writes.'
  }
  if (status === 'blocked_owner_observed_baseline_required') {
    return 'Capture at least three owner-observed manual Shop order runs and three package-redemption runs, then generate the public-safe baseline packet.'
  }
  if (status === 'blocked_owner_private_intake_required') {
    return 'Generate and review the owner-private Shop intake packet before day-one handoff.'
  }
  if (status === 'blocked_owner_baseline_and_intake_required') {
    return 'Complete both private prerequisites: owner-observed baseline packet and owner-private intake packet.'
  }
  return 'Fix the failing launch-gate evidence before day-zero pilot readiness can be assessed.'
}

function sampleBaselineInput() {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private Day Zero Spa',
    namedOperator: 'Private Day Zero Operator',
    operatorRole: 'Shop manager',
    founderObserver: 'Founder',
    observationPlace: 'Private shop floor',
    processSummary: 'Owner records package sale and redemption manually, then closes the day.',
    processStartsAt: 'Client asks for a prepaid package',
    processEndsAt: 'Payment reconciled, treatment completed, balance updated, and book closed',
    correctionPath: 'Owner marks the wrong entry and writes the correction beside the record',
    recordSystem: 'Notebook',
    observedOrderRuns: [
      { runId: 'order-run-001', observedAt: '2026-08-25T08:01:00.000Z', startedWhen: 'client request began', endedWhen: 'manual entry completed', durationMinutes: 7, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-run-002', observedAt: '2026-08-25T08:20:00.000Z', startedWhen: 'client request began', endedWhen: 'manual entry completed', durationMinutes: 8, interrupted: false, errorOccurred: true, errorCostLabel: 'one correction before final balance' },
      { runId: 'order-run-003', observedAt: '2026-08-25T08:40:00.000Z', startedWhen: 'client request began', endedWhen: 'manual entry completed', durationMinutes: 9, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedRedemptionRuns: [
      { runId: 'redemption-run-001', observedAt: '2026-08-25T09:01:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 2, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-002', observedAt: '2026-08-25T09:20:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 3, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-003', observedAt: '2026-08-25T09:40:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 4, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    weeklyOrders: 120,
    claimedMedianMinutesPerOrder: 8,
    weeklyExceptionCount: 12,
    closeMinutesPerDay: 45,
    clientImportRowCount: 40,
    weeklyPackageSales: 12,
    weeklyTreatmentRedemptions: 24,
    claimedMedianMinutesPerRedemption: 3,
    weeklyPackageCorrectionCount: 2,
    observedErrorRunCount: 1,
    totalObservedErrorCostLabel: 'one manual correction, no monetary claim',
    ownerConfirmedBaseline: true,
    operatorAgreesReviewEveryRun: true,
    proposedPilotStartDate: '2026-08-31',
    reviewDate: '2026-09-04',
    noSuperMegaDemoMeasured: true,
    noExternalEffects: true,
  }
}

export function buildShopPilotDay0ReadinessPacket(input = {}) {
  assertNoPrivateOrSecretShape(input.launchGateReport)
  const launchGateReport = validateLaunchGateDigest(input.launchGateReport)
  const status = day0Status(launchGateReport)
  const baselineAccepted = launchGateReport.launchReadiness?.baselinePacketAccepted === true
  const intakeAccepted = launchGateReport.launchReadiness?.intakePacketAccepted === true
  const ownerPrivateHandoffReady = status === 'day0_owner_private_handoff_ready'
  const body = {
    contract: SHOP_PILOT_DAY0_READINESS_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    product: 'shop',
    pilotMode: 'owner_named',
    status,
    ok: launchGateReport.ok === true,
    day0ReadyForOwnerPrivateHandoff: ownerPrivateHandoffReady,
    repository: launchGateReport.repository || null,
    candidate: {
      branch: launchGateReport.candidate?.branch || null,
      head: launchGateReport.candidate?.head || null,
      clean: launchGateReport.candidate?.clean === true,
      aheadOfOriginMain: launchGateReport.candidate?.aheadOfOriginMain ?? null,
    },
    sourceDigests: {
      launchGateDigest: launchGateReport.digest,
      baselinePacketDigest: launchGateReport.launchReadiness?.baselinePacketDigest || null,
      baselinePrivateInputDigest: launchGateReport.launchReadiness?.baselinePrivateInputDigest || null,
      intakePacketDigest: launchGateReport.launchReadiness?.intakePacketDigest || null,
      publicBoundaryDigest: launchGateReport.publicBoundary?.fileDigest || null,
    },
    day0Readiness: {
      baselinePacketAccepted: baselineAccepted,
      intakePacketAccepted: intakeAccepted,
      ownerPrivateHandoffReady,
      measuredManualRunsRequiredPerFlow: 3,
      observedOrderRunCount: launchGateReport.baselineEvidence?.metrics?.observedOrderRunCount ?? 0,
      uninterruptedOrderRunCount: launchGateReport.baselineEvidence?.metrics?.uninterruptedOrderRunCount ?? 0,
      observedRedemptionRunCount: launchGateReport.baselineEvidence?.metrics?.observedRedemptionRunCount ?? 0,
      uninterruptedRedemptionRunCount: launchGateReport.baselineEvidence?.metrics?.uninterruptedRedemptionRunCount ?? 0,
      medianMinutesPerOrder: launchGateReport.baselineEvidence?.metrics?.medianMinutesPerOrder ?? null,
      medianMinutesPerRedemption: launchGateReport.baselineEvidence?.metrics?.medianMinutesPerRedemption ?? null,
      weeklyExceptionCount: launchGateReport.baselineEvidence?.metrics?.weeklyExceptionCount ?? null,
      closeMinutesPerDay: launchGateReport.baselineEvidence?.metrics?.closeMinutesPerDay ?? null,
      readyForCustomerContact: false,
      readyForPayment: false,
      readyForDeployment: false,
      readyForManagedActivation: false,
      readyForPromotionEvidence: false,
    },
    pilotWindow: launchGateReport.baselineEvidence?.pilotWindow || null,
    ownerAction: ownerActionFor(status),
    blockers: blockersFor(status, launchGateReport),
    privateCommands: [
      'npm.cmd run shop:pilot:baseline-packet -- --template "<private-baseline-input.json>" --worksheet-output "<private-baseline-worksheet.md>"',
      'npm.cmd run shop:pilot:baseline-packet -- --input "<private-baseline-input.json>" --output "<public-baseline-packet.json>" --markdown-output "<public-baseline-packet.md>"',
      'npm.cmd run shop:pilot:intake-packet -- --output "<public-intake-packet.json>"',
      'npm.cmd run shop:pilot:launch-gate:verify -- --baseline-packet "<public-baseline-packet.json>" --intake-packet "<public-intake-packet.json>"',
      'npm.cmd run shop:pilot:day0-readiness -- --baseline-packet "<public-baseline-packet.json>" --intake-packet "<public-intake-packet.json>" --output "<public-day0-packet.json>" --markdown-output "<public-day0-packet.md>"',
    ],
    forbiddenActions: [
      'customer_contact',
      'automatic_message_send',
      'payment',
      'stock_movement',
      'hosted_write',
      'github_write',
      'vercel_deploy_or_promote',
      'supabase_mutation',
      'production_release',
      'managed_activation',
    ],
    controls: {
      noWritePacket: false,
      customerContactAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      hostedWritesAllowed: false,
      githubWritesAllowed: false,
      vercelDeployAllowed: false,
      supabaseWritesAllowed: false,
      productionReleaseAllowed: false,
      managedActivationAllowed: false,
      externalEffectsAllowed: false,
      privateIdentityIncluded: false,
      credentialValuesIncluded: false,
    },
  }
  body.controls.noWritePacket = true
  assertNoPrivateOrSecretShape(body)
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotDay0ReadinessPacket(packet) {
  assertNoPrivateOrSecretShape(packet)
  if (!isRecord(packet) || packet.contract !== SHOP_PILOT_DAY0_READINESS_CONTRACT) fail('shop_pilot_day0_contract_invalid')
  const { digest: actualDigest, ...body } = packet
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) fail('shop_pilot_day0_digest_invalid')
  if (!STATUSES.includes(packet.status)) fail('shop_pilot_day0_status_invalid')
  if (packet.product !== 'shop' || packet.pilotMode !== 'owner_named') fail('shop_pilot_day0_scope_invalid')
  if (packet.ok !== (packet.status !== 'blocked_launch_gate_failed')) fail('shop_pilot_day0_ok_invalid')
  const baselineAccepted = packet.day0Readiness?.baselinePacketAccepted === true
  const intakeAccepted = packet.day0Readiness?.intakePacketAccepted === true
  const shouldBeReady = packet.ok === true && baselineAccepted && intakeAccepted
  if (packet.day0ReadyForOwnerPrivateHandoff !== shouldBeReady
    || packet.day0Readiness?.ownerPrivateHandoffReady !== shouldBeReady
    || packet.day0Readiness?.readyForCustomerContact !== false
    || packet.day0Readiness?.readyForPayment !== false
    || packet.day0Readiness?.readyForDeployment !== false
    || packet.day0Readiness?.readyForManagedActivation !== false
    || packet.day0Readiness?.readyForPromotionEvidence !== false) {
    fail('shop_pilot_day0_readiness_invalid')
  }
  if (packet.status === 'day0_owner_private_handoff_ready' && !shouldBeReady) fail('shop_pilot_day0_ready_status_invalid')
  if (packet.status !== 'day0_owner_private_handoff_ready' && shouldBeReady) fail('shop_pilot_day0_blocked_status_invalid')
  if (!isRecord(packet.sourceDigests)
    || !DIGEST_PATTERN.test(packet.sourceDigests.launchGateDigest || '')
    || (baselineAccepted && !DIGEST_PATTERN.test(packet.sourceDigests.baselinePacketDigest || ''))
    || (intakeAccepted && !DIGEST_PATTERN.test(packet.sourceDigests.intakePacketDigest || ''))) {
    fail('shop_pilot_day0_source_digests_invalid')
  }
  if (!Array.isArray(packet.blockers) || packet.blockers.length < 3) fail('shop_pilot_day0_blockers_invalid')
  if (!Array.isArray(packet.privateCommands) || packet.privateCommands.length < 5) fail('shop_pilot_day0_private_commands_invalid')
  if (!Array.isArray(packet.forbiddenActions) || !packet.forbiddenActions.includes('managed_activation')) fail('shop_pilot_day0_forbidden_actions_invalid')
  if (!isRecord(packet.controls) || REQUIRED_FALSE_CONTROLS.some((key) => packet.controls[key] !== (key === 'noWritePacket'))) {
    fail('shop_pilot_day0_controls_invalid')
  }
  return packet
}

export function renderShopPilotDay0ReadinessMarkdown(packet) {
  validateShopPilotDay0ReadinessPacket(packet)
  const blockers = packet.blockers.length ? packet.blockers.map((blocker) => `- ${blocker}`).join('\n') : '- none'
  const commands = packet.privateCommands.map((command) => `- ${command}`).join('\n')
  return `# Shop Pilot Day-0 Readiness

Contract: \`${packet.contract}\`
Digest: \`${packet.digest}\`
Status: \`${packet.status}\`
Candidate: \`${packet.candidate.branch || 'unknown'} @ ${packet.candidate.head || 'unknown'}\`

## Day-0 result

- Baseline packet accepted: ${packet.day0Readiness.baselinePacketAccepted}
- Intake packet accepted: ${packet.day0Readiness.intakePacketAccepted}
- Owner-private handoff ready: ${packet.day0Readiness.ownerPrivateHandoffReady}
- Ready for customer contact: false
- Ready for deployment or managed activation: false

## Public-safe baseline metrics

- Observed order runs: ${packet.day0Readiness.uninterruptedOrderRunCount}/${packet.day0Readiness.observedOrderRunCount}
- Observed redemption runs: ${packet.day0Readiness.uninterruptedRedemptionRunCount}/${packet.day0Readiness.observedRedemptionRunCount}
- Median minutes per order: ${packet.day0Readiness.medianMinutesPerOrder ?? 'missing'}
- Median minutes per redemption: ${packet.day0Readiness.medianMinutesPerRedemption ?? 'missing'}
- Weekly exceptions: ${packet.day0Readiness.weeklyExceptionCount ?? 'missing'}
- Daily close minutes: ${packet.day0Readiness.closeMinutesPerDay ?? 'missing'}

## Owner action

${packet.ownerAction}

## Blockers still active

${blockers}

## Private commands

${commands}

## Boundary

This packet includes digests, counts, booleans, commands, and gate labels only. It does not include the business name, operator name, raw notes, contact details, credentials, payment, stock movement, hosted writes, production release, or managed activation.
`
}

export function sampleShopPilotDay0ReadinessInput(overrides = {}) {
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput()),
    ...overrides,
  }
}

function runSelfTest() {
  const baselinePacket = buildShopPilotBaselinePacket(sampleBaselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const empty = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput())
  const withIntake = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
  }))
  const withBoth = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket, intakePacket })),
  }))
  const dirty = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
      gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
    })),
  }))
  const checks = {
    missing_prerequisites_stay_owner_private: empty.ok === true
      && empty.status === 'blocked_owner_baseline_and_intake_required'
      && empty.day0Readiness.readyForCustomerContact === false
      && validateShopPilotDay0ReadinessPacket(empty) === empty,
    intake_only_requires_baseline: withIntake.ok === true
      && withIntake.status === 'blocked_owner_observed_baseline_required'
      && withIntake.day0Readiness.intakePacketAccepted === true
      && withIntake.day0Readiness.baselinePacketAccepted === false
      && validateShopPilotDay0ReadinessPacket(withIntake) === withIntake,
    both_packets_ready_still_no_external_effects: withBoth.ok === true
      && withBoth.status === 'day0_owner_private_handoff_ready'
      && withBoth.day0ReadyForOwnerPrivateHandoff === true
      && withBoth.day0Readiness.readyForManagedActivation === false
      && validateShopPilotDay0ReadinessPacket(withBoth) === withBoth,
    launch_gate_failure_blocks_day0: dirty.ok === false
      && dirty.status === 'blocked_launch_gate_failed'
      && dirty.blockers.includes('shop_pilot_launch_gate_worktree_dirty')
      && validateShopPilotDay0ReadinessPacket(dirty) === dirty,
    markdown_public_safe: !/Private Day Zero Spa|Private Day Zero Operator|ready for managed activation/i.test(renderShopPilotDay0ReadinessMarkdown(withBoth)),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${SHOP_PILOT_DAY0_READINESS_CONTRACT}.self-test`,
    checks,
    failedChecks,
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
    baselinePacketPath: null,
    intakePacketPath: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--baseline-packet') options.baselinePacketPath = argv[++index] || null
    else if (arg === '--intake-packet') options.intakePacketPath = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`shop_pilot_day0_usage_invalid:${arg}`)
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
    const packet = validateShopPilotDay0ReadinessPacket(await readJson(options.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.status,
      day0ReadyForOwnerPrivateHandoff: packet.day0ReadyForOwnerPrivateHandoff,
      externalWritesPerformed: false,
    }))
    return
  }
  const packet = validateShopPilotDay0ReadinessPacket(buildShopPilotDay0ReadinessPacket({
    launchGateReport: await currentShopPilotLaunchGateReport({
      baselinePacketPath: options.baselinePacketPath,
      intakePacketPath: options.intakePacketPath,
    }),
  }))
  if (options.output) await writeOutput(options.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (options.markdownOutput) await writeOutput(options.markdownOutput, `${renderShopPilotDay0ReadinessMarkdown(packet)}\n`)
  if (!options.output && !options.markdownOutput) {
    console.log(JSON.stringify({
      ok: packet.ok,
      contract: packet.contract,
      status: packet.status,
      day0ReadyForOwnerPrivateHandoff: packet.day0ReadyForOwnerPrivateHandoff,
      baselinePacketAccepted: packet.day0Readiness.baselinePacketAccepted,
      intakePacketAccepted: packet.day0Readiness.intakePacketAccepted,
      blockers: packet.blockers,
      externalWritesPerformed: false,
    }, null, 2))
  } else {
    console.log(JSON.stringify({
      ok: packet.ok,
      contract: packet.contract,
      status: packet.status,
      output: options.output ? resolve(options.output) : null,
      markdownOutput: options.markdownOutput ? resolve(options.markdownOutput) : null,
      digest: packet.digest,
      externalWritesPerformed: false,
    }))
  }
  if (!packet.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_DAY0_READINESS_CONTRACT,
      error: String(error?.message || 'shop_pilot_day0_failed').slice(0, 260),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
