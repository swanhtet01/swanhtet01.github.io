#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateShopAndroidQaHandoff } from './prepare_shop_android_qa_handoff.mjs'

export const REMOTE_ANDROID_QA_PREFLIGHT_CONTRACT =
  'supermega.shop.remote-android-qa-preflight.v1'

const MAX_RUNTIME_SECONDS = 6 * 60 * 60
const MAX_BUDGET_USD = 15
const MAX_RETENTION_REVIEW_HOURS = 24
const MIN_CPU_COUNT = 4
const MIN_MEMORY_MIB = 8192
const MIN_FREE_DISK_MIB = 20 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const SHA40 = /^[0-9a-f]{40}$/
const SHA64 = /^[0-9a-f]{64}$/
const DECIMAL_ID = /^[1-9][0-9]*$/

const REQUIRED_STEPS = [
  ['artifact_identity', 'Verify the retained archive, APK, source, run, tree, package and debug-signing boundary before launch.'],
  ['host_preflight', 'Verify x86_64, nested KVM, CPU, memory, disk, provider stop and private-loopback boundaries.'],
  ['scanner_key_input', 'Enter a leading-zero synthetic barcode as keyboard input and record intentional repeated-scan behavior.'],
  ['sale_commit', 'Reject short cash, commit exactly one fictional cash sale and record tender, change, stock and immutable receipt identity.'],
  ['receipt_capture', 'Capture simulated 58/80 mm output and reprint the same receipt without another sale, payment or stock effect.'],
  ['restart_reopen', 'Force-stop and reopen the QA package, then verify the same sale, stock, shift and receipt state.'],
  ['encrypted_restore', 'Export through the scoped synthetic-evidence path, restore into a fresh matching QA profile and verify no duplicate effect.'],
  ['evidence_export', 'Export only redacted hashes, manifests, screenshots, simulated receipts and logs before stopping the VM.'],
  ['stop_runtime', 'Stop the VM within six hours and inventory retained disk, IP and network cost pending a separate disposition decision.'],
]

const REQUIRED_EVIDENCE = [
  'artifact_identity',
  'host_kvm_resources',
  'network_loopback_boundary',
  'scanner_key_input',
  'sale_and_stock_effects',
  'receipt_capture_and_reprint',
  'restart_reopen',
  'encrypted_restore',
  'evidence_hash_manifest',
  'runtime_stop_and_retained_costs',
]

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function exactArtifactBinding(packet, expected = {}) {
  const artifact = packet?.artifact || {}
  return SHA40.test(String(expected.headSha || ''))
    && SHA40.test(String(expected.sourceSha || ''))
    && SHA40.test(String(expected.mergeSha || ''))
    && SHA40.test(String(expected.nativeTree || ''))
    && DECIMAL_ID.test(String(expected.runId || ''))
    && DECIMAL_ID.test(String(expected.artifactId || ''))
    && SHA64.test(String(expected.archiveSha256 || ''))
    && SHA64.test(String(expected.apkSha256 || ''))
    && expected.headSha === artifact.headSha
    && expected.sourceSha === artifact.sourceSha
    && expected.mergeSha === artifact.mergeSha
    && expected.nativeTree === artifact.nativeTree
    && expected.runId === artifact.runId
    && expected.artifactId === artifact.artifactId
    && expected.archiveSha256 === artifact.archiveSha256
    && expected.apkSha256 === artifact.apkSha256
}

function hasBlockedCapability(packet, id) {
  return Array.isArray(packet?.blockedCapabilities)
    && packet.blockedCapabilities.some((entry) => entry?.id === id && entry.status === 'BLOCKED')
}

export function assessRemoteAndroidQaPreflight(
  input = {},
  artifactPacket = {},
  { nowMillis = Date.now() } = {},
) {
  const failures = []
  let verifiedPacket = null
  try {
    verifiedPacket = validateShopAndroidQaHandoff(artifactPacket, { nowMillis })
  } catch {
    addFailure(failures, 'artifact_handoff_invalid')
  }

  if (input.mode !== 'dry_run') addFailure(failures, 'dry_run_mode_required')
  if (!verifiedPacket || !exactArtifactBinding(verifiedPacket, input.expectedArtifact)) {
    addFailure(failures, 'artifact_expectation_mismatch')
  }

  const host = input.host || {}
  if (host.provider !== 'gcp' || host.machineType !== 'n2-standard-4') {
    addFailure(failures, 'host_shape_unapproved')
  }
  if (host.architecture !== 'x86_64'
    || host.nestedVirtualization !== true
    || !Number.isInteger(host.vmxCount) || host.vmxCount < 1
    || host.devKvmPresent !== true || host.devKvmUsable !== true) {
    addFailure(failures, 'host_kvm_unavailable')
  }
  if (!Number.isInteger(host.cpuCount) || host.cpuCount < MIN_CPU_COUNT) {
    addFailure(failures, 'host_cpu_insufficient')
  }
  if (!Number.isInteger(host.totalMemoryMiB) || host.totalMemoryMiB < MIN_MEMORY_MIB) {
    addFailure(failures, 'host_memory_insufficient')
  }
  if (!Number.isInteger(host.freeDiskMiB) || host.freeDiskMiB < MIN_FREE_DISK_MIB) {
    addFailure(failures, 'host_disk_insufficient')
  }
  if (host.observationSource !== 'planned_fixture'
    && host.observationSource !== 'reported_remote_host_preflight') {
    addFailure(failures, 'host_observation_source_invalid')
  }

  const provider = input.provider || {}
  if (provider.accountAccessVerified !== true
    || provider.projectVerified !== true
    || provider.billingVerified !== true
    || provider.quotaVerified !== true
    || provider.orgPolicyVerified !== true
    || provider.provisioningAuthorized !== true) {
    addFailure(failures, 'provider_prerequisites_unverified')
  }

  const network = input.network || {}
  if (!LOOPBACK_HOSTS.has(network.adbHost)
    || !LOOPBACK_HOSTS.has(network.emulatorConsoleHost)
    || !LOOPBACK_HOSTS.has(network.grpcHost)
    || network.iapSshOnly !== true
    || !Array.isArray(network.publicInboundPorts)
    || network.publicInboundPorts.length !== 0) {
    addFailure(failures, 'network_not_private_loopback')
  }
  if (network.adbTcpipEnabled !== false || network.adbListenAll !== false) {
    addFailure(failures, 'adb_remote_mode_forbidden')
  }
  if (network.serviceAccountAttached !== false
    || !Array.isArray(network.cloudApiScopes) || network.cloudApiScopes.length !== 0
    || network.productionSecretsPresent !== false
    || network.credentialFilesPresent !== false
    || network.providerAccessFromApp !== false) {
    addFailure(failures, 'credential_or_provider_boundary_invalid')
  }

  const data = input.testData || {}
  if (data.classification !== 'synthetic'
    || data.fictionalStoreOnly !== true
    || data.containsPersonalData !== false
    || data.containsProductionIdentifiers !== false
    || data.containsWalletOrProviderIdentifiers !== false
    || data.networkProviderCallsEnabled !== false) {
    addFailure(failures, 'synthetic_data_boundary_invalid')
  }

  const session = input.session || {}
  if (!Number.isInteger(session.maxRunSeconds)
    || session.maxRunSeconds < 1 || session.maxRunSeconds > MAX_RUNTIME_SECONDS
    || session.terminationAction !== 'STOP'
    || session.automaticRestart !== false
    || session.automaticDelete !== false
    || session.deletionAuthorized !== false) {
    addFailure(failures, 'session_runtime_boundary_invalid')
  }
  if (!finiteNumber(session.budgetUsd) || session.budgetUsd <= 0
    || session.budgetUsd > MAX_BUDGET_USD
    || !finiteNumber(session.estimatedComputeUsd) || session.estimatedComputeUsd < 0
    || !finiteNumber(session.estimatedRetainedDailyUsd) || session.estimatedRetainedDailyUsd < 0
    || session.estimatedComputeUsd + session.estimatedRetainedDailyUsd > session.budgetUsd) {
    addFailure(failures, 'session_budget_invalid')
  }
  if (!Number.isInteger(session.retentionReviewHours)
    || session.retentionReviewHours < 1
    || session.retentionReviewHours > MAX_RETENTION_REVIEW_HOURS) {
    addFailure(failures, 'retention_review_invalid')
  }

  const evidence = input.evidence || {}
  if (evidence.exportBeforeStop !== true
    || evidence.redacted !== true
    || evidence.containsCredentialValues !== false
    || evidence.containsCustomerData !== false
    || evidence.privateDestinationConfirmed !== true
    || evidence.hashManifestRequired !== true
    || evidence.retainOriginalArtifactUnchanged !== true) {
    addFailure(failures, 'evidence_export_boundary_invalid')
  }
  if (!Array.isArray(evidence.required)
    || evidence.required.length !== REQUIRED_EVIDENCE.length
    || evidence.required.some((entry, index) => entry !== REQUIRED_EVIDENCE[index])) {
    addFailure(failures, 'evidence_inventory_invalid')
  }

  if (!Array.isArray(input.steps)
    || input.steps.length !== REQUIRED_STEPS.length
    || input.steps.some((step, index) => step?.id !== REQUIRED_STEPS[index][0]
      || step.instruction !== REQUIRED_STEPS[index][1]
      || step.required !== true || step.status !== 'PLANNED')) {
    addFailure(failures, 'acceptance_steps_invalid')
  }

  if (verifiedPacket && hasBlockedCapability(verifiedPacket, 'encrypted_backup_restore')) {
    addFailure(failures, 'artifact_encrypted_restore_unavailable')
  }
  if (verifiedPacket && hasBlockedCapability(verifiedPacket, 'external_file_export')) {
    addFailure(failures, 'artifact_scoped_evidence_export_unavailable')
  }
  if (verifiedPacket?.artifact?.productionSigned !== false
    || verifiedPacket?.artifact?.promotionEligible !== false) {
    addFailure(failures, 'artifact_claim_boundary_invalid')
  }

  const observedAtMillis = Date.parse(input.observedAt || '')
  if (!Number.isFinite(observedAtMillis)) addFailure(failures, 'observed_at_invalid')

  // A dependency-free packet can validate reported planning input, but cannot
  // authenticate provider access or host observations. This v1 contract never
  // authorizes or labels a remote run READY.
  addFailure(failures, 'external_remote_observation_required')

  const body = {
    contract: REMOTE_ANDROID_QA_PREFLIGHT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    observedAt: input.observedAt || null,
    mode: 'dry_run',
    evidenceLevel: 'caller_reported_offline_plan',
    ok: false,
    status: 'BLOCKED_OFFLINE_PLAN',
    failures,
    artifact: verifiedPacket ? {
      handoffDigest: verifiedPacket.digest,
      headSha: verifiedPacket.artifact.headSha,
      sourceSha: verifiedPacket.artifact.sourceSha,
      mergeSha: verifiedPacket.artifact.mergeSha,
      nativeTree: verifiedPacket.artifact.nativeTree,
      runId: verifiedPacket.artifact.runId,
      artifactId: verifiedPacket.artifact.artifactId,
      archiveSha256: verifiedPacket.artifact.archiveSha256,
      apkSha256: verifiedPacket.artifact.apkSha256,
      applicationId: verifiedPacket.artifact.applicationId,
      signingClass: verifiedPacket.artifact.signingClass,
      productionSigned: false,
      promotionEligible: false,
    } : null,
    host: {
      provider: host.provider || null,
      machineType: host.machineType || null,
      architecture: host.architecture || null,
      reportedKvmEligible: host.nestedVirtualization === true && host.vmxCount > 0
        && host.devKvmPresent === true && host.devKvmUsable === true,
      cpuCount: host.cpuCount ?? null,
      totalMemoryMiB: host.totalMemoryMiB ?? null,
      freeDiskMiB: host.freeDiskMiB ?? null,
    },
    network: {
      reportedPrivateLoopbackOnly: !failures.includes('network_not_private_loopback')
        && !failures.includes('adb_remote_mode_forbidden'),
      serviceAccountAttached: network.serviceAccountAttached ?? null,
      cloudApiScopeCount: Array.isArray(network.cloudApiScopes)
        ? network.cloudApiScopes.length : null,
      credentialsPresent: network.credentialFilesPresent ?? null,
      productionSecretsPresent: network.productionSecretsPresent ?? null,
    },
    provider: {
      reportedPrerequisitesComplete: provider.accountAccessVerified === true
        && provider.projectVerified === true
        && provider.billingVerified === true
        && provider.quotaVerified === true
        && provider.orgPolicyVerified === true
        && provider.provisioningAuthorized === true,
      authenticatedByThisPacket: false,
    },
    session: {
      maxRunSeconds: session.maxRunSeconds ?? null,
      terminationAction: session.terminationAction || null,
      budgetUsd: session.budgetUsd ?? null,
      estimatedComputeUsd: session.estimatedComputeUsd ?? null,
      estimatedRetainedDailyUsd: session.estimatedRetainedDailyUsd ?? null,
      retentionReviewHours: session.retentionReviewHours ?? null,
      automaticDelete: false,
      deletionAuthorized: false,
    },
    steps: REQUIRED_STEPS.map(([id, instruction]) => ({
      id,
      instruction,
      required: true,
      status: failures.some((failure) => failure.startsWith('artifact_')
        && ['encrypted_restore', 'evidence_export'].includes(id)) ? 'BLOCKED' : 'PLANNED',
    })),
    requiredEvidence: [...REQUIRED_EVIDENCE],
    claimBoundary: {
      cloudCommandsExecuted: false,
      emulatorExecuted: false,
      databaseExecuted: false,
      sdkDownloaded: false,
      credentialsUsed: false,
      providerStateChanged: false,
      installedAcceptanceProven: false,
      hardwareAcceptanceProven: false,
      productionReady: false,
    },
  }
  return { ...body, digest: digest(body) }
}

export function validateRemoteAndroidQaPreflight(packet) {
  const body = { ...packet }
  const packetDigest = body.digest
  delete body.digest
  if (packetDigest !== digest(body)) throw new Error('remote_android_qa_preflight_digest_invalid')
  if (packet.contract !== REMOTE_ANDROID_QA_PREFLIGHT_CONTRACT
    || packet.mode !== 'dry_run'
    || packet.evidenceLevel !== 'caller_reported_offline_plan'
    || !Array.isArray(packet.failures)
    || !Array.isArray(packet.steps)
    || packet.steps.length !== REQUIRED_STEPS.length
    || packet.steps.some((step, index) => step?.id !== REQUIRED_STEPS[index][0]
      || step.instruction !== REQUIRED_STEPS[index][1] || step.required !== true)
    || !Array.isArray(packet.requiredEvidence)
    || JSON.stringify(packet.requiredEvidence) !== JSON.stringify(REQUIRED_EVIDENCE)
    || packet.claimBoundary?.cloudCommandsExecuted !== false
    || packet.claimBoundary?.emulatorExecuted !== false
    || packet.claimBoundary?.databaseExecuted !== false
    || packet.claimBoundary?.sdkDownloaded !== false
    || packet.claimBoundary?.credentialsUsed !== false
    || packet.claimBoundary?.providerStateChanged !== false
    || packet.claimBoundary?.installedAcceptanceProven !== false
    || packet.claimBoundary?.hardwareAcceptanceProven !== false
    || packet.claimBoundary?.productionReady !== false) {
    throw new Error('remote_android_qa_preflight_contract_invalid')
  }
  if (packet.ok !== false
    || packet.status !== 'BLOCKED_OFFLINE_PLAN'
    || packet.failures.length === 0
    || !packet.failures.includes('external_remote_observation_required')
    || packet.provider?.authenticatedByThisPacket !== false) {
    throw new Error('remote_android_qa_preflight_blocked_state_invalid')
  }
  return packet
}

export function sampleRemoteAndroidQaPreflightInput(artifactPacket, overrides = {}) {
  const artifact = artifactPacket.artifact
  const base = {
    mode: 'dry_run',
    observedAt: '2026-10-26T18:00:00.000Z',
    expectedArtifact: {
      headSha: artifact.headSha,
      sourceSha: artifact.sourceSha,
      mergeSha: artifact.mergeSha,
      nativeTree: artifact.nativeTree,
      runId: artifact.runId,
      artifactId: artifact.artifactId,
      archiveSha256: artifact.archiveSha256,
      apkSha256: artifact.apkSha256,
    },
    host: {
      provider: 'gcp',
      machineType: 'n2-standard-4',
      architecture: 'x86_64',
      nestedVirtualization: true,
      vmxCount: 4,
      devKvmPresent: true,
      devKvmUsable: true,
      cpuCount: 4,
      totalMemoryMiB: 16384,
      freeDiskMiB: 40960,
      observationSource: 'planned_fixture',
    },
    provider: {
      accountAccessVerified: true,
      projectVerified: true,
      billingVerified: true,
      quotaVerified: true,
      orgPolicyVerified: true,
      provisioningAuthorized: true,
    },
    network: {
      adbHost: '127.0.0.1',
      emulatorConsoleHost: '127.0.0.1',
      grpcHost: '127.0.0.1',
      iapSshOnly: true,
      publicInboundPorts: [],
      adbTcpipEnabled: false,
      adbListenAll: false,
      serviceAccountAttached: false,
      cloudApiScopes: [],
      productionSecretsPresent: false,
      credentialFilesPresent: false,
      providerAccessFromApp: false,
    },
    testData: {
      classification: 'synthetic',
      fictionalStoreOnly: true,
      containsPersonalData: false,
      containsProductionIdentifiers: false,
      containsWalletOrProviderIdentifiers: false,
      networkProviderCallsEnabled: false,
    },
    session: {
      maxRunSeconds: MAX_RUNTIME_SECONDS,
      terminationAction: 'STOP',
      automaticRestart: false,
      automaticDelete: false,
      deletionAuthorized: false,
      budgetUsd: MAX_BUDGET_USD,
      estimatedComputeUsd: 4.15,
      estimatedRetainedDailyUsd: 0.25,
      retentionReviewHours: MAX_RETENTION_REVIEW_HOURS,
    },
    evidence: {
      exportBeforeStop: true,
      redacted: true,
      containsCredentialValues: false,
      containsCustomerData: false,
      privateDestinationConfirmed: true,
      hashManifestRequired: true,
      retainOriginalArtifactUnchanged: true,
      required: [...REQUIRED_EVIDENCE],
    },
    steps: REQUIRED_STEPS.map(([id, instruction]) => ({
      id,
      instruction,
      required: true,
      status: 'PLANNED',
    })),
  }
  return {
    ...base,
    ...overrides,
    expectedArtifact: { ...base.expectedArtifact, ...(overrides.expectedArtifact || {}) },
    host: { ...base.host, ...(overrides.host || {}) },
    provider: { ...base.provider, ...(overrides.provider || {}) },
    network: { ...base.network, ...(overrides.network || {}) },
    testData: { ...base.testData, ...(overrides.testData || {}) },
    session: { ...base.session, ...(overrides.session || {}) },
    evidence: { ...base.evidence, ...(overrides.evidence || {}) },
  }
}

function parseArgs(argv) {
  const args = {
    input: null,
    artifactPacket: null,
    output: null,
    selfTest: false,
    dryRun: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') args.input = argv[++index]
    else if (arg === '--artifact-packet') args.artifactPacket = argv[++index]
    else if (arg === '--output') args.output = argv[++index]
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--self-test') args.selfTest = true
    else throw new Error(`remote_android_qa_preflight_unknown_arg:${arg}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    console.log(JSON.stringify({
      ok: true,
      contract: `${REMOTE_ANDROID_QA_PREFLIGHT_CONTRACT}.self-test`,
      cloudCommandsExecuted: false,
      emulatorExecuted: false,
      sdkDownloaded: false,
    }))
    return
  }
  if (!args.dryRun) throw new Error('remote_android_qa_preflight_dry_run_flag_required')
  if (!args.input || !args.artifactPacket) {
    throw new Error('remote_android_qa_preflight_input_required')
  }
  const input = JSON.parse(await readFile(resolve(args.input), 'utf8'))
  const artifactPacket = JSON.parse(await readFile(resolve(args.artifactPacket), 'utf8'))
  const packet = validateRemoteAndroidQaPreflight(
    assessRemoteAndroidQaPreflight(input, artifactPacket),
  )
  if (args.output) {
    const output = resolve(args.output)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
  }
  console.log(JSON.stringify(packet, null, 2))
  if (!packet.ok) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
