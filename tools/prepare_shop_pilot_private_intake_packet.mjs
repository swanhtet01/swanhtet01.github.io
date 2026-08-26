#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'
import { verifyShopPilotPublicBoundaryFiles } from './verify_shop_pilot_public_boundary.mjs'

export const SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT = 'supermega.shop.pilot_private_intake_packet.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const REQUIRED_BLOCKING_GATES = ['preview_rehearsal', 'pilot_evidence', 'production_activation']
const REQUIRED_FALSE_CONTROLS = [
  'automaticSendAllowed',
  'paymentAllowed',
  'deploymentAllowed',
  'productionActivationAllowed',
  'hostedWritesAllowed',
  'externalWritesPerformed',
  'customerContactPerformed',
  'managedActivation',
  'managedActivationReady',
  'managedPersistenceReady',
  'shopPilotProof',
  'pilotProof',
  'promotionEvidence',
  'readyToRecord',
  'paymentAccepted',
  'stockMovementPerformed',
  'serverWritePerformed',
  'hostedWritePerformed',
  'credentialChangePerformed',
  'providerMutationPerformed',
]
const REQUIRED_SCRIPTS = {
  'client:pilot:workspace': 'node tools/manage_shop_pilot_workspace.mjs',
  'client:pilot:workspace:self-test': 'node tools/test_shop_pilot_workspace.mjs && npm run client:pilot:public-boundary:self-test',
  'client:pilot:handoff': 'node tools/create_shop_pilot_handoff.mjs',
  'client:pilot:handoff:self-test': 'node --test tools/create_shop_pilot_handoff.test.mjs',
  'client:pilot:observed-evidence': 'node tools/record_shop_pilot_observed_run.mjs',
  'client:pilot:observed-evidence:self-test': 'node --test tools/record_shop_pilot_observed_run.test.mjs',
  'client:pilot:public-boundary:verify': 'node tools/verify_shop_pilot_public_boundary.mjs --file hq/readiness/shop-pilot-public-boundary.json',
  'shop:run001:claims:verify': 'node tools/verify_shop_run001_claims_guard.mjs',
  'shop:pilot:launch-gate:verify': 'node tools/verify_shop_pilot_launch_gate.mjs --verify',
  'shop:pilot:intake-packet': 'node tools/prepare_shop_pilot_private_intake_packet.mjs',
  'shop:pilot:intake-packet:self-test': 'node --test tools/prepare_shop_pilot_private_intake_packet.test.mjs && node tools/prepare_shop_pilot_private_intake_packet.mjs --self-test',
  'shop:pilot:baseline-packet': 'node tools/prepare_shop_pilot_baseline_packet.mjs',
  'shop:pilot:baseline-packet:self-test': 'node --test tools/prepare_shop_pilot_baseline_packet.test.mjs && node tools/prepare_shop_pilot_baseline_packet.mjs --self-test',
}
const SAFE_CHECK_COMMANDS = [
  'npm.cmd run client:pilot:workspace:self-test',
  'npm.cmd run client:pilot:handoff:self-test',
  'npm.cmd run client:pilot:observed-evidence:self-test',
  'npm.cmd run client:pilot:public-boundary:verify',
  'npm.cmd run shop:pilot:launch-gate:verify',
]
const OWNER_ONLY_COMMANDS = [
  'npm.cmd run client:pilot:workspace -- --start --workspace [private intake folder]',
  'npm.cmd run client:pilot:workspace -- --init --intake-bundle [downloaded private bundle] --workspace [private pilot workspace]',
  'npm.cmd run client:pilot:workspace -- --prepare --workspace [private pilot workspace]',
  'npm.cmd run client:pilot:workspace -- --decide --workspace [private pilot workspace]',
  'npm.cmd run client:pilot:observed-evidence -- --record --run-input [private observed run input] --workspace [private pilot workspace]',
  'npm.cmd run client:pilot:observed-evidence -- --verify --workspace [private pilot workspace]',
]
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function hasSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

function controlsFalse(record) {
  return isRecord(record) && REQUIRED_FALSE_CONTROLS.every((key) => record[key] === false)
}

function scriptCoverage(packageManifest) {
  const scripts = packageManifest?.scripts || {}
  return Object.fromEntries(Object.entries(REQUIRED_SCRIPTS).map(([name, command]) => [
    name,
    { command, present: scripts[name] === command },
  ]))
}

function assertCurrentSources(input, failures) {
  const packageManifest = input.packageManifest || {}
  const readiness = input.readiness || {}
  const publicBoundary = input.publicBoundary || {}
  const publicBoundaryVerification = input.publicBoundaryVerification || {}

  if (input.repository !== REPOSITORY) addFailure(failures, 'shop_pilot_private_intake_repository_invalid')
  if (packageManifest.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') {
    addFailure(failures, 'shop_pilot_private_intake_supabase_target_invalid')
  }
  for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
    if (packageManifest.scripts?.[name] !== command) addFailure(failures, `shop_pilot_private_intake_script_missing:${name}`)
  }

  if (readiness.contract !== 'supermega.managed-pilot-readiness.v5') addFailure(failures, 'shop_pilot_private_intake_readiness_contract_invalid')
  if (readiness.pilotMode !== 'owner_named') addFailure(failures, 'shop_pilot_private_intake_pilot_mode_invalid')
  if (readiness.overall?.status !== 'blocked'
    || readiness.overall?.hostedActivationReady !== false
    || readiness.overall?.blockingGateCount !== REQUIRED_BLOCKING_GATES.length
    || !sameArray(readiness.overall?.blockingGateIds, REQUIRED_BLOCKING_GATES)) {
    addFailure(failures, 'shop_pilot_private_intake_readiness_overall_invalid')
  }
  if (readiness.liveProduction?.operatingMode !== 'isolated_demo'
    || readiness.liveProduction?.managedWritesEnabled !== false
    || readiness.liveProduction?.productionMutationAuthorized !== false) {
    addFailure(failures, 'shop_pilot_private_intake_live_production_invalid')
  }
  if (readiness.previewRehearsal?.proofComplete !== false
    || readiness.previewRehearsal?.productionRefsRejected !== true
    || readiness.previewRehearsal?.productionDataRejected !== true
    || readiness.previewRehearsal?.privilegedRuntimeCredentialsRejected !== true) {
    addFailure(failures, 'shop_pilot_private_intake_preview_rehearsal_invalid')
  }
  if (readiness.pilotEvidence?.pilotMode !== 'owner_named'
    || readiness.pilotEvidence?.productId !== 'shop'
    || readiness.pilotEvidence?.proofComplete !== false
    || readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns !== 20
    || readiness.pilotEvidence?.acceptedConsecutiveRuns !== 0
    || readiness.pilotEvidence?.syntheticEvidenceAccepted !== false
    || readiness.pilotEvidence?.publicIdentityAllowed !== false
    || readiness.pilotEvidence?.privateWorkspaceRequired !== true) {
    addFailure(failures, 'shop_pilot_private_intake_pilot_evidence_invalid')
  }
  if (readiness.controls?.externalWritesPerformed !== false
    || readiness.controls?.productionWritesEnabled !== false
    || readiness.controls?.ownerApprovalRequired !== true) {
    addFailure(failures, 'shop_pilot_private_intake_readiness_controls_invalid')
  }

  if (publicBoundary.contract !== 'supermega.shop.pilot_public_boundary.v1'
    || publicBoundary.product !== 'shop'
    || publicBoundary.pilotMode !== 'owner_named'
    || publicBoundary.stage !== 'owner-decision-required'
    || !['revise', 'decline'].includes(publicBoundary.decision)
    || publicBoundary.acceptedRuns !== 0
    || publicBoundary.consecutiveAcceptedRuns !== 0
    || publicBoundary.participantIdentityPresent !== false
    || publicBoundary.secretValuesExposed !== false
    || !controlsFalse(publicBoundary.controls)) {
    addFailure(failures, 'shop_pilot_private_intake_public_boundary_invalid')
  }
  if (publicBoundaryVerification.ok !== true
    || publicBoundaryVerification.externalWritesPerformed !== false
    || publicBoundaryVerification.customerContactPerformed !== false
    || !Array.isArray(publicBoundaryVerification.fileDigests)
    || publicBoundaryVerification.fileDigests.length !== 1) {
    addFailure(failures, 'shop_pilot_private_intake_public_boundary_verification_invalid')
  }
  if (hasSecretShape({ readiness, publicBoundary })) addFailure(failures, 'shop_pilot_private_intake_source_secret_shape_detected')
}

export function buildShopPilotPrivateIntakePacket(input = {}) {
  const failures = []
  assertCurrentSources(input, failures)

  const readiness = input.readiness || {}
  const publicBoundary = input.publicBoundary || {}
  const publicBoundaryVerification = input.publicBoundaryVerification || {}
  const packageManifest = input.packageManifest || {}
  const gitState = input.gitState || {}
  const body = {
    contract: SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    repository: REPOSITORY,
    product: 'shop',
    pilotMode: 'owner_named',
    status: failures.length ? 'blocked' : 'owner_private_intake_ready',
    ok: failures.length === 0,
    failures,
    sourceState: {
      branch: gitState.branch || null,
      head: gitState.head || null,
      clean: gitState.clean === true,
      publicBoundaryDigest: publicBoundaryVerification.fileDigests?.[0] || null,
      readinessDigest: input.readinessDigest || null,
    },
    portfolioBoundary: {
      customerProducts: REQUIRED_PRODUCTS,
      firstPilotProduct: 'shop',
      aiIsSharedCapability: true,
      nextProductSequenceAfterShop: ['plant', 'website', 'ecommerce'],
    },
    publicSafeRules: {
      allowedOutsidePrivateWorkspace: ['stage labels', 'counts', 'booleans', 'digests', 'gate ids', 'safe commands'],
      forbiddenOutsidePrivateWorkspace: ['participant identity', 'raw operator notes', 'raw pilot inputs', 'credential values', 'message bodies'],
      privateWorkspaceRequired: readiness.pilotEvidence?.privateWorkspaceRequired === true,
      publicIdentityAllowed: readiness.pilotEvidence?.publicIdentityAllowed === true,
      syntheticEvidenceAccepted: readiness.pilotEvidence?.syntheticEvidenceAccepted === true,
    },
    readiness: {
      contract: readiness.contract || null,
      overallStatus: readiness.overall?.status || null,
      hostedActivationReady: readiness.overall?.hostedActivationReady === true,
      blockingGateIds: Array.isArray(readiness.overall?.blockingGateIds) ? [...readiness.overall.blockingGateIds] : [],
      liveOperatingMode: readiness.liveProduction?.operatingMode || null,
      managedWritesEnabled: readiness.liveProduction?.managedWritesEnabled === true,
      previewRehearsalProofComplete: readiness.previewRehearsal?.proofComplete === true,
      pilotProofComplete: readiness.pilotEvidence?.proofComplete === true,
      requiredAcceptedConsecutiveRuns: readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns ?? null,
      acceptedConsecutiveRuns: readiness.pilotEvidence?.acceptedConsecutiveRuns ?? null,
    },
    publicBoundary: {
      stage: publicBoundary.stage || null,
      decision: publicBoundary.decision || null,
      acceptedRuns: publicBoundary.acceptedRuns ?? null,
      consecutiveAcceptedRuns: publicBoundary.consecutiveAcceptedRuns ?? null,
      participantIdentityPresent: publicBoundary.participantIdentityPresent === true,
      secretValuesExposed: publicBoundary.secretValuesExposed === true,
      externalWritesPerformed: publicBoundaryVerification.externalWritesPerformed === true,
      customerContactPerformed: publicBoundaryVerification.customerContactPerformed === true,
    },
    ownerPrivateIntake: {
      authority: 'owner_private_workspace_only',
      status: failures.length ? 'blocked' : 'owner_action_required',
      requiredPrivateStages: [
        { id: 'intake_starter', purpose: 'collect owner-approved pilot boundaries offline', storedOutsideGit: true, mayContainIdentity: true },
        { id: 'workspace_prepare', purpose: 'create local-only reviewed preparation artifacts', storedOutsideGit: true, mayContainIdentity: true },
        { id: 'owner_decision', purpose: 'approve, revise, or decline the unsent pilot materials', storedOutsideGit: true, mayContainIdentity: true },
        { id: 'observed_runs', purpose: 'record real operator-reviewed runs after observation begins', storedOutsideGit: true, mayContainIdentity: true },
      ],
      promotionEvidenceRequiredAcceptedRuns: 20,
      promotionEvidenceAcceptedRuns: readiness.pilotEvidence?.acceptedConsecutiveRuns ?? 0,
      promotionEvidenceRequiresFiveDaySequenceCoverage: true,
      minimumManualRunsBeforeDayOne: 3,
      fiveDayPilotSequence: ['walkthrough', 'reviewed_orders', 'daily_close_exception', 'return_reload_retry', 'evidence_review_backup'],
    },
    commands: {
      safeLocalVerification: SAFE_CHECK_COMMANDS,
      ownerOnlyPrivateWorkspace: OWNER_ONLY_COMMANDS,
    },
    scriptCoverage: scriptCoverage(packageManifest),
    controls: {
      noWritePacket: true,
      createPrivateWorkspacePerformed: false,
      customerContactAllowed: false,
      customerContactPerformed: false,
      automaticSendAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      hostedWritesAllowed: false,
      githubWritesAllowed: false,
      vercelDeployAllowed: false,
      supabaseWritesAllowed: false,
      productionReleaseAllowed: false,
      managedActivationAllowed: false,
      externalEffectsAllowed: false,
      credentialValuesIncluded: false,
      ownerApprovalRequiredBeforeExternalEffects: true,
    },
    nextGates: [
      { id: 'owner_private_intake', status: failures.length ? 'blocked' : 'owner_action_required', blocks: true },
      { id: 'github_main_protection', status: 'owner_approval_required', blocks: true },
      { id: 'exact_preview_rehearsal', status: 'owner_approval_required', blocks: true },
      { id: 'real_shop_pilot_evidence', status: 'blocked', blocks: true },
      { id: 'managed_activation', status: 'owner_approval_required', blocks: true },
    ],
  }
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotPrivateIntakePacket(packet) {
  if (!isRecord(packet) || packet.contract !== SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT) {
    throw new Error('shop_pilot_private_intake_packet_contract_invalid')
  }
  const { digest: actualDigest, ...body } = packet
  if (actualDigest !== digest(JSON.stringify(body))) throw new Error('shop_pilot_private_intake_packet_digest_invalid')
  if (packet.ok !== true || packet.status !== 'owner_private_intake_ready' || packet.failures?.length !== 0) {
    throw new Error('shop_pilot_private_intake_packet_not_ready')
  }
  if (packet.product !== 'shop' || packet.pilotMode !== 'owner_named') throw new Error('shop_pilot_private_intake_packet_scope_invalid')
  if (packet.readiness?.hostedActivationReady !== false
    || packet.readiness?.managedWritesEnabled !== false
    || packet.readiness?.previewRehearsalProofComplete !== false
    || packet.readiness?.pilotProofComplete !== false
    || packet.readiness?.requiredAcceptedConsecutiveRuns !== 20
    || packet.readiness?.acceptedConsecutiveRuns !== 0) {
    throw new Error('shop_pilot_private_intake_packet_readiness_invalid')
  }
  if (packet.publicBoundary?.participantIdentityPresent !== false
    || packet.publicBoundary?.secretValuesExposed !== false
    || packet.publicBoundary?.externalWritesPerformed !== false
    || packet.publicBoundary?.customerContactPerformed !== false) {
    throw new Error('shop_pilot_private_intake_packet_public_boundary_invalid')
  }
  if (packet.controls?.noWritePacket !== true
    || packet.controls?.customerContactAllowed !== false
    || packet.controls?.paymentAllowed !== false
    || packet.controls?.hostedWritesAllowed !== false
    || packet.controls?.productionReleaseAllowed !== false
    || packet.controls?.managedActivationAllowed !== false
    || packet.controls?.externalEffectsAllowed !== false
    || packet.controls?.credentialValuesIncluded !== false
    || packet.controls?.ownerApprovalRequiredBeforeExternalEffects !== true) {
    throw new Error('shop_pilot_private_intake_packet_controls_invalid')
  }
  if (hasSecretShape(packet)) throw new Error('shop_pilot_private_intake_packet_secret_shape_detected')
  return packet
}

export function renderShopPilotPrivateIntakeMarkdown(packet) {
  validateShopPilotPrivateIntakePacket(packet)
  return `# SuperMega Shop Pilot Private Intake Packet

- Contract: ${packet.contract}
- Status: ${packet.status}
- Repository: ${packet.repository}
- Candidate: ${packet.sourceState.branch || 'unknown'} @ ${packet.sourceState.head || 'unknown'}
- Public boundary digest: ${packet.sourceState.publicBoundaryDigest || 'missing'}

## What this packet allows

Owner-private intake preparation only. It does not allow customer contact, payment, stock movement, deployment, hosted writes, production release, credential change, or managed activation.

## Product order

Shop is first. Plant, Website, and Ecommerce stay in security, dependency, and regression maintenance until Shop has real accepted evidence.

## Required private stages

${packet.ownerPrivateIntake.requiredPrivateStages.map((stage) => `- ${stage.id}: ${stage.purpose}; stored outside Git: ${stage.storedOutsideGit}; may contain identity: ${stage.mayContainIdentity}`).join('\n')}

## Verification commands

${packet.commands.safeLocalVerification.map((command) => `- ${command}`).join('\n')}

## Owner-only private workspace commands

${packet.commands.ownerOnlyPrivateWorkspace.map((command) => `- ${command}`).join('\n')}

## Gates still blocking activation

${packet.nextGates.map((gate) => `- ${gate.id}: ${gate.status}; blocks: ${gate.blocks}`).join('\n')}

## Evidence rule

Promotion evidence still requires ${packet.ownerPrivateIntake.promotionEvidenceRequiredAcceptedRuns} consecutive accepted real runs whose accepted streak covers pilot days 1 through 5. Current accepted run count is ${packet.ownerPrivateIntake.promotionEvidenceAcceptedRuns}.
`
}

function git(args, { optional = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_000_000,
    windowsHide: true,
  })
  if (!optional && result.status !== 0) throw new Error(`shop_pilot_private_intake_git_failed:${args.join(' ')}`)
  return result.status === 0 ? String(result.stdout || '').trim() : null
}

function currentGitState() {
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(['rev-parse', 'HEAD']),
    clean: git(['status', '--porcelain']).length === 0,
  }
}

function runNoWriteVerifier(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 2_000_000,
    windowsHide: true,
  })
  if (result.status !== 0) {
    const error = String(result.stderr || result.stdout || 'failed').replace(/\s+/g, ' ').slice(0, 220)
    throw new Error(`shop_pilot_private_intake_dependency_failed:${args.join(' ')}:${error}`)
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}

async function currentPacket() {
  runNoWriteVerifier(['tools/manage_managed_pilot_readiness.mjs', '--verify'])
  runNoWriteVerifier(['tools/verify_shop_pilot_public_boundary.mjs', '--file', 'hq/readiness/shop-pilot-public-boundary.json'])
  runNoWriteVerifier(['tools/verify_shop_run001_claims_guard.mjs'])
  const readinessRaw = await readFile(resolve(root, 'hq/readiness/managed-pilot-readiness.json'), 'utf8')
  const publicBoundaryVerification = verifyShopPilotPublicBoundaryFiles(['hq/readiness/shop-pilot-public-boundary.json'])
  return buildShopPilotPrivateIntakePacket({
    generatedAt: new Date().toISOString(),
    repository: REPOSITORY,
    packageManifest: await readJson('package.json'),
    readiness: validateManagedPilotReadiness(JSON.parse(readinessRaw)),
    readinessDigest: digest(readinessRaw),
    publicBoundary: await readJson('hq/readiness/shop-pilot-public-boundary.json'),
    publicBoundaryVerification,
    gitState: currentGitState(),
  })
}

async function writeOutput(path, content) {
  const resolved = resolve(path)
  await mkdir(dirname(resolved), { recursive: true })
  const staged = resolve(dirname(resolved), `.shop-pilot-private-intake.${randomUUID()}.tmp`)
  await writeFile(staged, content, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, resolved)
  return relative(root, resolved).split(sep).join('/')
}

function sampleControls() {
  return Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((key) => [key, false]))
}

export function sampleShopPilotPrivateIntakeInput(overrides = {}) {
  const packageManifest = {
    supermega: { productionSupabaseTargetStatus: 'protected-unapproved' },
    scripts: Object.fromEntries(Object.entries(REQUIRED_SCRIPTS)),
  }
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: {
      status: 'blocked',
      hostedActivationReady: false,
      blockingGateCount: REQUIRED_BLOCKING_GATES.length,
      blockingGateIds: [...REQUIRED_BLOCKING_GATES],
    },
    liveProduction: { operatingMode: 'isolated_demo', managedWritesEnabled: false, productionMutationAuthorized: false },
    previewRehearsal: {
      proofComplete: false,
      productionRefsRejected: true,
      productionDataRejected: true,
      privilegedRuntimeCredentialsRejected: true,
    },
    pilotEvidence: {
      pilotMode: 'owner_named',
      productId: 'shop',
      proofComplete: false,
      requiredAcceptedConsecutiveRuns: 20,
      acceptedConsecutiveRuns: 0,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
      privateWorkspaceRequired: true,
    },
    controls: {
      externalWritesPerformed: false,
      productionWritesEnabled: false,
      ownerApprovalRequired: true,
    },
  }
  const publicBoundary = {
    contract: 'supermega.shop.pilot_public_boundary.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    stage: 'owner-decision-required',
    decision: 'revise',
    controls: sampleControls(),
    acceptedRuns: 0,
    consecutiveAcceptedRuns: 0,
    participantIdentityPresent: false,
    secretValuesExposed: false,
  }
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: REPOSITORY,
    packageManifest,
    readiness,
    readinessDigest: `sha256:${'c'.repeat(64)}`,
    publicBoundary,
    publicBoundaryVerification: {
      ok: true,
      fileDigests: [`sha256:${'d'.repeat(64)}`],
      externalWritesPerformed: false,
      customerContactPerformed: false,
    },
    gitState: {
      branch: 'codex/release-stack-integration-rehearsal',
      head: 'a'.repeat(40),
      clean: true,
    },
    ...overrides,
  }
}

function runSelfTest() {
  const packet = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  validateShopPilotPrivateIntakePacket(packet)
  const tampered = { ...packet, status: 'ready_for_contact' }
  try {
    validateShopPilotPrivateIntakePacket(tampered)
    throw new Error('shop_pilot_private_intake_self_test_tamper_not_detected')
  } catch (error) {
    if (!String(error?.message || '').includes('digest_invalid')) throw error
  }
  const unsafe = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput({
    publicBoundaryVerification: {
      ok: true,
      fileDigests: [`sha256:${'d'.repeat(64)}`],
      externalWritesPerformed: false,
      customerContactPerformed: true,
    },
  }))
  if (unsafe.ok !== false || !unsafe.failures.includes('shop_pilot_private_intake_public_boundary_verification_invalid')) {
    throw new Error('shop_pilot_private_intake_self_test_public_boundary_not_detected')
  }
  const markdown = renderShopPilotPrivateIntakeMarkdown(packet)
  if (hasSecretShape(markdown) || !markdown.includes('Owner-private intake preparation only')) {
    throw new Error('shop_pilot_private_intake_self_test_markdown_invalid')
  }
  return {
    ok: true,
    contract: SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT,
    checks: 4,
    externalWritesPerformed: false,
  }
}

function parseArgs(argv) {
  const options = { verify: false, selfTest: false, output: null, file: null, format: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--verify') {
      options.verify = true
    } else if (arg === '--self-test') {
      options.selfTest = true
    } else if (arg === '--output') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('shop_pilot_private_intake_arguments_invalid')
      options.output = value
      index += 1
    } else if (arg === '--file') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('shop_pilot_private_intake_arguments_invalid')
      options.file = value
      index += 1
    } else if (arg === '--format') {
      const value = argv[index + 1]
      if (!['json', 'markdown'].includes(value)) throw new Error('shop_pilot_private_intake_arguments_invalid')
      options.format = value
      index += 1
    } else {
      throw new Error('shop_pilot_private_intake_arguments_invalid')
    }
  }
  if ([options.verify, options.selfTest].filter(Boolean).length > 1) throw new Error('shop_pilot_private_intake_arguments_invalid')
  if (options.file && !options.verify) throw new Error('shop_pilot_private_intake_arguments_invalid')
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest())}\n`)
    return
  }
  if (options.verify) {
    const packet = options.file
      ? validateShopPilotPrivateIntakePacket(JSON.parse(await readFile(resolve(options.file), 'utf8')))
      : validateShopPilotPrivateIntakePacket(await currentPacket())
    process.stdout.write(`${JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.status,
      externalWritesPerformed: false,
    })}\n`)
    return
  }
  const packet = validateShopPilotPrivateIntakePacket(await currentPacket())
  const format = options.format || (options.output && extname(options.output).toLowerCase() === '.md' ? 'markdown' : 'json')
  const content = format === 'markdown'
    ? renderShopPilotPrivateIntakeMarkdown(packet)
    : `${JSON.stringify(packet, null, 2)}\n`
  if (options.output) {
    const output = await writeOutput(options.output, content)
    process.stdout.write(`${JSON.stringify({ ok: true, contract: packet.contract, output, digest: digest(content), externalWritesPerformed: false })}\n`)
  } else {
    process.stdout.write(content)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_PRIVATE_INTAKE_PACKET_CONTRACT,
      error: String(error?.message || 'shop_pilot_private_intake_failed').slice(0, 240),
      externalWritesPerformed: false,
    })}\n`)
    process.exitCode = 1
  })
}
