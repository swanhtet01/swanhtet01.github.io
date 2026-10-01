#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RECOVERY_PLAN_CONTRACT = 'supermega.supabase-preview-recovery-plan.v1'
export const PROVIDER_READBACK_CONTRACT = 'supermega.supabase-provider-readback.v1'
export const REPAIR_RECEIPT_CONTRACT = 'supermega.supabase-preview-repair-receipt.v1'

const root = resolve(import.meta.dirname, '..')
const providerReadbackPath = resolve(root, 'hq', 'readiness', 'supabase-provider-readback-20261001.json')
const outputPath = resolve(root, 'hq', 'readiness', 'supabase-preview-recovery-plan.json')
const receiptPath = resolve(root, 'hq', 'readiness', 'supabase-preview-repair-receipt-20261002.json')
const migrationDirectory = resolve(root, 'supabase', 'migrations')
const expectedProductionRef = 'zvtzwcimpvvtkowflhda'
const expectedAcceptanceRef = 'twflgmlwfkykgzsxnegc'
const expectedSchemaVersion = 13
const expectedMigrationCount = 24
const publicBaseline = '20260711081300_public_legacy_baseline.sql'
const rowCountNames = Object.freeze([
  'workspace_memberships',
  'workspace_state',
  'workspace_events',
  'website_customer_reviews',
  'ecommerce_customer_reviews',
  'ecommerce_customer_decisions',
])

function fail(code) {
  throw new Error(code)
}

function sha256(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
  return createHash('sha256').update(text.replace(/\r\n?/g, '\n')).digest('hex')
}

function digestJson(value) {
  return `sha256:${sha256(JSON.stringify(value))}`
}

export function contentDigest(value) {
  return `sha256:${sha256(value)}`
}

function normalizeMigrationName(filename) {
  return filename.replace(/^\d{14}_/, '').replace(/\.sql$/, '')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function sourceMigrationChain() {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
  if (names.length !== expectedMigrationCount) fail('supabase_preview_recovery_source_migration_count')
  if (names[0] !== publicBaseline) fail('supabase_preview_recovery_public_baseline')
  const migrations = []
  for (const name of names) {
    const content = await readFile(resolve(migrationDirectory, name))
    migrations.push({
      name,
      logicalName: normalizeMigrationName(name),
      path: `supabase/migrations/${name}`,
      digest: contentDigest(content),
    })
  }
  return {
    count: migrations.length,
    schemaVersion: expectedSchemaVersion,
    chainDigest: digestJson(migrations),
    migrations,
    privateMigrations: migrations.slice(1),
  }
}

function validateProviderReadback(readback) {
  if (!isRecord(readback) || readback.contract !== PROVIDER_READBACK_CONTRACT) {
    fail('supabase_preview_recovery_provider_contract')
  }
  if (Number.isNaN(Date.parse(readback.capturedAt))) fail('supabase_preview_recovery_provider_timestamp')
  if (!/^[0-9a-f]{40}$/.test(readback.sourceCommit || '')) {
    fail('supabase_preview_recovery_source_commit')
  }
  const production = readback.production
  if (production?.projectRef !== expectedProductionRef
    || production.projectStatus !== 'ACTIVE_HEALTHY'
    || production.previewProjectStatus !== 'ACTIVE_HEALTHY'
    || production.schemaVersion !== expectedSchemaVersion) {
    fail('supabase_preview_recovery_production_state')
  }
  const branch = readback.acceptance
  if (branch?.projectRef !== expectedAcceptanceRef
    || branch.parentProjectRef !== expectedProductionRef
    || !Array.isArray(branch.appliedMigrationNames)
    || !isRecord(branch.rowCounts)) {
    fail('supabase_preview_recovery_acceptance_identity')
  }
  if (JSON.stringify(Object.keys(branch.rowCounts).sort())
    !== JSON.stringify([...rowCountNames].sort())) {
    fail('supabase_preview_recovery_row_count_roster')
  }
  if (readback.controls?.providerReadsOnly !== true
    || readback.controls.productionRowsInspected !== false
    || readback.controls.credentialValuesRead !== false
    || readback.controls.databaseWrites !== 0
    || readback.controls.providerMutations !== 0
    || readback.controls.deploymentChanges !== 0) {
    fail('supabase_preview_recovery_read_only_boundary')
  }
  return readback
}

export function selectRecoveryAction(readback, migrationPlan) {
  validateProviderReadback(readback)
  const branch = readback.acceptance
  const expected = migrationPlan.privateMigrations.map((entry) => entry.logicalName)
  const observed = branch.appliedMigrationNames
  const exactPrefix = observed.length <= expected.length
    && observed.every((name, index) => name === expected[index])
  const empty = rowCountNames.every((name) => branch.rowCounts[name] === 0)
  const missing = exactPrefix ? migrationPlan.privateMigrations.slice(observed.length) : []

  if (branch.previewProjectStatus !== 'ACTIVE_HEALTHY') {
    return {
      action: 'retire',
      reasonCodes: ['preview_target_not_healthy'],
      missingMigrations: [],
    }
  }
  if (branch.withData !== false || !empty || branch.schemaVersion !== expectedSchemaVersion || !exactPrefix) {
    const reasons = []
    if (branch.withData !== false) reasons.push('data_boundary_not_empty')
    if (!empty) reasons.push('business_rows_present')
    if (branch.schemaVersion !== expectedSchemaVersion) reasons.push('schema_version_mismatch')
    if (!exactPrefix) reasons.push('migration_history_diverged')
    return {
      action: 'recreate',
      reasonCodes: reasons,
      missingMigrations: [],
    }
  }
  if (branch.status === 'MIGRATIONS_FAILED' && missing.length > 0) {
    return {
      action: 'repair',
      reasonCodes: [
        'preview_target_healthy',
        'branch_empty',
        'schema_version_current',
        'migration_history_exact_prefix',
        'missing_suffix_only',
      ],
      missingMigrations: missing,
    }
  }
  return {
    action: 'retire',
    reasonCodes: ['no_bounded_repair_condition'],
    missingMigrations: [],
  }
}

function validateMigrationRecord(entry) {
  return isRecord(entry)
    && /^\d{14}_.+\.sql$/.test(entry.name || '')
    && entry.logicalName === normalizeMigrationName(entry.name)
    && entry.path === `supabase/migrations/${entry.name}`
    && /^sha256:[0-9a-f]{64}$/.test(entry.digest || '')
    && Object.keys(entry).sort().join(',') === 'digest,logicalName,name,path'
}

export function validateRecoveryPlanShape(plan) {
  if (!isRecord(plan) || plan.contract !== RECOVERY_PLAN_CONTRACT) {
    fail('supabase_preview_recovery_plan_contract')
  }
  if (plan.state !== 'prepared-not-executed' || plan.mode !== 'owner-approval-required') {
    fail('supabase_preview_recovery_plan_state')
  }
  if (plan.integrationBaseCommit !== plan.providerReadback?.sourceCommit) {
    fail('supabase_preview_recovery_plan_source_binding')
  }
  validateProviderReadback(plan.providerReadback)
  if (plan.migrationPlan?.count !== expectedMigrationCount
    || plan.migrationPlan.schemaVersion !== expectedSchemaVersion
    || !/^sha256:[0-9a-f]{64}$/.test(plan.migrationPlan.chainDigest || '')
    || !Array.isArray(plan.migrationPlan.migrations)
    || plan.migrationPlan.migrations.length !== expectedMigrationCount
    || plan.migrationPlan.migrations.some((entry) => !validateMigrationRecord(entry))) {
    fail('supabase_preview_recovery_plan_migrations')
  }
  if (plan.migrationPlan.chainDigest !== digestJson(plan.migrationPlan.migrations)) {
    fail('supabase_preview_recovery_plan_migration_digest')
  }
  if (plan.decision?.action !== 'repair'
    || !Array.isArray(plan.decision.reasonCodes)
    || JSON.stringify(plan.decision.missingMigrations)
      !== JSON.stringify(plan.migrationPlan.migrations.slice(-2))) {
    fail('supabase_preview_recovery_plan_decision')
  }
  if (plan.execution?.authorized !== false
    || plan.execution.databaseWrites !== 0
    || plan.execution.providerMutations !== 0
    || plan.execution.productionChanges !== 0
    || plan.execution.deploymentChanges !== 0
    || plan.execution.customerDataAllowed !== false
    || plan.execution.credentialValuesIncluded !== false) {
    fail('supabase_preview_recovery_plan_execution_boundary')
  }
  if (plan.stalePacket?.contract !== 'supermega.supabase-preview-rehearsal-proposal.v1'
    || plan.stalePacket.executable !== false
    || !plan.stalePacket.reasonCodes.includes('production_schema_evidence_stale')) {
    fail('supabase_preview_recovery_plan_stale_packet')
  }
  if (!Array.isArray(plan.requiredPostRepairEvidence)
    || !plan.requiredPostRepairEvidence.includes('branch-status-no-longer-migrations-failed')
    || !plan.requiredPostRepairEvidence.includes('exact-24-file-source-parity')
    || !plan.requiredPostRepairEvidence.includes('synthetic-save-reload-and-cross-tenant-denial-cleanup')) {
    fail('supabase_preview_recovery_plan_required_evidence')
  }
  const { digest, ...body } = plan
  if (digest !== digestJson(body)) fail('supabase_preview_recovery_plan_digest')
  return plan
}

export async function buildRecoveryPlan(readback) {
  const providerReadback = validateProviderReadback(structuredClone(readback))
  const source = await sourceMigrationChain()
  const decision = selectRecoveryAction(providerReadback, source)
  if (decision.action !== 'repair' || decision.missingMigrations.length !== 2) {
    fail('supabase_preview_recovery_current_decision_not_repair')
  }
  const migrationPlan = {
    count: source.count,
    schemaVersion: source.schemaVersion,
    chainDigest: source.chainDigest,
    migrations: source.migrations,
  }
  const body = {
    contract: RECOVERY_PLAN_CONTRACT,
    state: 'prepared-not-executed',
    mode: 'owner-approval-required',
    generatedAt: providerReadback.capturedAt,
    integrationBaseCommit: providerReadback.sourceCommit,
    providerReadback,
    migrationPlan,
    decision: {
      action: decision.action,
      reasonCodes: decision.reasonCodes,
      missingMigrations: decision.missingMigrations,
      scope: 'acceptance-branch-only',
      productionProjectAllowed: false,
      applyAutomatically: false,
    },
    stalePacket: {
      path: 'hq/readiness/supabase-preview-rehearsal-proposal.json',
      contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
      executable: false,
      reasonCodes: [
        'production_schema_evidence_stale',
        'branch_identity_stale',
        'provider_state_not_current',
      ],
    },
    requiredPostRepairEvidence: [
      'branch-status-no-longer-migrations-failed',
      'exact-24-file-source-parity',
      'schema-version-13',
      'zero-business-row-counts-before-and-after',
      'security-and-performance-advisors-rerun',
      'immutable-preview-bound-to-exact-source',
      'founder-login-shop-sites-commerce-save-reload',
      'synthetic-save-reload-and-cross-tenant-denial-cleanup',
      'backup-restore-and-recovery',
    ],
    execution: {
      authorized: false,
      databaseWrites: 0,
      providerMutations: 0,
      productionChanges: 0,
      deploymentChanges: 0,
      customerDataAllowed: false,
      credentialValuesIncluded: false,
      nextOwnerGate: 'Apply only the two named migrations to acceptance branch twflgmlwfkykgzsxnegc, then stop for read-only verification.',
    },
  }
  return validateRecoveryPlanShape({ ...body, digest: digestJson(body) })
}

async function currentPlan() {
  const readback = JSON.parse(await readFile(providerReadbackPath, 'utf8'))
  return buildRecoveryPlan(readback)
}

export async function validateRecoveryPlan(plan) {
  const actual = validateRecoveryPlanShape(plan)
  const expected = await currentPlan()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('supabase_preview_recovery_plan_stale')
  }
  return actual
}

export function validatePreviewRepairReceiptShape(receipt, plan) {
  if (!isRecord(receipt) || receipt.contract !== REPAIR_RECEIPT_CONTRACT) {
    fail('supabase_preview_repair_receipt_contract')
  }
  if (receipt.state !== 'database-parity-repaired-provider-status-stale'
    || Number.isNaN(Date.parse(receipt.capturedAt))
    || !/^[0-9a-f]{40}$/.test(receipt.integrationCommit || '')
    || receipt.pullRequest !== 639) {
    fail('supabase_preview_repair_receipt_identity')
  }
  if (receipt.sourcePlan?.path !== 'hq/readiness/supabase-preview-recovery-plan.json'
    || receipt.sourcePlan.contract !== RECOVERY_PLAN_CONTRACT
    || receipt.sourcePlan.digest !== plan.digest
    || receipt.sourcePlan.integrationBaseCommit !== plan.integrationBaseCommit) {
    fail('supabase_preview_repair_receipt_plan_binding')
  }
  const target = receipt.target
  if (target?.projectRef !== expectedAcceptanceRef
    || target.parentProjectRef !== expectedProductionRef
    || target.branchId !== '8ceada93-22b2-405d-98fd-4e682471b9bd'
    || target.providerStatusBefore !== 'MIGRATIONS_FAILED'
    || target.providerStatusAfter !== 'MIGRATIONS_FAILED'
    || target.previewProjectStatus !== 'ACTIVE_HEALTHY'
    || target.schemaVersionBefore !== expectedSchemaVersion
    || target.schemaVersionAfter !== expectedSchemaVersion) {
    fail('supabase_preview_repair_receipt_target')
  }
  const expectedBefore = plan.providerReadback.acceptance.appliedMigrationNames
  const expectedApplied = plan.decision.missingMigrations.map((entry, index) => ({
    name: entry.logicalName,
    sourcePath: entry.path,
    sourceDigest: entry.digest,
    providerVersion: ['20261001180832', '20261001180915'][index],
  }))
  const expectedAfter = [...expectedBefore, ...expectedApplied.map((entry) => entry.name)]
  if (JSON.stringify(receipt.preconditions?.appliedMigrationNames) !== JSON.stringify(expectedBefore)
    || receipt.preconditions.migrationCount !== expectedBefore.length
    || receipt.preconditions.indexPresent !== false
    || receipt.preconditions.policyCount !== 13
    || JSON.stringify(receipt.preconditions.rowCounts) !== JSON.stringify(plan.providerReadback.acceptance.rowCounts)) {
    fail('supabase_preview_repair_receipt_preconditions')
  }
  if (JSON.stringify(receipt.appliedMigrations) !== JSON.stringify(expectedApplied)) {
    fail('supabase_preview_repair_receipt_migrations')
  }
  if (JSON.stringify(receipt.postconditions?.appliedMigrationNames) !== JSON.stringify(expectedAfter)
    || receipt.postconditions.migrationCount !== expectedAfter.length
    || receipt.postconditions.indexPresent !== true
    || receipt.postconditions.policyCount !== 13
    || receipt.postconditions.cachedPolicySubqueries !== true
    || JSON.stringify(receipt.postconditions.rowCounts) !== JSON.stringify(plan.providerReadback.acceptance.rowCounts)) {
    fail('supabase_preview_repair_receipt_postconditions')
  }
  if (receipt.controls?.productionDatabaseWrites !== 0
    || receipt.controls.previewDatabaseWrites !== 2
    || receipt.controls.authUsersCreated !== 0
    || receipt.controls.customerRowsWritten !== 0
    || receipt.controls.vercelDeployments !== 0
    || receipt.controls.iamChanges !== 0
    || receipt.controls.credentialValuesRead !== false) {
    fail('supabase_preview_repair_receipt_controls')
  }
  if (receipt.acceptance?.providerBranchStatusReconciled !== false
    || receipt.acceptance.hostedSignIn !== 'NOT RUN'
    || receipt.acceptance.saveReload !== 'NOT RUN'
    || receipt.acceptance.crossTenantDenial !== 'NOT RUN'
    || receipt.acceptance.recovery !== 'NOT RUN') {
    fail('supabase_preview_repair_receipt_acceptance')
  }
  return receipt
}

export async function validatePreviewRepairReceipt(receipt, plan) {
  const actual = validatePreviewRepairReceiptShape(receipt, plan)
  const source = await sourceMigrationChain()
  for (const applied of actual.appliedMigrations) {
    const migration = source.migrations.find((entry) => entry.path === applied.sourcePath)
    if (!migration || migration.digest !== applied.sourceDigest) {
      fail('supabase_preview_repair_receipt_source_digest')
    }
  }
  return actual
}

async function writeCurrentPlan() {
  const plan = await currentPlan()
  await mkdir(dirname(outputPath), { recursive: true })
  const staged = resolve(dirname(outputPath), `.supabase-preview-recovery-plan.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, outputPath)
  return plan
}

async function runSelfTest() {
  const readback = JSON.parse(await readFile(providerReadbackPath, 'utf8'))
  const plan = await buildRecoveryPlan(readback)
  return {
    ok: plan.decision.action === 'repair'
      && plan.decision.missingMigrations.length === 2
      && plan.execution.authorized === false,
    contract: `${RECOVERY_PLAN_CONTRACT}.self-test`,
    action: plan.decision.action,
    missingMigrationCount: plan.decision.missingMigrations.length,
    authorized: plan.execution.authorized,
  }
}

async function main() {
  const arg = process.argv[2]
  if (process.argv.length > 3 || (arg && !['--verify', '--self-test'].includes(arg))) {
    fail('supabase_preview_recovery_usage')
  }
  if (arg === '--self-test') {
    const result = await runSelfTest()
    console.log(JSON.stringify(result))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (arg === '--verify') {
    const plan = await validateRecoveryPlan(JSON.parse(await readFile(outputPath, 'utf8')))
    const receipt = await validatePreviewRepairReceipt(
      JSON.parse(await readFile(receiptPath, 'utf8')),
      plan,
    )
    console.log(JSON.stringify({
      ok: true,
      contract: plan.contract,
      action: plan.decision.action,
      missingMigrationCount: plan.decision.missingMigrations.length,
      authorized: plan.execution.authorized,
      receiptContract: receipt.contract,
      receiptState: receipt.state,
    }))
    return
  }
  const plan = await writeCurrentPlan()
  console.log(JSON.stringify({
    ok: true,
    contract: plan.contract,
    output: relative(root, outputPath).split(sep).join('/'),
    action: plan.decision.action,
    missingMigrationCount: plan.decision.missingMigrations.length,
    authorized: plan.execution.authorized,
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: RECOVERY_PLAN_CONTRACT,
      error: String(error?.message || 'supabase_preview_recovery_failed').slice(0, 200),
      authorized: false,
    }))
    process.exitCode = 1
  })
}
