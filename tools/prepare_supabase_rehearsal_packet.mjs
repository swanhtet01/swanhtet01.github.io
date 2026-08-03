import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const projectRefPattern = /^[a-z0-9]{20}$/
const commitPattern = /^[0-9a-f]{40}$/
const expectedSchemaVersion = 9
const expectedMigrationCount = 10
const expectedFinalMigration = '20260803063822_private_trial_backend_v9_metadata_rls.sql'

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

function digestPacket(payload) {
  return `sha256:${sha256(JSON.stringify(payload))}`
}

export async function buildSupabaseRehearsalPacket({
  repositoryRoot = root,
  targetProjectRef,
  releaseCommit,
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

  const migrations = await migrationInventory(repositoryRoot)
  const payload = {
    contract: 'supermega.supabase-rehearsal-packet.v1',
    state: 'prepared-not-executed',
    generatedAt,
    release: {
      commit: releaseCommit,
      schemaVersion: expectedSchemaVersion,
      migrationCount: migrations.length,
      migrations,
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
      'ordered-migration-application-through-v9',
      'read-only-v9-runtime-validator',
      'supabase-security-advisor-without-applicable-errors',
      'private-storage-isolation-proof',
      'named-user-auth-and-cross-tenant-denial',
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
} = {}) {
  if (!packet || packet.contract !== 'supermega.supabase-rehearsal-packet.v1') fail('supabase_rehearsal_packet_contract_invalid')
  if (packet.state !== 'prepared-not-executed') fail('supabase_rehearsal_packet_state_invalid')
  if (expectedReleaseCommit && packet.release?.commit !== expectedReleaseCommit) fail('supabase_rehearsal_packet_release_stale')
  const expected = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef: packet.authority?.rehearsalProjectRef,
    releaseCommit: packet.release?.commit,
    generatedAt: packet.generatedAt,
  })
  if (JSON.stringify(packet) !== JSON.stringify(expected)) fail('supabase_rehearsal_packet_evidence_stale')
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

function reviewedMainCommit(repositoryRoot) {
  if (git(repositoryRoot, 'status', '--porcelain')) fail('supabase_rehearsal_checkout_dirty')
  const head = git(repositoryRoot, 'rev-parse', 'HEAD')
  const main = git(repositoryRoot, 'rev-parse', 'origin/main')
  if (head !== main) fail('supabase_rehearsal_head_not_origin_main_fetch_first')
  return head
}

function parseArguments(args) {
  if (args[0] === '--verify' && args.length === 2) return { mode: 'verify', input: args[1] }
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith('--') || !args[index + 1]) fail('supabase_rehearsal_arguments_invalid')
    values.set(args[index], args[index + 1])
  }
  if (values.size !== 2 || !values.has('--target-project-ref') || !values.has('--output')) {
    fail('supabase_rehearsal_arguments_invalid')
  }
  return {
    mode: 'prepare',
    targetProjectRef: values.get('--target-project-ref'),
    output: values.get('--output'),
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
  const releaseCommit = reviewedMainCommit(root)
  if (command.mode === 'verify') {
    const input = resolveOutput(root, command.input)
    requireIgnoredOutput(root, input)
    const packet = await validateSupabaseRehearsalPacket(JSON.parse(await readFile(input, 'utf8')), {
      expectedReleaseCommit: releaseCommit,
    })
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      state: packet.state,
      targetProjectRef: packet.authority.rehearsalProjectRef,
      schemaVersion: packet.release.schemaVersion,
      migrationCount: packet.release.migrationCount,
      activationAllowed: false,
      externalMutationPerformed: false,
    }))
    return
  }

  const destination = resolveOutput(root, command.output)
  requireIgnoredOutput(root, destination)
  const packet = await buildSupabaseRehearsalPacket({
    targetProjectRef: command.targetProjectRef,
    releaseCommit,
  })
  await validateSupabaseRehearsalPacket(packet, { expectedReleaseCommit: releaseCommit })
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
