#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const RELEASE_INTEGRATION_BATCH_CONTRACT = 'supermega.release-integration-batch.v1'
export const IDENTITY_DATA_BATCH = 'identity-data-onboarding'

const root = resolve(import.meta.dirname, '..')
const MAX_SOURCE_BYTES = 2_000_000
const MAX_OUTPUT_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const REF_PATTERN = /^(?:HEAD|origin\/main|[0-9a-f]{40}|(?:refs\/heads\/)?(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119})$/

export const IDENTITY_DATA_REQUIREMENTS = [
  {
    id: 'upstream-managed-account-client', authority: 'upstream', file: 'showroom/src/core/managed-trial.ts', tokens: [
      'export type ManagedWorkspaceDirectoryEntry',
      'export type ManagedWorkspaceSignIn',
      'export type ManagedAccountSetup',
      'export type ManagedCompanyBrief',
      'export type ManagedOwnerControlRun',
      'MANAGED_CLIENT_IMPORT_PREFLIGHT_CHECKS',
      'requestManagedPasswordRecovery',
      'beginManagedAccountSetup',
      'discoverManagedWorkspacesForCurrentSession',
      'completeManagedAccountPassword',
      'signInAndDiscoverManagedWorkspaces',
      'completeManagedWorkspaceSignIn',
      'preflightManagedClientImport',
      'loadManagedCompanyBrief',
      'retainManagedCompanyBrief',
      'loadManagedOwnerControlRun',
      'acknowledgeManagedOwnerControlItem',
      'validateManagedContextProfile',
      'retainManagedContextProfile',
    ],
  },
  {
    id: 'upstream-managed-account-server', authority: 'upstream', file: 'supermega_runtime/trial_runtime.py', tokens: [
      'class TrialClientImportApplyPreflightRequest',
      'class TrialCompanyBriefRequest',
      'class TrialCompanyBriefReceiptRequest',
      'class TrialOwnerControlAcknowledgementRequest',
      'class TrialManagedContextValidateRequest',
      'class TrialManagedContextRetainRequest',
      'def _company_brief_context(',
      'def _client_import_apply_preflight_digest(',
      'def _client_import_apply_preflight(',
    ],
  },
  {
    id: 'upstream-managed-account-ui', authority: 'upstream', file: 'showroom/src/core/SettingsPage.tsx', tokens: [
      "import { ManagedContextConsent } from './ManagedContextConsent'",
      'signInAndDiscoverManagedWorkspaces',
      'completeManagedWorkspaceSignIn',
      'loadManagedCompanyBrief',
      'retainManagedCompanyBrief',
    ],
  },
  {
    id: 'upstream-runtime-failure-tests', authority: 'upstream', file: 'tests/test_cloud_runtime.py', tokens: [
      'def test_agent_failures_are_classified_without_persisting_exception_text',
      'def test_error_completion_persists_only_the_safe_failure_contract',
    ],
  },
  {
    id: 'upstream-database-activation-tests', authority: 'upstream', file: 'tests/test_database_activation_contract.py', tokens: [
      'def test_historical_migrations_are_unchanged_and_v7_is_additive',
      'def test_production_activation_binds_tls_checkout_and_live_release_provenance',
      'def test_browser_auth_and_write_enablement_are_complete_and_ordered',
    ],
  },
  {
    id: 'candidate-client-import-context', authority: 'candidate', file: 'showroom/src/core/ClientDataOnboarding.tsx', tokens: [
      'shopIndustryPackId?: ShopIndustryPackId',
      'plantIndustryPackId?: PlantIndustryPackId',
      'onProgress?: (progress: ClientDemoProductProgress)',
      'initiallyOpen?: boolean',
    ],
  },
  {
    id: 'candidate-managed-plant-and-service-client', authority: 'candidate', file: 'showroom/src/core/managed-trial.ts', tokens: [
      'export type ManagedServiceScheduleRecord',
      'managedPlantEquipmentPackageDigest',
      'validateManagedPlantEquipmentImport',
      'applyManagedPlantEquipmentImport',
      'commissionManagedPlantEquipment',
      'saveManagedPlantEquipmentMaintenanceStrategy',
      'loadManagedServiceSchedule',
      'saveManagedServiceSchedule',
    ],
  },
  {
    id: 'candidate-managed-plant-and-service-server', authority: 'candidate', file: 'supermega_runtime/trial_runtime.py', tokens: [
      'def _current_yangon_date()',
      'class TrialPlantEquipmentCommissionRequest',
      'class TrialPlantEquipmentMaintenanceStrategyRequest',
      'class TrialServiceScheduleSaveRequest',
    ],
  },
  {
    id: 'candidate-four-product-setup-ui', authority: 'candidate', file: 'showroom/src/core/SettingsPage.tsx', tokens: [
      'buildClientCapabilityPlan',
      'createClientDemoWorkspace',
      'function changeShopIndustryPack',
      'function changePlantIndustryPack',
      '<ClientDataOnboarding managedIdentity=',
    ],
  },
]

const FILES = [...new Set(IDENTITY_DATA_REQUIREMENTS.map((entry) => entry.file))].sort()
const EXECUTABLE_SOURCE_FILES = FILES.filter((file) => !file.startsWith('tests/'))

function fail(reason) {
  throw new Error(reason)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactSha(value, reason) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(reason)
  return normalized
}

function exactRef(value) {
  const candidate = String(value || '').trim()
  if (!REF_PATTERN.test(candidate)) fail('release_integration_batch_ref_invalid')
  return candidate
}

function exactSources(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== FILES.join(',')) fail('release_integration_batch_sources_invalid')
  const sources = {}
  for (const file of FILES) {
    const source = value[file]
    if (typeof source !== 'string' || Buffer.byteLength(source) < 1 || Buffer.byteLength(source) > MAX_SOURCE_BYTES) {
      fail('release_integration_batch_source_invalid')
    }
    sources[file] = source.replace(/\r\n?/g, '\n')
  }
  return sources
}

export function assessIdentityDataSources(value) {
  const sources = exactSources(value)
  const requirements = IDENTITY_DATA_REQUIREMENTS.map((entry) => {
    const missing = entry.tokens.filter((token) => !sources[entry.file].includes(token))
    return {
      id: entry.id,
      authority: entry.authority,
      file: entry.file,
      requiredTokenCount: entry.tokens.length,
      missing,
      passed: missing.length === 0,
    }
  })
  const forbidden = EXECUTABLE_SOURCE_FILES.flatMap((file) => /\bYTF\b|Yangon Tyre/i.test(sources[file]) ? [file] : [])
  const authority = Object.fromEntries(['upstream', 'candidate'].map((name) => {
    const rows = requirements.filter((entry) => entry.authority === name)
    return [name, {
      passed: rows.every((entry) => entry.passed),
      requirementCount: rows.length,
      missingTokenCount: rows.reduce((total, entry) => total + entry.missing.length, 0),
    }]
  }))
  return {
    ok: requirements.every((entry) => entry.passed) && forbidden.length === 0,
    contract: RELEASE_INTEGRATION_BATCH_CONTRACT,
    batch: IDENTITY_DATA_BATCH,
    authority,
    requirements,
    forbiddenSourceFiles: forbidden,
  }
}

function exactBlobMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== FILES.join(',')) fail('release_integration_batch_blobs_invalid')
  return Object.fromEntries(FILES.map((file) => [file, exactSha(value[file], 'release_integration_batch_blob_invalid')]))
}

export function buildIdentityDataComparison(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('release_integration_batch_input_invalid')
  const generatedAt = String(input.generatedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt) fail('release_integration_batch_time_invalid')
  const upstreamRef = exactRef(input.upstream?.ref)
  const candidateRef = exactRef(input.candidate?.ref)
  const upstreamCommit = exactSha(input.upstream?.commit, 'release_integration_batch_upstream_invalid')
  const candidateCommit = exactSha(input.candidate?.commit, 'release_integration_batch_candidate_invalid')
  if (upstreamCommit === candidateCommit) fail('release_integration_batch_refs_not_distinct')
  const upstreamAssessment = assessIdentityDataSources(input.upstream?.sources)
  const candidateAssessment = assessIdentityDataSources(input.candidate?.sources)
  const requirementDigest = `sha256:${sha256(JSON.stringify(IDENTITY_DATA_REQUIREMENTS))}`
  const body = {
    contract: RELEASE_INTEGRATION_BATCH_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    mode: 'owner_review_only_no_source_mutation',
    batch: IDENTITY_DATA_BATCH,
    requirements: {
      digest: requirementDigest,
      files: FILES,
      groups: IDENTITY_DATA_REQUIREMENTS.map((entry) => ({ id: entry.id, authority: entry.authority, file: entry.file, tokenCount: entry.tokens.length })),
    },
    upstream: {
      ref: upstreamRef,
      commit: upstreamCommit,
      blobs: exactBlobMap(input.upstream?.blobs),
      preservesUnion: upstreamAssessment.ok,
      authority: upstreamAssessment.authority,
      missing: upstreamAssessment.requirements.filter((entry) => !entry.passed).map((entry) => ({ id: entry.id, missing: entry.missing })),
      forbiddenSourceFiles: upstreamAssessment.forbiddenSourceFiles,
    },
    candidate: {
      ref: candidateRef,
      commit: candidateCommit,
      blobs: exactBlobMap(input.candidate?.blobs),
      preservesUnion: candidateAssessment.ok,
      authority: candidateAssessment.authority,
      missing: candidateAssessment.requirements.filter((entry) => !entry.passed).map((entry) => ({ id: entry.id, missing: entry.missing })),
      forbiddenSourceFiles: candidateAssessment.forbiddenSourceFiles,
    },
    decision: {
      status: upstreamAssessment.ok || candidateAssessment.ok ? 'one_side_preserves_union' : 'manual_union_required',
      resolutionRule: 'preserve_all_upstream_and_candidate_requirements_in_one_tree',
      firstAuthority: 'upstream-managed-account-and-database-security',
      acceptanceCommand: 'npm run release:integration:batch:check -- --tree <integration-ref>',
    },
    authority: {
      branchCreationApproved: false,
      conflictResolutionApproved: false,
      mergeApproved: false,
      pushApproved: false,
      deploymentApproved: false,
      remoteWritesPerformed: false,
      sourceFilesModified: false,
      forcePushAllowed: false,
    },
  }
  return { ...body, digest: `sha256:${sha256(JSON.stringify(body))}` }
}

export function validateIdentityDataComparison(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('release_integration_batch_packet_invalid')
  const { digest, ...body } = packet
  if (!/^sha256:[0-9a-f]{64}$/.test(String(digest || ''))
    || digest !== `sha256:${sha256(JSON.stringify(body))}`
    || packet.contract !== RELEASE_INTEGRATION_BATCH_CONTRACT
    || packet.batch !== IDENTITY_DATA_BATCH
    || packet.mode !== 'owner_review_only_no_source_mutation'
    || packet.requirements?.digest !== `sha256:${sha256(JSON.stringify(IDENTITY_DATA_REQUIREMENTS))}`
    || packet.authority?.branchCreationApproved !== false
    || packet.authority?.conflictResolutionApproved !== false
    || packet.authority?.mergeApproved !== false
    || packet.authority?.pushApproved !== false
    || packet.authority?.deploymentApproved !== false
    || packet.authority?.remoteWritesPerformed !== false
    || packet.authority?.sourceFilesModified !== false
    || packet.authority?.forcePushAllowed !== false) fail('release_integration_batch_packet_invalid')
  return packet
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  })
  if (result.error || result.signal || result.status !== 0) fail('release_integration_batch_git_failed')
  return String(result.stdout || '').trimEnd()
}

function readTree(ref) {
  const canonicalRef = exactRef(ref)
  const commit = exactSha(runGit(['rev-parse', `${canonicalRef}^{commit}`]), 'release_integration_batch_commit_invalid')
  const sources = {}
  const blobs = {}
  for (const file of FILES) {
    blobs[file] = exactSha(runGit(['rev-parse', `${commit}:${file}`]), 'release_integration_batch_blob_invalid')
    sources[file] = runGit(['show', `${commit}:${file}`])
  }
  return { ref: canonicalRef, commit, sources, blobs }
}

export async function writeExclusiveJson(outputPath, packet) {
  const absolute = resolve(outputPath)
  await mkdir(dirname(absolute), { recursive: true })
  const existing = await lstat(absolute).catch(() => null)
  if (existing) fail('release_integration_batch_output_exists')
  const payload = `${JSON.stringify(packet, null, 2)}\n`
  if (Buffer.byteLength(payload) > MAX_OUTPUT_BYTES) fail('release_integration_batch_output_too_large')
  const handle = await open(absolute, 'wx', 0o600)
  try { await handle.writeFile(payload, 'utf8') } finally { await handle.close() }
  return { path: absolute, bytes: Buffer.byteLength(payload), digest: `sha256:${sha256(payload)}`, packetDigest: packet.digest }
}

function parseArgs(argv) {
  if (argv.length === 2 && argv[0] === '--tree') return { mode: 'tree', ref: argv[1] }
  if (argv.length === 6 && argv[0] === '--output' && argv[2] === '--upstream' && argv[4] === '--candidate') {
    return { mode: 'prepare', path: argv[1], upstream: argv[3], candidate: argv[5] }
  }
  if (argv.length === 2 && argv[0] === '--verify') return { mode: 'verify', path: argv[1] }
  fail('release_integration_batch_args_invalid')
}

async function prepare(request) {
  const packet = buildIdentityDataComparison({
    generatedAt: new Date().toISOString(),
    upstream: readTree(request.upstream),
    candidate: readTree(request.candidate),
  })
  const receipt = await writeExclusiveJson(request.path, packet)
  return { ok: true, contract: RELEASE_INTEGRATION_BATCH_CONTRACT, mode: packet.mode, ...receipt, decision: packet.decision, authority: packet.authority }
}

async function verify(path) {
  const absolute = resolve(path)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_OUTPUT_BYTES) {
    fail('release_integration_batch_file_invalid')
  }
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload) !== metadata.size) fail('release_integration_batch_file_changed')
  let packet
  try { packet = validateIdentityDataComparison(JSON.parse(payload)) } catch (error) {
    if (String(error?.message || '').startsWith('release_integration_batch_')) throw error
    fail('release_integration_batch_packet_invalid')
  }
  const current = buildIdentityDataComparison({
    generatedAt: packet.generatedAt,
    upstream: readTree(packet.upstream.ref),
    candidate: readTree(packet.candidate.ref),
  })
  if (JSON.stringify(current) !== JSON.stringify(packet)) fail('release_integration_batch_state_changed')
  return { ok: true, contract: RELEASE_INTEGRATION_BATCH_CONTRACT, mode: packet.mode, path: absolute, bytes: metadata.size, digest: `sha256:${sha256(payload)}`, packetDigest: packet.digest, decision: packet.decision, authority: packet.authority }
}

async function main() {
  const request = parseArgs(process.argv.slice(2))
  let result
  if (request.mode === 'tree') {
    const tree = readTree(request.ref)
    const assessment = assessIdentityDataSources(tree.sources)
    result = { ...assessment, mode: 'tree_check', ref: tree.ref, commit: tree.commit, blobs: tree.blobs }
    if (!assessment.ok) process.exitCode = 1
  } else if (request.mode === 'prepare') result = await prepare(request)
  else result = await verify(request.path)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: RELEASE_INTEGRATION_BATCH_CONTRACT, reason: String(error?.message || 'release_integration_batch_failed').slice(0, 160) })}\n`)
    process.exitCode = 1
  })
}
