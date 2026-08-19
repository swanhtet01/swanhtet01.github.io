import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

const root = resolve(import.meta.dirname, '..')
const migrationDirectory = resolve(root, 'supabase', 'migrations')
const digestQueryPath = resolve(root, 'tools', 'supabase_private_surface_digest.sql')
const evidencePath = resolve(root, 'hq', 'readiness', 'supabase-branch-parity.json')

export const BRANCH_PARITY_CONTRACT = 'supermega.supabase-branch-parity.v1'
export const SURFACE_DIGEST_CONTRACT = 'supermega.supabase-private-surface-digest.v1'

const expectedSections = [
  'schema_version',
  'relations',
  'columns',
  'policies',
  'functions',
  'constraints',
  'triggers',
  'indexes',
  'grants',
  'backend_role',
]
const browserRoles = ['anon', 'authenticated', 'service_role']
const forbiddenSchemaRoles = new Set([...browserRoles, 'authenticator', 'public', 'PUBLIC'])
const dataTables = [
  'approval_requests',
  'workspace_access_controls',
  'workspace_events',
  'workspace_memberships',
  'workspace_state',
]
const projectRefPattern = /^[a-z0-9]{20}$/
const digestPattern = /^[0-9a-f]{64}$/
// The legacy public tables are default-deny with no policy, which is exactly
// what this INFO lint reports. It is the only advisor notice the gate tolerates.
const toleratedInfoLintName = 'rls_enabled_no_policy'

function fail(code) {
  throw new Error(code)
}

export async function computeExpectedSurfaceDigest() {
  const names = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()
  if (names.length === 0) fail('supabase_branch_parity_no_migrations')
  const database = new PGlite()
  try {
    await database.waitReady
    // Supabase provides these roles and the auth session table; the reviewed
    // migrations depend on them existing before the private schema is created.
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth authorization postgres;
      create table auth.sessions (id uuid primary key, user_id uuid not null);
    `)
    for (const name of names) {
      await database.exec(await readFile(resolve(migrationDirectory, name), 'utf8'))
    }
    const query = await readFile(digestQueryPath, 'utf8')
    const result = await database.query(query)
    return result.rows[0]?.surface_digest ?? null
  } finally {
    await database.close()
  }
}

function assertDigestShape(label, digest) {
  if (!digest || typeof digest !== 'object') fail(`supabase_branch_parity_${label}_missing`)
  if (digest.contract !== SURFACE_DIGEST_CONTRACT) fail(`supabase_branch_parity_${label}_contract`)
  if (!digestPattern.test(String(digest.surface))) fail(`supabase_branch_parity_${label}_surface`)
  const sections = digest.sections
  if (!sections || typeof sections !== 'object') fail(`supabase_branch_parity_${label}_sections`)
  const names = Object.keys(sections).sort()
  if (JSON.stringify(names) !== JSON.stringify([...expectedSections].sort())) {
    fail(`supabase_branch_parity_${label}_section_inventory`)
  }
  for (const name of expectedSections) {
    if (!digestPattern.test(String(sections[name]))) {
      fail(`supabase_branch_parity_${label}_section_${name}`)
    }
  }
}

export function verifyEvidence(evidence, expectedDigest) {
  const checks = []
  const require = (name, condition) => {
    if (!condition) fail(name)
    checks.push(name)
  }

  require('parity contract', evidence?.contract === BRANCH_PARITY_CONTRACT)
  require('capture timestamp', !Number.isNaN(Date.parse(evidence?.capturedAt)))

  const branch = evidence?.branch
  require('branch name', typeof branch?.name === 'string' && branch.name.length > 0)
  require('branch project ref', projectRefPattern.test(String(branch?.projectRef)))
  require('parent project ref', projectRefPattern.test(String(branch?.parentProjectRef)))
  require('branch is not the parent project', branch.projectRef !== branch.parentProjectRef)

  assertDigestShape('expected', expectedDigest)
  assertDigestShape('observed', evidence?.observed)

  require('surface digest parity', evidence.observed.surface === expectedDigest.surface)
  for (const name of expectedSections) {
    require(
      `section parity ${name}`,
      evidence.observed.sections[name] === expectedDigest.sections[name],
    )
  }

  const isolation = evidence?.isolation
  require('schema usage roster', Array.isArray(isolation?.rolesWithSchemaUsage))
  require(
    'backend role holds schema usage',
    isolation.rolesWithSchemaUsage.includes('supermega_trial_backend'),
  )
  require(
    'no browser-facing role holds schema usage',
    isolation.rolesWithSchemaUsage.every((role) => !forbiddenSchemaRoles.has(String(role))),
  )
  require(
    'browser roles recorded as denied',
    browserRoles.every((role) => isolation?.browserRolesDenied?.includes(role)),
  )
  require('public pseudo-role holds no schema usage', isolation?.publicPseudoRoleHasUsage === false)
  require(
    'backend role members exclude browser-facing roles',
    Array.isArray(isolation?.backendRoleMembers) &&
      isolation.backendRoleMembers.every((role) => !forbiddenSchemaRoles.has(String(role))),
  )
  require('graphql exposes no public relation', isolation?.graphqlPublicRelations === 0)

  const rowCounts = isolation?.tableRowCounts
  require('row count roster', rowCounts && typeof rowCounts === 'object')
  require(
    'row count inventory',
    JSON.stringify(Object.keys(rowCounts).sort()) === JSON.stringify([...dataTables].sort()),
  )
  require(
    'isolated branch carries no tenant data',
    dataTables.every((table) => rowCounts[table] === 0),
  )

  // This branch reproduces the parent project's legacy public tables, so the
  // property under test is not that the public schema is empty but that nothing
  // in it is reachable from a browser session.
  const publicSurface = evidence?.publicSurface
  require(
    'public table inventory is populated',
    Number.isInteger(publicSurface?.tableCount) && publicSurface.tableCount > 0,
  )
  require(
    'row level security covers every public table',
    publicSurface.tablesWithoutRowLevelSecurity === 0,
  )
  require(
    'no public table is reachable by a browser role',
    publicSurface.tablesReachableByBrowserRole === 0,
  )
  require(
    'browser-reachable public table roster is empty',
    Array.isArray(publicSurface.browserReachableTableNames) &&
      publicSurface.browserReachableTableNames.length === 0,
  )
  require(
    'browser-reachable count agrees with the named roster',
    publicSurface.tablesReachableByBrowserRole === publicSurface.browserReachableTableNames.length,
  )

  const securityAdvisor = evidence?.securityAdvisor
  require('security advisor reports no errors', securityAdvisor?.errorCount === 0)
  require('security advisor reports no warnings', securityAdvisor.warnCount === 0)
  require(
    'security advisor info count',
    Number.isInteger(securityAdvisor.infoCount) && securityAdvisor.infoCount >= 0,
  )
  require(
    'security advisor info lints are only the default-deny notice',
    Array.isArray(securityAdvisor.infoLintNames) &&
      securityAdvisor.infoLintNames.every((name) => name === toleratedInfoLintName),
  )

  return checks
}

export async function verifyBranchParity() {
  const [expectedDigest, evidenceRaw] = await Promise.all([
    computeExpectedSurfaceDigest(),
    readFile(evidencePath, 'utf8'),
  ])
  const evidence = JSON.parse(evidenceRaw)
  const checks = verifyEvidence(evidence, expectedDigest)
  return {
    ok: true,
    contract: BRANCH_PARITY_CONTRACT,
    branch: evidence.branch.name,
    projectRef: evidence.branch.projectRef,
    surface: expectedDigest.surface,
    checks: checks.length,
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--print-expected')) {
    console.log(JSON.stringify(await computeExpectedSurfaceDigest(), null, 2))
  } else {
    console.log(JSON.stringify(await verifyBranchParity()))
  }
}
