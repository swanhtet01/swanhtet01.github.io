#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT = 'supermega.supabase-preview-rehearsal-proposal.v1'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'hq', 'readiness', 'supabase-preview-rehearsal-proposal.json')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const EXPECTED_MIGRATION_COUNT = 15
const EXPECTED_PRIVATE_MIGRATION_COUNT = 14
const EXPECTED_PUBLIC_BASELINE = '20260711081300_public_legacy_baseline.sql'
const EXPECTED_FINAL_MIGRATION = '20260818090000_private_trial_backend_v13_billing_entitlement_read.sql'
const EXPECTED_SOURCE_TARGET_SCHEMA_VERSION = 13
const MAX_PREVIEW_LIFETIME_HOURS = 24
const SOURCES = [
  'package.json',
  'tools/prepare_supabase_preview_rehearsal_proposal.mjs',
  'tools/prepare_supabase_rehearsal_packet.mjs',
  'tools/verify_private_trial_migrations.mjs',
  'tools/verify_public_browser_quarantine.mjs',
  'hq/readiness/supabase-security-advisor-audit.json',
  'hq/readiness/managed-pilot-readiness.json',
  'hq/readiness/github-main-protection-proposal.json',
  'supabase/rehearsal/20260804_public_browser_quarantine.sql',
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

async function readText(path) {
  return readFile(resolve(root, path), 'utf8')
}

function packetDigest(payload) {
  return digest(JSON.stringify(payload))
}

async function migrationChain() {
  const directory = resolve(root, 'supabase', 'migrations')
  const names = (await readdir(directory))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
  if (names.length !== EXPECTED_MIGRATION_COUNT) fail('supabase_preview_rehearsal_migration_count_invalid')
  if (names[0] !== EXPECTED_PUBLIC_BASELINE) fail('supabase_preview_rehearsal_public_baseline_invalid')
  if (names.at(-1) !== EXPECTED_FINAL_MIGRATION) fail('supabase_preview_rehearsal_final_migration_invalid')
  const migrations = []
  for (const name of names) {
    const path = `supabase/migrations/${name}`
    migrations.push({ name, path, digest: digest(await readText(path)) })
  }
  const privateCount = migrations.filter((entry) => entry.name.includes('_private_trial_backend')).length
  if (privateCount !== EXPECTED_PRIVATE_MIGRATION_COUNT) fail('supabase_preview_rehearsal_private_migration_count_invalid')
  return {
    schemaVersion: EXPECTED_SOURCE_TARGET_SCHEMA_VERSION,
    migrationCount: migrations.length,
    privateMigrationCount: privateCount,
    publicBaseline: EXPECTED_PUBLIC_BASELINE,
    finalMigration: EXPECTED_FINAL_MIGRATION,
    chainDigest: digest(JSON.stringify(migrations)),
    migrations,
  }
}

function currentSecurityBaseline(securityAudit) {
  if (securityAudit?.contract !== 'supermega.supabase-security-advisor-audit.v2') fail('supabase_preview_rehearsal_security_contract_invalid')
  if (securityAudit?.targetClassification !== 'protected-production') fail('supabase_preview_rehearsal_security_target_invalid')
  if (!/^[a-z0-9]{20}$/.test(securityAudit?.projectRef || '')) fail('supabase_preview_rehearsal_project_ref_invalid')
  if (securityAudit?.advisor?.status !== 'clear' || securityAudit?.advisor?.findingCount !== 0) fail('supabase_preview_rehearsal_security_advisor_not_clear')
  if (securityAudit?.catalog?.businessRowsRead !== 0) fail('supabase_preview_rehearsal_security_rows_read_invalid')
  if (securityAudit?.managedBackend?.browserRolesDenied !== true) fail('supabase_preview_rehearsal_browser_roles_invalid')
  if (securityAudit?.managedBackend?.versionDrift !== 0) fail('supabase_preview_rehearsal_live_drift_invalid')
  if (securityAudit?.controls?.databaseWrites !== 0 || securityAudit?.controls?.providerMutations !== 0) fail('supabase_preview_rehearsal_security_mutation_invalid')
  return {
    projectRef: securityAudit.projectRef,
    classification: securityAudit.targetClassification,
    asOf: securityAudit.asOf,
    postgresMajor: securityAudit.postgres?.major,
    projectStatus: securityAudit.postgres?.status,
    liveSchemaVersion: securityAudit.managedBackend.liveSchemaVersion,
    localTargetVersion: securityAudit.managedBackend.localTargetVersion,
    versionDrift: securityAudit.managedBackend.versionDrift,
    browserRolesDenied: true,
    publicBrowserQuarantinePresent: true,
    securityAdvisorStatus: 'clear',
    advisorFindings: 0,
    businessRowsRead: 0,
    databaseWrites: 0,
    providerMutations: 0,
  }
}

function readinessGateBaseline(readiness) {
  if (readiness?.contract !== 'supermega.managed-pilot-readiness.v5') fail('supabase_preview_rehearsal_readiness_contract_invalid')
  if (readiness?.previewRehearsal?.proofComplete !== false
    || readiness.previewRehearsal.exactCandidateRequired !== true
    || readiness.previewRehearsal.productionRefsRejected !== true
    || readiness.previewRehearsal.productionDataRejected !== true
    || readiness.previewRehearsal.privilegedRuntimeCredentialsRejected !== true) {
    fail('supabase_preview_rehearsal_readiness_gate_invalid')
  }
  const blocking = readiness.overall?.blockingGateIds || []
  if (!blocking.includes('preview_rehearsal')) fail('supabase_preview_rehearsal_gate_not_blocking')
  return {
    contract: readiness.contract,
    previewProofComplete: false,
    previewGateStatus: 'blocked',
    blockingGateIds: [...blocking],
    hostedActivationReady: readiness.overall?.hostedActivationReady === true,
  }
}

function validateProposalShape(packet) {
  if (!isRecord(packet) || packet.contract !== SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT) fail('supabase_preview_rehearsal_proposal_contract_invalid')
  if (packet.repository !== REPOSITORY) fail('supabase_preview_rehearsal_proposal_repository_invalid')
  if (packet.mode !== 'owner_approval_required') fail('supabase_preview_rehearsal_proposal_mode_invalid')
  if (packet.state !== 'prepared-not-executed') fail('supabase_preview_rehearsal_proposal_state_invalid')
  if (packet.previewBranch?.kind !== 'clean_empty_ephemeral_preview') fail('supabase_preview_rehearsal_proposal_branch_kind_invalid')
  if (packet.previewBranch.maximumLifetimeHours !== MAX_PREVIEW_LIFETIME_HOURS) fail('supabase_preview_rehearsal_proposal_lifetime_invalid')
  if (packet.previewBranch.startsWithProductionData !== false || packet.previewBranch.deleteAfterEvidence !== true) fail('supabase_preview_rehearsal_proposal_data_boundary_invalid')
  if (packet.previewBranch.productionRefsAllowed !== false || packet.previewBranch.privilegedRuntimeCredentialsAllowed !== false) fail('supabase_preview_rehearsal_proposal_secret_boundary_invalid')
  if (packet.migrationPlan?.schemaVersion !== EXPECTED_SOURCE_TARGET_SCHEMA_VERSION
    || packet.migrationPlan?.migrationCount !== EXPECTED_MIGRATION_COUNT
    || packet.migrationPlan?.privateMigrationCount !== EXPECTED_PRIVATE_MIGRATION_COUNT
    || packet.migrationPlan?.publicBaseline !== EXPECTED_PUBLIC_BASELINE
    || packet.migrationPlan?.finalMigration !== EXPECTED_FINAL_MIGRATION) {
    fail('supabase_preview_rehearsal_proposal_migration_plan_invalid')
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(packet.migrationPlan?.chainDigest || '')) fail('supabase_preview_rehearsal_proposal_migration_digest_invalid')
  if (!Array.isArray(packet.migrationPlan?.migrations) || packet.migrationPlan.migrations.length !== EXPECTED_MIGRATION_COUNT) fail('supabase_preview_rehearsal_proposal_migrations_invalid')
  if (packet.productionBaseline?.classification !== 'protected-production'
    || packet.productionBaseline?.browserRolesDenied !== true
    || packet.productionBaseline?.publicBrowserQuarantinePresent !== true
    || packet.productionBaseline?.securityAdvisorStatus !== 'clear'
    || packet.productionBaseline?.businessRowsRead !== 0
    || packet.productionBaseline?.databaseWrites !== 0
    || packet.productionBaseline?.providerMutations !== 0) {
    fail('supabase_preview_rehearsal_proposal_production_baseline_invalid')
  }
  if (packet.gates?.previewRehearsal?.status !== 'blocked-until-executed'
    || packet.gates.previewRehearsal.proofComplete !== false
    || packet.gates.previewRehearsal.exactCandidateRequired !== true
    || packet.gates.previewRehearsal.productionDataRejected !== true
    || packet.gates.previewRehearsal.productionRefsRejected !== true
    || packet.gates.previewRehearsal.privilegedRuntimeCredentialsRejected !== true) {
    fail('supabase_preview_rehearsal_proposal_gate_invalid')
  }
  if (!Array.isArray(packet.requiredEvidence) || packet.requiredEvidence.length < 10) fail('supabase_preview_rehearsal_proposal_evidence_invalid')
  for (const evidence of [
    'preview-branch-status-and-migration-list',
    'source-controlled-migration-chain-applied-through-v13',
    'metadata-only-schema-fingerprint-comparison',
    'public-table-rls-and-anon-authenticated-denial',
    'private-schema-backend-role-policy-and-no-browser-grants',
    'tenant-a-b-isolation-and-active-session-revocation',
    'private-storage-six-request-privacy-proof',
    'backup-and-clean-restore',
    'security-and-performance-advisors-rerun',
  ]) {
    if (!packet.requiredEvidence.includes(evidence)) fail(`supabase_preview_rehearsal_proposal_evidence_missing:${evidence}`)
  }
  if (packet.controls?.supabaseBranchCreationApproved !== false
    || packet.controls?.supabaseBranchCreated !== false
    || packet.controls?.supabaseBranchDeleted !== false
    || packet.controls?.productionProjectMutated !== false
    || packet.controls?.productionDataCopied !== false
    || packet.controls?.productionRowsRead !== false
    || packet.controls?.privilegedRuntimeCredentialsIncluded !== false
    || packet.controls?.managedActivationAllowed !== false
    || packet.controls?.vercelDeploymentAllowed !== false
    || packet.controls?.githubWritesAllowed !== false) {
    fail('supabase_preview_rehearsal_proposal_controls_invalid')
  }
  if (!String(packet.ownerApprovalTemplate || '').includes('I approve one Supabase preview rehearsal setup')) fail('supabase_preview_rehearsal_proposal_approval_invalid')
  if (!Array.isArray(packet.sourceReceipts) || packet.sourceReceipts.length !== SOURCES.length) fail('supabase_preview_rehearsal_proposal_sources_invalid')
  for (const receipt of packet.sourceReceipts) {
    if (!SOURCES.includes(receipt.path) || !/^sha256:[0-9a-f]{64}$/.test(receipt.digest || '')) fail('supabase_preview_rehearsal_proposal_sources_invalid')
  }
  if (JSON.stringify(packet).toLowerCase().includes('postgres://') || JSON.stringify(packet).toLowerCase().includes('postgresql://')) {
    fail('supabase_preview_rehearsal_proposal_credential_invalid')
  }
  const { digest: actualDigest, ...body } = packet
  if (actualDigest !== packetDigest(body)) fail('supabase_preview_rehearsal_proposal_digest_invalid')
  return packet
}

export async function buildSupabasePreviewRehearsalProposal({
  sourceReceipts = [],
  generatedAt = '2026-08-25T00:00:00.000Z',
  securityAudit,
  readiness,
} = {}) {
  const [migrationPlan, browserQuarantineSql] = await Promise.all([
    migrationChain(),
    readText('supabase/rehearsal/20260804_public_browser_quarantine.sql'),
  ])
  const productionBaseline = currentSecurityBaseline(securityAudit || JSON.parse(await readText('hq/readiness/supabase-security-advisor-audit.json')))
  const readinessBaseline = readinessGateBaseline(readiness || JSON.parse(await readText('hq/readiness/managed-pilot-readiness.json')))
  const body = {
    contract: SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    repository: REPOSITORY,
    mode: 'owner_approval_required',
    state: 'prepared-not-executed',
    generatedAt,
    purpose: 'Prepare the exact Supabase preview rehearsal gate without creating a branch, reading production rows, copying production data, or approving managed activation.',
    productionBaseline,
    readinessBaseline,
    previewBranch: {
      kind: 'clean_empty_ephemeral_preview',
      parentProjectRef: productionBaseline.projectRef,
      parentClassification: 'protected-production',
      maximumLifetimeHours: MAX_PREVIEW_LIFETIME_HOURS,
      startsWithProductionData: false,
      seedProductionDataAllowed: false,
      productionRefsAllowed: false,
      privilegedRuntimeCredentialsAllowed: false,
      deleteAfterEvidence: true,
      failedBranchReuseAllowed: false,
      failedBranchName: 'security-rehearsal-24h-20260812',
    },
    migrationPlan: {
      ...migrationPlan,
      browserQuarantine: {
        path: 'supabase/rehearsal/20260804_public_browser_quarantine.sql',
        digest: digest(browserQuarantineSql),
      },
      liveProductionSchemaVersion: productionBaseline.liveSchemaVersion,
      sourceAheadOfLiveProduction: migrationPlan.schemaVersion > productionBaseline.liveSchemaVersion,
      productionApplyAllowed: false,
    },
    gates: {
      previewRehearsal: {
        status: 'blocked-until-executed',
        proofComplete: false,
        exactCandidateRequired: true,
        productionRefsRejected: true,
        productionDataRejected: true,
        privilegedRuntimeCredentialsRejected: true,
      },
      managedActivation: {
        status: 'blocked',
        requiresSeparateOwnerApproval: true,
        enabledByThisProposal: false,
      },
    },
    requiredEvidence: [
      'preview-branch-status-and-migration-list',
      'clean-empty-data-less-branch-confirmed',
      'source-controlled-migration-chain-applied-through-v13',
      'metadata-only-schema-fingerprint-comparison',
      'public-table-rls-and-anon-authenticated-denial',
      'private-schema-backend-role-policy-and-no-browser-grants',
      'tenant-a-b-isolation-and-active-session-revocation',
      'private-storage-six-request-privacy-proof',
      'backup-and-clean-restore',
      'security-and-performance-advisors-rerun',
      'branch-deleted-after-evidence',
      'no-production-retry-on-failure',
    ],
    executionPacketAfterApproval: {
      tool: 'tools/prepare_supabase_rehearsal_packet.mjs',
      commandTemplate: 'npm run database:supabase:packet -- --target-project-ref <preview-branch-ref> --output .tmp/supermega-rehearsal-packet.json --release-handoff <release-handoff.json>',
      outputMustBeGitignored: true,
      bindsExactCommitAfterSourcePacketCommit: true,
    },
    compatibilityWatchList: [
      {
        id: 'supabase-logs-all-removal-2026-09-23',
        source: 'https://supabase.com/changelog?types=breaking-change',
        requirement: 'No legacy Supabase Management API aggregate-log consumer may remain before the 2026-09-23 removal.',
      },
      {
        id: 'supabase-public-table-auto-exposure-2026-10-30',
        source: 'https://supabase.com/changelog?types=breaking-change',
        requirement: 'Every new public-table migration must use explicit grants or revokes before the 2026-10-30 default change reaches existing projects.',
      },
    ],
    documentation: {
      branching: 'https://supabase.com/docs/guides/deployment/branching',
      productionChecklist: 'https://supabase.com/docs/guides/deployment/going-into-prod',
      changelogBreakingChanges: 'https://supabase.com/changelog?types=breaking-change',
    },
    controls: {
      supabaseBranchCreationApproved: false,
      supabaseBranchCreated: false,
      supabaseBranchDeleted: false,
      providerMutationsPerformed: false,
      productionProjectMutated: false,
      productionDataCopied: false,
      productionRowsRead: false,
      privilegedRuntimeCredentialsIncluded: false,
      managedActivationAllowed: false,
      vercelDeploymentAllowed: false,
      githubWritesAllowed: false,
      customerContactAllowed: false,
      paymentOrStockActionAllowed: false,
    },
    ownerApprovalTemplate: `I approve one Supabase preview rehearsal setup for ${REPOSITORY} using migration chain ${migrationPlan.chainDigest} on a clean empty maximum-24-hour non-production preview branch only, with deletion after evidence. I do not approve production refs, production data, production writes, managed activation, credential change, Vercel deploy, GitHub push or PR or merge, customer contact, payment, stock, domain, hosted-write, or scheduler activation.`,
    sourceReceipts,
  }
  return validateProposalShape({ ...body, digest: packetDigest(body) })
}

export async function validateSupabasePreviewRehearsalProposal(packet) {
  const actual = validateProposalShape(packet)
  const expected = await currentProposal(actual.generatedAt)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('supabase_preview_rehearsal_proposal_stale')
  return actual
}

async function currentSourceReceipts() {
  const receipts = []
  for (const source of SOURCES) {
    receipts.push({ path: source, digest: digest(await readText(source)) })
  }
  return receipts
}

async function currentProposal(generatedAt = '2026-08-25T00:00:00.000Z') {
  return buildSupabasePreviewRehearsalProposal({
    sourceReceipts: await currentSourceReceipts(),
    generatedAt,
  })
}

async function writeCurrentProposal() {
  const proposal = await currentProposal()
  await mkdir(dirname(output), { recursive: true })
  const staged = resolve(dirname(output), `.supabase-preview-rehearsal-proposal.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(proposal, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, output)
  return proposal
}

async function runSelfTest() {
  const proposal = await buildSupabasePreviewRehearsalProposal({
    sourceReceipts: SOURCES.map((path) => ({ path, digest: `sha256:${'0'.repeat(64)}` })),
    securityAudit: {
      contract: 'supermega.supabase-security-advisor-audit.v2',
      projectRef: 'abcdefghijklmnopqrst',
      targetClassification: 'protected-production',
      postgres: { major: 17, status: 'ACTIVE_HEALTHY' },
      advisor: { status: 'clear', findingCount: 0 },
      catalog: { businessRowsRead: 0 },
      managedBackend: { liveSchemaVersion: 11, localTargetVersion: 11, versionDrift: 0, browserRolesDenied: true },
      controls: { databaseWrites: 0, providerMutations: 0 },
      asOf: '2026-08-25T00:00:00.000+06:30',
    },
    readiness: {
      contract: 'supermega.managed-pilot-readiness.v5',
      overall: { blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'], hostedActivationReady: false },
      previewRehearsal: {
        proofComplete: false,
        exactCandidateRequired: true,
        productionRefsRejected: true,
        productionDataRejected: true,
        privilegedRuntimeCredentialsRejected: true,
      },
    },
  })
  const checks = {
    proposal_valid: proposal.contract === SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT,
    clean_empty_preview_only: proposal.previewBranch.startsWithProductionData === false && proposal.previewBranch.maximumLifetimeHours === MAX_PREVIEW_LIFETIME_HOURS,
    migration_chain_bound: proposal.migrationPlan.migrationCount === EXPECTED_MIGRATION_COUNT && /^sha256:[0-9a-f]{64}$/.test(proposal.migrationPlan.chainDigest),
    no_supabase_mutation_authorized: proposal.controls.supabaseBranchCreationApproved === false && proposal.controls.productionProjectMutated === false,
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && !['--verify', '--self-test'].includes(args[0]))) fail('supabase_preview_rehearsal_proposal_usage_invalid')
  if (args[0] === '--self-test') {
    const result = await runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (args[0] === '--verify') {
    const proposal = await validateSupabasePreviewRehearsalProposal(JSON.parse(await readFile(output, 'utf8')))
    console.log(JSON.stringify({
      ok: true,
      contract: proposal.contract,
      repository: proposal.repository,
      migrationCount: proposal.migrationPlan.migrationCount,
      schemaVersion: proposal.migrationPlan.schemaVersion,
      proofComplete: false,
      supabaseBranchCreated: false,
      productionProjectMutated: false,
    }))
    return
  }
  const proposal = await writeCurrentProposal()
  console.log(JSON.stringify({
    ok: true,
    contract: proposal.contract,
    output: relative(root, output).split(sep).join('/'),
    repository: proposal.repository,
    migrationCount: proposal.migrationPlan.migrationCount,
    schemaVersion: proposal.migrationPlan.schemaVersion,
    proofComplete: false,
    supabaseBranchCreated: false,
    productionProjectMutated: false,
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SUPABASE_PREVIEW_REHEARSAL_PROPOSAL_CONTRACT,
      error: String(error?.message || 'supabase_preview_rehearsal_proposal_failed').slice(0, 240),
      supabaseBranchCreated: false,
      productionProjectMutated: false,
    }))
    process.exitCode = 1
  })
}
