import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { RELEASE_HANDOFF_CONTRACT, verifyCurrentReleaseHandoff } from './prepare_release_handoff.mjs'

const root = resolve(import.meta.dirname, '..')
export const SUPABASE_REHEARSAL_CONTRACT = 'supermega.supabase-rehearsal-packet.v4'
const projectRefPattern = /^[a-z0-9]{20}$/
const commitPattern = /^[0-9a-f]{40}$/
const digestPattern = /^sha256:[0-9a-f]{64}$/
const branchPattern = /^(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119}$/
const expectedSchemaVersion = 10
export const EXPECTED_SUPABASE_REHEARSAL_MIGRATIONS = Object.freeze([
  '20260711081300_public_legacy_baseline.sql',
  '20260722004500_private_trial_backend_role_preflight.sql',
  '20260722005134_private_trial_backend_foundation.sql',
  '20260722142801_private_trial_backend_v2.sql',
  '20260723094500_private_trial_backend_v3_website.sql',
  '20260723144500_private_trial_backend_v4_hardening.sql',
  '20260724204920_private_trial_backend_v5_read_capabilities.sql',
  '20260730113000_private_trial_backend_v6_managed_activation.sql',
  '20260730123000_private_trial_backend_v7_workspace_discovery.sql',
  '20260802161500_private_trial_backend_v8_rls_initplan.sql',
  '20260803063822_private_trial_backend_v9_metadata_rls.sql',
  '20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
])
const expectedMigrationCount = EXPECTED_SUPABASE_REHEARSAL_MIGRATIONS.length
const browserQuarantinePath = 'supabase/rehearsal/20260804_public_browser_quarantine.sql'
const sessionRevocationProbePath = 'supabase/rehearsal/20260807_preview_session_revocation_probe.sql'
const securityAuditPath = 'hq/readiness/supabase-security-advisor-audit.json'

function fail(code) {
  throw new Error(code)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function strictUtcTimestamp(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match
  const [year, month, day, hour, minute, second, millisecond] = [
    yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText,
  ].map(Number)
  const instant = new Date(0)
  instant.setUTCFullYear(year, month - 1, day)
  instant.setUTCHours(hour, minute, second, millisecond)
  if (instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
    || instant.getUTCHours() !== hour
    || instant.getUTCMinutes() !== minute
    || instant.getUTCSeconds() !== second
    || instant.getUTCMilliseconds() !== millisecond
    || instant.toISOString() !== value) return null
  return instant
}

async function readSource(repositoryRoot, sourcePath, sourceReader = null) {
  if (sourceReader) return Buffer.from(await sourceReader(sourcePath))
  return readFile(resolve(repositoryRoot, ...sourcePath.split('/')))
}

async function readManifest(repositoryRoot, sourceReader) {
  return JSON.parse((await readSource(repositoryRoot, 'package.json', sourceReader)).toString('utf8'))
}

export function validateSupabaseRehearsalMigrationNames(names) {
  if (!Array.isArray(names)
    || names.length !== expectedMigrationCount
    || JSON.stringify(names) !== JSON.stringify(EXPECTED_SUPABASE_REHEARSAL_MIGRATIONS)) {
    fail('supabase_rehearsal_migration_chain_mismatch')
  }
  return [...names]
}

async function migrationInventory(repositoryRoot, sourceReader, suppliedNames) {
  const names = suppliedNames
    ? [...suppliedNames].sort()
    : (await readdir(resolve(repositoryRoot, 'supabase', 'migrations')))
      .filter((name) => /^\d{14}_(?:public_legacy_baseline|private_trial_backend.*)\.sql$/.test(name))
      .sort()
  validateSupabaseRehearsalMigrationNames(names)
  return Promise.all(names.map(async (name) => ({
    name,
    sha256: sha256(await readSource(repositoryRoot, `supabase/migrations/${name}`, sourceReader)),
  })))
}

async function browserQuarantineInventory(repositoryRoot, sourceReader) {
  const [sql, auditRaw] = await Promise.all([
    readSource(repositoryRoot, browserQuarantinePath, sourceReader),
    readSource(repositoryRoot, securityAuditPath, sourceReader),
  ])
  const auditText = auditRaw.toString('utf8')
  const audit = JSON.parse(auditText)
  if (audit?.contract !== 'supermega.supabase-security-advisor-audit.v2'
    || audit?.productionMigrations?.liveManagedSchemaVersion !== expectedSchemaVersion
    || audit?.productionMigrations?.sourceTargetVersion !== expectedSchemaVersion
    || audit?.productionMigrations?.versionDrift !== 0
    || audit?.productionMigrations?.publicBrowserQuarantine?.present !== true
    || audit?.productionMigrations?.managedWritesEnabled !== false
    || audit?.managedBackend?.liveSchemaVersion !== expectedSchemaVersion) {
    fail('supabase_rehearsal_quarantine_audit_schema_invalid')
  }
  if (audit?.catalog?.businessRowsRead !== 0) fail('supabase_rehearsal_quarantine_audit_boundary_invalid')
  if (!Array.isArray(audit?.catalog?.tables) || audit.catalog.tables.length !== 27) {
    fail('supabase_rehearsal_quarantine_audit_inventory_invalid')
  }
  if (audit.catalog.queryContract !== 'supermega.supabase-security-metadata-query.v2'
    || audit.catalog.sequenceCount !== 2
    || audit.catalog.nonTableRelationCount !== 0
    || audit.catalog.publicRoutineCount !== 0
    || audit.catalog.browserCallableRoutineCount !== 0
    || audit.conclusion?.indirectExposureAudited !== true
    || !/^sha256:[0-9a-f]{64}$/.test(audit.evidenceDigest || '')) {
    fail('supabase_rehearsal_quarantine_audit_exposure_invalid')
  }
  return {
    contract: 'supermega.public-browser-quarantine.v1',
    state: 'prepared-not-executed',
    scope: 'isolated-rehearsal-only',
    script: {
      path: browserQuarantinePath,
      sha256: sha256(sql),
    },
    sourceAudit: {
      path: securityAuditPath,
      sha256: sha256(auditRaw),
      evidenceDigest: audit.evidenceDigest,
      publicTableCount: audit.catalog.tables.length,
      publicSequenceCount: audit.catalog.sequenceCount,
      businessRowsRead: 0,
    },
    browserRolesDenied: ['anon', 'authenticated'],
    serviceRolePreserved: true,
  }
}

async function sessionRevocationProbeInventory(repositoryRoot, sourceReader) {
  const sql = await readSource(repositoryRoot, sessionRevocationProbePath, sourceReader)
  return {
    path: sessionRevocationProbePath,
    sha256: sha256(sql),
    mutationScope: 'single-transaction-rollback-only',
  }
}

function digestPacket(payload) {
  return `sha256:${sha256(JSON.stringify(payload))}`
}

export function originMainReleaseReview(releaseCommit) {
  if (!commitPattern.test(releaseCommit || '')) fail('supabase_rehearsal_release_commit_invalid')
  return {
    mode: 'origin_main',
    branch: 'main',
    commit: releaseCommit,
  }
}

export function candidateReleaseReviewFromReceipt(receipt) {
  const candidate = receipt?.candidate
  const nextAction = receipt?.nextAction
  const authority = receipt?.authority
  if (receipt?.ok !== true
    || receipt?.contract !== RELEASE_HANDOFF_CONTRACT
    || receipt?.mode !== 'owner_review_only'
    || candidate?.clean !== true
    || !branchPattern.test(candidate?.branch || '')
    || !commitPattern.test(candidate?.commit || '')
    || !digestPattern.test(receipt?.digest || '')
    || !digestPattern.test(receipt?.packetDigest || '')
    || !['unpublished', 'exact', 'different'].includes(receipt?.remoteCandidateState)
    || !['owner_review_initial_branch_push', 'owner_review_fast_forward_branch_push'].includes(nextAction?.kind)
    || (receipt?.remoteCandidateState === 'unpublished') !== (nextAction?.kind === 'owner_review_initial_branch_push')
    || nextAction?.exactCommit !== candidate.commit
    || nextAction?.forcePushAllowed !== false
    || nextAction?.mergeIncluded !== false
    || nextAction?.deploymentIncluded !== false
    || authority?.pushApproved !== false
    || authority?.mergeApproved !== false
    || authority?.workflowDispatchApproved !== false
    || authority?.deploymentApproved !== false
    || authority?.domainChangeApproved !== false
    || authority?.providerMutationApproved !== false
    || authority?.remoteWritesPerformed !== false
    || authority?.providerWritesPerformed !== false
    || authority?.credentialValuesInspected !== false) {
    fail('supabase_rehearsal_release_handoff_invalid')
  }
  return {
    mode: 'owner_review_handoff',
    branch: candidate.branch,
    commit: candidate.commit,
    handoffContract: RELEASE_HANDOFF_CONTRACT,
    handoffFileDigest: receipt.digest,
    handoffPacketDigest: receipt.packetDigest,
    remoteCandidateState: receipt.remoteCandidateState,
    nextAction: nextAction.kind,
    pushApproved: false,
    mergeApproved: false,
    workflowDispatchApproved: false,
    deploymentApproved: false,
    domainChangeApproved: false,
    providerMutationApproved: false,
    remoteWritesPerformed: false,
    providerWritesPerformed: false,
    credentialValuesInspected: false,
  }
}

function validateReleaseReview(review, releaseCommit) {
  let canonical
  if (review?.mode === 'origin_main') {
    canonical = originMainReleaseReview(releaseCommit)
  } else if (review?.mode === 'owner_review_handoff') {
    if (!branchPattern.test(review.branch || '')
      || review.commit !== releaseCommit
      || review.handoffContract !== RELEASE_HANDOFF_CONTRACT
      || !digestPattern.test(review.handoffFileDigest || '')
      || !digestPattern.test(review.handoffPacketDigest || '')
      || !['unpublished', 'exact', 'different'].includes(review.remoteCandidateState)
      || !['owner_review_initial_branch_push', 'owner_review_fast_forward_branch_push'].includes(review.nextAction)
      || (review.remoteCandidateState === 'unpublished') !== (review.nextAction === 'owner_review_initial_branch_push')
      || review.pushApproved !== false
      || review.mergeApproved !== false
      || review.workflowDispatchApproved !== false
      || review.deploymentApproved !== false
      || review.domainChangeApproved !== false
      || review.providerMutationApproved !== false
      || review.remoteWritesPerformed !== false
      || review.providerWritesPerformed !== false
      || review.credentialValuesInspected !== false) {
      fail('supabase_rehearsal_release_review_invalid')
    }
    canonical = {
      mode: 'owner_review_handoff',
      branch: review.branch,
      commit: releaseCommit,
      handoffContract: RELEASE_HANDOFF_CONTRACT,
      handoffFileDigest: review.handoffFileDigest,
      handoffPacketDigest: review.handoffPacketDigest,
      remoteCandidateState: review.remoteCandidateState,
      nextAction: review.nextAction,
      pushApproved: false,
      mergeApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      domainChangeApproved: false,
      providerMutationApproved: false,
      remoteWritesPerformed: false,
      providerWritesPerformed: false,
      credentialValuesInspected: false,
    }
  } else {
    fail('supabase_rehearsal_release_review_required')
  }
  if (JSON.stringify(review) !== JSON.stringify(canonical)) fail('supabase_rehearsal_release_review_invalid')
  return canonical
}

export async function buildSupabaseRehearsalPacket({
  repositoryRoot = root,
  targetProjectRef,
  releaseCommit,
  releaseReview,
  generatedAt = new Date().toISOString(),
  sourceReader = null,
  migrationNames = null,
} = {}) {
  if (!projectRefPattern.test(targetProjectRef || '')) fail('supabase_rehearsal_target_ref_invalid')
  if (!commitPattern.test(releaseCommit || '')) fail('supabase_rehearsal_release_commit_invalid')
  if (!strictUtcTimestamp(generatedAt)) fail('supabase_rehearsal_generated_at_invalid')

  const manifest = await readManifest(repositoryRoot, sourceReader)
  const productionProjectRef = manifest?.supermega?.productionSupabaseProjectRef
  const productionTargetStatus = manifest?.supermega?.productionSupabaseTargetStatus
  if (!projectRefPattern.test(productionProjectRef || '')) fail('supabase_rehearsal_production_ref_unconfigured')
  if (productionTargetStatus !== 'protected-unapproved') fail('supabase_rehearsal_production_guard_invalid')
  if (targetProjectRef === productionProjectRef) fail('supabase_rehearsal_target_is_production')

  const reviewedRelease = validateReleaseReview(releaseReview, releaseCommit)
  const [migrations, browserQuarantine, sessionRevocationProbe] = await Promise.all([
    migrationInventory(repositoryRoot, sourceReader, migrationNames),
    browserQuarantineInventory(repositoryRoot, sourceReader),
    sessionRevocationProbeInventory(repositoryRoot, sourceReader),
  ])
  const payload = {
    contract: SUPABASE_REHEARSAL_CONTRACT,
    state: 'prepared-not-executed',
    generatedAt,
    release: {
      commit: releaseCommit,
      review: reviewedRelease,
      schemaVersion: expectedSchemaVersion,
      migrationCount: migrations.length,
      migrations,
      browserQuarantine,
      sessionRevocationProbe,
    },
    authority: {
      protectedProductionProjectRef: productionProjectRef,
      productionTargetStatus,
      rehearsalProjectRef: targetProjectRef,
      targetMustRemainNonProduction: true,
    },
    operatorFiles: {
      administrativeUrl: '.tmp/supermega-rehearsal-admin-url.txt',
      certificateAuthority: '.tmp/supermega-rehearsal-ca.crt',
      preflightEvidence: '.tmp/supermega-rehearsal-preflight.json',
      backupEvidence: '.tmp/supermega-rehearsal-backup-evidence.json',
      restoreEvidence: '.tmp/supermega-rehearsal-restore-evidence.json',
      validatorEvidence: '.tmp/supermega-rehearsal-validator-evidence.json',
      browserQuarantineEvidence: '.tmp/supermega-rehearsal-browser-quarantine-evidence.json',
    },
    preflight: {
      command: `npm run database:supabase:preflight -- -DatabaseUrlFile .tmp\\supermega-rehearsal-admin-url.txt -ExpectedProjectRef ${targetProjectRef} -SslRootCertFile .tmp\\supermega-rehearsal-ca.crt`,
      readOnly: true,
      expectedStartingState: 'clean-target',
    },
    requiredEvidence: [
      'provider-backup-inventory-before-migration',
      'independent-restore-to-isolated-target',
      'hostname-verified-postgresql-17-preflight',
      'ordered-migration-application-through-v10',
      'read-only-v10-runtime-validator',
      'supabase-security-advisor-without-applicable-errors',
      'private-storage-isolation-proof',
      'named-user-auth-and-cross-tenant-denial',
      'active-session-acceptance-and-revoked-session-denial',
      'public-browser-table-and-sequence-denial',
      'public-default-privilege-denial-for-postgres-and-supabase-admin',
      'service-role-contact-path-retained',
    ],
    recoveryNotes: [
      'Provider physical backups do not preserve custom-role passwords.',
      'Database backups do not restore Storage objects.',
      'A restore must be proven on an isolated target before production activation.',
    ],
    documentation: {
      backups: 'https://supabase.com/docs/guides/platform/backups',
      branching: 'https://supabase.com/docs/guides/deployment/branching/dashboard',
      rowLevelSecurity: 'https://supabase.com/docs/guides/database/postgres/row-level-security',
    },
    controls: {
      activationAllowed: false,
      productionWritesEnabled: false,
      externalMutationPerformed: false,
      credentialsIncluded: false,
      nextAuthority: 'owner-reviewed isolated rehearsal',
    },
  }
  return { ...payload, packetDigest: digestPacket(payload) }
}

export async function validateSupabaseRehearsalPacket(packet, {
  repositoryRoot = root,
  expectedReleaseCommit,
  expectedReleaseReview,
  sourceReader = null,
  migrationNames = null,
} = {}) {
  if (!packet || packet.contract !== SUPABASE_REHEARSAL_CONTRACT) fail('supabase_rehearsal_packet_contract_invalid')
  if (packet.state !== 'prepared-not-executed') fail('supabase_rehearsal_packet_state_invalid')
  if (expectedReleaseCommit && packet.release?.commit !== expectedReleaseCommit) fail('supabase_rehearsal_packet_release_stale')
  const expected = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef: packet.authority?.rehearsalProjectRef,
    releaseCommit: packet.release?.commit,
    releaseReview: packet.release?.review,
    generatedAt: packet.generatedAt,
    sourceReader,
    migrationNames,
  })
  if (JSON.stringify(packet) !== JSON.stringify(expected)) fail('supabase_rehearsal_packet_evidence_stale')
  if (expectedReleaseReview && JSON.stringify(packet.release.review) !== JSON.stringify(expectedReleaseReview)) {
    fail('supabase_rehearsal_release_review_stale')
  }
  const serialized = JSON.stringify(packet).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('postgres://') || serialized.includes('sb_secret_')) {
    fail('supabase_rehearsal_packet_contains_credential')
  }
  if (packet.controls.activationAllowed || packet.controls.productionWritesEnabled || packet.controls.externalMutationPerformed) {
    fail('supabase_rehearsal_packet_mutation_claim_invalid')
  }
  return packet
}

function git(repositoryRoot, ...args) {
  const env = Object.fromEntries([
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
    'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME',
  ].filter((key) => typeof process.env[key] === 'string').map((key) => [key, process.env[key]]))
  env.GIT_NO_LAZY_FETCH = '1'
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8',
    env,
    timeout: 15_000,
    windowsHide: true,
  }).trim()
}

function gitBlob(repositoryRoot, commit, sourcePath) {
  const env = Object.fromEntries([
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
    'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME',
  ].filter((key) => typeof process.env[key] === 'string').map((key) => [key, process.env[key]]))
  env.GIT_NO_LAZY_FETCH = '1'
  try {
    return execFileSync('git', ['-C', repositoryRoot, 'cat-file', 'blob', `${commit}:${sourcePath}`], {
      encoding: 'buffer',
      env,
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch {
    fail('supabase_rehearsal_reviewed_blob_unavailable')
  }
}

function gitMigrationNames(repositoryRoot, commit) {
  const output = git(repositoryRoot, 'ls-tree', '--name-only', `${commit}:supabase/migrations`)
  return output.split(/\r?\n/)
    .filter((name) => /^\d{14}_(?:public_legacy_baseline|private_trial_backend.*)\.sql$/.test(name))
    .sort()
}

export function validateSupabaseRehearsalPacketSourcesAtCommit(repositoryRoot, packet, commit) {
  const packetMigrations = packet.release?.migrations
  if (!Array.isArray(packetMigrations)) fail('supabase_rehearsal_packet_source_binding_invalid')
  for (const migration of packetMigrations) {
    const path = `supabase/migrations/${migration.name}`
    if (sha256(gitBlob(repositoryRoot, commit, path)) !== migration.sha256) {
      fail('supabase_rehearsal_reviewed_migration_blob_mismatch')
    }
  }
  for (const [path, digest] of [
    [browserQuarantinePath, packet.release?.browserQuarantine?.script?.sha256],
    [securityAuditPath, packet.release?.browserQuarantine?.sourceAudit?.sha256],
    [sessionRevocationProbePath, packet.release?.sessionRevocationProbe?.sha256],
  ]) {
    if (sha256(gitBlob(repositoryRoot, commit, path)) !== digest) {
      fail('supabase_rehearsal_reviewed_source_blob_mismatch')
    }
  }
  const manifest = JSON.parse(gitBlob(repositoryRoot, commit, 'package.json').toString('utf8'))
  if (manifest?.supermega?.productionSupabaseProjectRef !== packet.authority?.protectedProductionProjectRef
    || manifest?.supermega?.productionSupabaseTargetStatus !== packet.authority?.productionTargetStatus) {
    fail('supabase_rehearsal_reviewed_manifest_blob_mismatch')
  }
}

function reviewedMainRelease(repositoryRoot) {
  if (git(repositoryRoot, 'status', '--porcelain')) fail('supabase_rehearsal_checkout_dirty')
  const head = git(repositoryRoot, 'rev-parse', 'HEAD')
  const main = git(repositoryRoot, 'rev-parse', 'origin/main')
  if (head !== main) fail('supabase_rehearsal_head_not_origin_main_fetch_first')
  return { commit: head, review: originMainReleaseReview(head) }
}

async function reviewedRelease(repositoryRoot, releaseHandoff) {
  if (!releaseHandoff) return reviewedMainRelease(repositoryRoot)
  if (git(repositoryRoot, 'status', '--porcelain')) fail('supabase_rehearsal_checkout_dirty')
  const receipt = await verifyCurrentReleaseHandoff(resolve(releaseHandoff))
  const review = candidateReleaseReviewFromReceipt(receipt)
  if (git(repositoryRoot, 'rev-parse', 'HEAD') !== review.commit) fail('supabase_rehearsal_release_handoff_stale')
  return { commit: review.commit, review }
}

function parseArguments(args) {
  if (args[0] === '--verify') {
    if (args.length === 2) return { mode: 'verify', input: args[1], releaseHandoff: null }
    if (args.length === 4 && args[2] === '--release-handoff' && args[3]) {
      return { mode: 'verify', input: args[1], releaseHandoff: args[3] }
    }
    fail('supabase_rehearsal_arguments_invalid')
  }
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith('--') || !args[index + 1]) fail('supabase_rehearsal_arguments_invalid')
    values.set(args[index], args[index + 1])
  }
  if (![2, 3].includes(values.size)
    || !values.has('--target-project-ref')
    || !values.has('--output')
    || (values.size === 3 && !values.has('--release-handoff'))) {
    fail('supabase_rehearsal_arguments_invalid')
  }
  return {
    mode: 'prepare',
    targetProjectRef: values.get('--target-project-ref'),
    output: values.get('--output'),
    releaseHandoff: values.get('--release-handoff') || null,
  }
}

export function resolveSupabaseRehearsalArtifactPath(repositoryRoot, output) {
  const destination = resolve(repositoryRoot, output)
  const temporaryRoot = resolve(repositoryRoot, '.tmp')
  if (dirname(destination) !== temporaryRoot
    || extname(destination).toLowerCase() !== '.json'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,119}\.json$/.test(basename(destination))) {
    fail('supabase_rehearsal_output_must_be_temporary_direct_child')
  }
  return destination
}

async function requirePlainTemporaryRoot(repositoryRoot) {
  const temporaryRoot = resolve(repositoryRoot, '.tmp')
  let metadata
  let canonical
  try {
    metadata = await lstat(temporaryRoot)
    canonical = await realpath(temporaryRoot)
  } catch {
    fail('supabase_rehearsal_temporary_root_invalid')
  }
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || resolve(canonical) !== temporaryRoot) fail('supabase_rehearsal_temporary_root_invalid')
  return temporaryRoot
}

async function readBoundedPrivateJson(repositoryRoot, path) {
  const temporaryRoot = await requirePlainTemporaryRoot(repositoryRoot)
  let before
  let canonical
  try {
    before = await lstat(path)
    canonical = await realpath(path)
  } catch {
    fail('supabase_rehearsal_input_invalid')
  }
  if (!before.isFile()
    || before.isSymbolicLink()
    || before.size <= 0
    || before.size > 1024 * 1024
    || dirname(canonical) !== temporaryRoot
    || resolve(canonical) !== path) fail('supabase_rehearsal_input_invalid')
  let handle
  let bytes
  try {
    handle = await open(path, 'r')
    const descriptorMetadata = await handle.stat()
    if (!descriptorMetadata.isFile()
      || descriptorMetadata.size !== before.size
      || descriptorMetadata.dev !== before.dev
      || descriptorMetadata.ino !== before.ino) fail('supabase_rehearsal_input_changed')
    bytes = await handle.readFile()
  } catch (error) {
    if (error?.message === 'supabase_rehearsal_input_changed') throw error
    fail('supabase_rehearsal_input_changed')
  } finally {
    await handle?.close()
  }
  const after = await lstat(path)
  if (!after.isFile()
    || after.isSymbolicLink()
    || after.size !== before.size
    || after.size !== bytes.length
    || after.mtimeMs !== before.mtimeMs
    || after.dev !== before.dev
    || after.ino !== before.ino
    || resolve(await realpath(path)) !== path) fail('supabase_rehearsal_input_changed')
  try { return JSON.parse(bytes.toString('utf8')) } catch { fail('supabase_rehearsal_input_invalid') }
}

function requireIgnoredOutput(repositoryRoot, destination) {
  const candidate = relative(repositoryRoot, destination)
  try {
    execFileSync('git', ['-C', repositoryRoot, 'check-ignore', '--quiet', '--', candidate])
  }
  catch {
    fail('supabase_rehearsal_output_must_be_gitignored')
  }
}

async function main() {
  const command = parseArguments(process.argv.slice(2))
  if (command.mode === 'verify') {
    const input = resolveSupabaseRehearsalArtifactPath(root, command.input)
    await requirePlainTemporaryRoot(root)
    requireIgnoredOutput(root, input)
    const source = await readBoundedPrivateJson(root, input)
    if (source?.release?.review?.mode === 'owner_review_handoff' && !command.releaseHandoff) {
      fail('supabase_rehearsal_release_handoff_required')
    }
    const release = await reviewedRelease(root, command.releaseHandoff)
    const packet = await validateSupabaseRehearsalPacket(source, {
      expectedReleaseCommit: release.commit,
      expectedReleaseReview: release.review,
      sourceReader: (sourcePath) => gitBlob(root, release.commit, sourcePath),
      migrationNames: gitMigrationNames(root, release.commit),
    })
    validateSupabaseRehearsalPacketSourcesAtCommit(root, packet, release.commit)
    const releaseAfterRead = await reviewedRelease(root, command.releaseHandoff)
    if (JSON.stringify(releaseAfterRead) !== JSON.stringify(release)) fail('supabase_rehearsal_release_changed_during_verify')
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      state: packet.state,
      targetProjectRef: packet.authority.rehearsalProjectRef,
      releaseCommit: packet.release.commit,
      releaseReviewMode: packet.release.review.mode,
      schemaVersion: packet.release.schemaVersion,
      migrationCount: packet.release.migrationCount,
      activationAllowed: false,
      externalMutationPerformed: false,
    }))
    return
  }

  const destination = resolveSupabaseRehearsalArtifactPath(root, command.output)
  await requirePlainTemporaryRoot(root)
  requireIgnoredOutput(root, destination)
  try {
    await lstat(destination)
    fail('supabase_rehearsal_output_already_exists')
  } catch (error) {
    if (error?.message === 'supabase_rehearsal_output_already_exists') throw error
    if (error?.code !== 'ENOENT') throw error
  }
  const release = await reviewedRelease(root, command.releaseHandoff)
  const packet = await buildSupabaseRehearsalPacket({
    targetProjectRef: command.targetProjectRef,
    releaseCommit: release.commit,
    releaseReview: release.review,
    sourceReader: (sourcePath) => gitBlob(root, release.commit, sourcePath),
    migrationNames: gitMigrationNames(root, release.commit),
  })
  await validateSupabaseRehearsalPacket(packet, {
    expectedReleaseCommit: release.commit,
    expectedReleaseReview: release.review,
    sourceReader: (sourcePath) => gitBlob(root, release.commit, sourcePath),
    migrationNames: gitMigrationNames(root, release.commit),
  })
  validateSupabaseRehearsalPacketSourcesAtCommit(root, packet, release.commit)
  const releaseAfterRead = await reviewedRelease(root, command.releaseHandoff)
  if (JSON.stringify(releaseAfterRead) !== JSON.stringify(release)) fail('supabase_rehearsal_release_changed_during_prepare')
  await writeFile(destination, `${JSON.stringify(packet, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  console.log(JSON.stringify({
    ok: true,
    contract: packet.contract,
    state: packet.state,
    output: relative(root, destination).split(sep).join('/'),
    targetProjectRef: packet.authority.rehearsalProjectRef,
    releaseCommit: packet.release.commit,
    releaseReviewMode: packet.release.review.mode,
    schemaVersion: packet.release.schemaVersion,
    migrationCount: packet.release.migrationCount,
    activationAllowed: false,
    externalMutationPerformed: false,
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: String(error?.message || 'supabase_rehearsal_packet_failed').slice(0, 240),
      activationAllowed: false,
      externalMutationPerformed: false,
    }))
    process.exitCode = 1
  })
}
