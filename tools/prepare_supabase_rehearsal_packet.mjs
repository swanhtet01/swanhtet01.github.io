import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { RELEASE_HANDOFF_CONTRACT, verifyCurrentReleaseHandoff } from './prepare_release_handoff.mjs'

const root = resolve(import.meta.dirname, '..')
export const SUPABASE_REHEARSAL_CONTRACT = 'supermega.supabase-rehearsal-packet.v2'
const projectRefPattern = /^[a-z0-9]{20}$/
const commitPattern = /^[0-9a-f]{40}$/
const digestPattern = /^sha256:[0-9a-f]{64}$/
const branchPattern = /^(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119}$/
// v11 (self-serve grants) joined the reviewed chain 2026-08-16: hosted-proven on
// an isolated branch (hq/readiness/self-serve-pilot-proof.json), fingerprint-
// pinned in verify_private_trial_migrations.mjs. The packet describes the full
// reviewed chain; applying it to production remains a separate founder decision.
const expectedSchemaVersion = 13
const expectedMigrationCount = 14
const expectedFinalMigration = '20260818090000_private_trial_backend_v13_billing_entitlement_read.sql'
const browserQuarantinePath = 'supabase/rehearsal/20260804_public_browser_quarantine.sql'
const securityAuditPath = 'hq/readiness/supabase-security-advisor-audit.json'

function fail(code) {
  throw new Error(code)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function readManifest(repositoryRoot) {
  return JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
}

async function migrationInventory(repositoryRoot) {
  const directory = resolve(repositoryRoot, 'supabase', 'migrations')
  const names = (await readdir(directory))
    .filter((name) => /^\d{14}_private_trial_backend.*\.sql$/.test(name))
    .sort()
  if (names.length !== expectedMigrationCount) fail('supabase_rehearsal_migration_count_mismatch')
  if (names.at(-1) !== expectedFinalMigration) fail('supabase_rehearsal_final_migration_mismatch')
  return Promise.all(names.map(async (name) => ({
    name,
    sha256: sha256(await readFile(resolve(directory, name))),
  })))
}

async function browserQuarantineInventory(repositoryRoot) {
  const [sql, auditRaw] = await Promise.all([
    readFile(resolve(repositoryRoot, browserQuarantinePath)),
    readFile(resolve(repositoryRoot, securityAuditPath), 'utf8'),
  ])
  const audit = JSON.parse(auditRaw)
  // The source audit may trail the full isolated rehearsal chain, but it must
  // describe a reviewed managed schema no newer than this packet's v13 target.
  // The rehearsal remains responsible for applying and validating later
  // migrations; the audit remains the exact current public-object inventory.
  if (audit?.contract !== 'supermega.supabase-security-advisor-audit.v2'
    || !Number.isInteger(audit?.managedBackend?.liveSchemaVersion)
    || audit.managedBackend.liveSchemaVersion < 7
    || audit.managedBackend.liveSchemaVersion > expectedSchemaVersion
    || audit.managedBackend.localTargetVersion !== audit.managedBackend.liveSchemaVersion
    || audit.managedBackend.versionDrift !== 0) fail('supabase_rehearsal_quarantine_audit_schema_invalid')
  if (audit?.catalog?.businessRowsRead !== 0) fail('supabase_rehearsal_quarantine_audit_boundary_invalid')
  if (!Array.isArray(audit?.catalog?.tables) || audit.catalog.tables.length !== 27) {
    fail('supabase_rehearsal_quarantine_audit_inventory_invalid')
  }
  if (audit.catalog.queryContract !== 'supermega.supabase-security-metadata-query.v2'
    || audit.catalog.sequenceCount !== 2
    || !Array.isArray(audit.catalog.sequences)
    || audit.catalog.sequences.length !== 2
    || audit.catalog.nonTableRelationCount !== 0
    || audit.catalog.publicRoutineCount !== 0
    || audit.catalog.browserCallableRoutineCount !== 0
    || audit.managedBackend.browserRolesDenied !== true
    || audit.conclusion?.directBrowserTableAccessDefaultDenied !== true
    || audit.conclusion?.indirectExposureAudited !== true
    || audit.conclusion?.browserGrantHardeningRequired !== false
    || audit.catalog.applicationOwnerDefaultBrowserTablePrivilegesPresent !== false
    || audit.catalog.applicationOwnerDefaultBrowserSequencePrivilegesPresent !== false
    || audit.catalog.applicationOwnerDefaultBrowserFunctionExecutePresent !== false
    || audit.catalog.tables.some((table) => !table || table.anonPrivileges?.length || table.authenticatedPrivileges?.length)
    || audit.catalog.sequences.some((sequence) => !sequence || sequence.anonPrivileges?.length || sequence.authenticatedPrivileges?.length)
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
} = {}) {
  if (!projectRefPattern.test(targetProjectRef || '')) fail('supabase_rehearsal_target_ref_invalid')
  if (!commitPattern.test(releaseCommit || '')) fail('supabase_rehearsal_release_commit_invalid')
  if (!Number.isFinite(Date.parse(generatedAt))) fail('supabase_rehearsal_generated_at_invalid')

  const manifest = await readManifest(repositoryRoot)
  const productionProjectRef = manifest?.supermega?.productionSupabaseProjectRef
  const productionTargetStatus = manifest?.supermega?.productionSupabaseTargetStatus
  if (!projectRefPattern.test(productionProjectRef || '')) fail('supabase_rehearsal_production_ref_unconfigured')
  if (productionTargetStatus !== 'protected-unapproved') fail('supabase_rehearsal_production_guard_invalid')
  if (targetProjectRef === productionProjectRef) fail('supabase_rehearsal_target_is_production')

  const reviewedRelease = validateReleaseReview(releaseReview, releaseCommit)
  const [migrations, browserQuarantine] = await Promise.all([
    migrationInventory(repositoryRoot),
    browserQuarantineInventory(repositoryRoot),
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
      'ordered-migration-application-through-v13',
      'read-only-v13-runtime-validator',
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
  return execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' }).trim()
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

function resolveOutput(repositoryRoot, output) {
  const destination = resolve(repositoryRoot, output)
  const temporaryRoot = resolve(repositoryRoot, '.tmp')
  if (destination !== temporaryRoot && !destination.startsWith(`${temporaryRoot}${sep}`)) fail('supabase_rehearsal_output_must_be_temporary')
  if (extname(destination).toLowerCase() !== '.json') fail('supabase_rehearsal_output_must_be_json')
  return destination
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
    const input = resolveOutput(root, command.input)
    requireIgnoredOutput(root, input)
    const source = JSON.parse(await readFile(input, 'utf8'))
    if (source?.release?.review?.mode === 'owner_review_handoff' && !command.releaseHandoff) {
      fail('supabase_rehearsal_release_handoff_required')
    }
    const release = await reviewedRelease(root, command.releaseHandoff)
    const packet = await validateSupabaseRehearsalPacket(source, {
      expectedReleaseCommit: release.commit,
      expectedReleaseReview: release.review,
    })
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

  const destination = resolveOutput(root, command.output)
  requireIgnoredOutput(root, destination)
  const release = await reviewedRelease(root, command.releaseHandoff)
  const packet = await buildSupabaseRehearsalPacket({
    targetProjectRef: command.targetProjectRef,
    releaseCommit: release.commit,
    releaseReview: release.review,
  })
  await validateSupabaseRehearsalPacket(packet, { expectedReleaseCommit: release.commit, expectedReleaseReview: release.review })
  await mkdir(dirname(destination), { recursive: true })
  const staged = resolve(dirname(destination), `.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, destination)
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
