import { createHash, createPublicKey, generateKeyPairSync, sign as signBytes, verify as verifyBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildSupabaseRehearsalPacket,
  EXPECTED_SUPABASE_REHEARSAL_MIGRATIONS,
  originMainReleaseReview,
  validateSupabaseRehearsalPacket,
} from './prepare_supabase_rehearsal_packet.mjs'

// Orchestrates the entire 24-hour Supabase preview-branch rehearsal window so
// it cannot burn on improvisation. Every hosted action shells out to a
// committed tool along the repo's documented paths:
//   - URL and target binding: tools/validate_supermega_database_url.py
//     --rehearsal-preflight (read-only, verify-full, non-production binding).
//   - Release authority: one validated rehearsal packet, a digest-pinned
//     Ed25519 owner signature, and a distinct reviewer signature bind
//     origin/main, the authenticated ephemeral branch receipt, absolute
//     deletion deadline, connection digests, and exact migration bytes.
//   - Migration application: psql --set ON_ERROR_STOP=1 --file <migration>.
//     No SQL is embedded here; only reviewed, packet-bound files are applied.
//   - Quarantine: supabase/rehearsal/20260804_public_browser_quarantine.sql
//     (self-guarding, self-verifying; fail-closes on inventory drift).
//   - Hosted validator: validate_supermega_database_url.py --ensure-schema
//     --require-ready (read-only v10 contract).
//   - Storage privacy: tools/verify_private_storage_privacy.py --preflight
//     (offline configuration proof; the live six-request audit stays
//     owner-gated in docs/rehearsal-runbook.md).
//   - Session revocation: supabase/rehearsal/
//     20260807_preview_session_revocation_probe.sql (rollback-only probe).
//
// The tool performs zero action when SUPERMEGA_REHEARSAL_DATABASE_URL is
// absent, fail-closes on the first failing step, never resumes hosted writes
// from local state, and never accepts or prints credential values.

export const PREVIEW_REHEARSAL_CONTRACT = 'supermega.preview-branch-rehearsal.v2'
export const PREVIEW_REHEARSAL_APPROVAL_CONTRACT = 'supermega.preview-rehearsal-approval.v4'
export const PREVIEW_REHEARSAL_REVIEW_CONTRACT = 'supermega.preview-rehearsal-independent-review.v1'
export const PREVIEW_REHEARSAL_AUTHORITY_CONTRACT = 'supermega.preview-rehearsal-authority.v1'
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const WINDOW_HOURS = 24
const MINIMUM_EXECUTION_WINDOW_MINUTES = 180
const LOCAL_SUBPROCESS_TIMEOUT_MS = 15_000
const projectRefPattern = /^[a-z0-9]{20}$/
const commitPattern = /^[0-9a-f]{40}$/
const digestPattern = /^sha256:[0-9a-f]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const QUARANTINE_PATH = 'supabase/rehearsal/20260804_public_browser_quarantine.sql'
const PROBE_PATH = 'supabase/rehearsal/20260807_preview_session_revocation_probe.sql'
const SECURITY_AUDIT_PATH = 'hq/readiness/supabase-security-advisor-audit.json'
const MIGRATION_DIRECTORY = 'supabase/migrations'
const EXPECTED_MIGRATION_COUNT = 12
const EXPECTED_FIRST_MIGRATION = '20260711081300_public_legacy_baseline.sql'
const EXPECTED_FINAL_MIGRATION = '20260804102000_private_trial_backend_v10_supabase_session_revocation.sql'
const EXPECTED_MIGRATIONS = [...EXPECTED_SUPABASE_REHEARSAL_MIGRATIONS]
const URL_ENV = 'SUPERMEGA_REHEARSAL_DATABASE_URL'
const REF_ENV = 'SUPERMEGA_REHEARSAL_PROJECT_REF'
const CA_ENV = 'SUPERMEGA_SUPABASE_CA_FILE'
const RUNTIME_URL_ENV = 'SUPERMEGA_REHEARSAL_RUNTIME_DATABASE_URL'
const STORAGE_AUDIT_URL_ENV = 'SUPERMEGA_REHEARSAL_STORAGE_AUDIT_DATABASE_URL'
const PACKET_ENV = 'SUPERMEGA_REHEARSAL_PACKET_FILE'
const APPROVAL_ENV = 'SUPERMEGA_REHEARSAL_APPROVAL_FILE'
const MANAGEMENT_TOKEN_ENV = 'SUPERMEGA_REHEARSAL_MANAGEMENT_API_TOKEN'
const PRODUCTION_REF_ENV = 'SUPERMEGA_PRODUCTION_PROJECT_REF'
const POSTGRES_BIN_ENV = 'SUPERMEGA_POSTGRES17_BIN'
const GIT_BIN_ENV = 'SUPERMEGA_GIT_BIN'
const PYTHON_BIN_ENV = 'SUPERMEGA_PYTHON_BIN'
const STORAGE_PRIVACY_ENV = [
  'SUPERMEGA_STORAGE_PRIVACY_ADAPTER',
  'SUPERMEGA_STORAGE_PRIVACY_BASE_URL',
  'SUPERMEGA_STORAGE_PRIVACY_ALLOWED_HOST',
  'SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID',
  'SUPERMEGA_STORAGE_PRIVACY_BUCKET',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_PREFIX',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_OBJECT',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_PREFIX',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_OBJECT',
  'SUPERMEGA_STORAGE_PRIVACY_PUBLISHABLE_KEY',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_JWT',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_JWT',
]
const STORAGE_PRIVACY_SECRET_ENV = [
  'SUPERMEGA_STORAGE_PRIVACY_PUBLISHABLE_KEY',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_A_JWT',
  'SUPERMEGA_STORAGE_PRIVACY_TENANT_B_JWT',
]
const LEAK_TOKENS = ['postgres://', 'postgresql://', 'sb_secret_', 'password=']
const PRIVILEGED_DATABASE_ROLES = new Set([
  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated',
  'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
  'pg_read_server_files', 'pg_write_server_files',
])
const REQUIRED_APPROVED_ACTIONS = [
  'apply_complete_source_migration_chain_to_preview',
  'apply_packet_bound_public_browser_quarantine_to_preview',
  'run_preview_validation_and_rollback_only_probes',
]
const TRUST_SOURCE_PATHS = Object.freeze({
  runner: 'tools/run_preview_branch_rehearsal.mjs',
  packetBuilder: 'tools/prepare_supabase_rehearsal_packet.mjs',
  databaseValidator: 'tools/validate_supermega_database_url.py',
  storagePrivacyVerifier: 'tools/verify_private_storage_privacy.py',
  publicQuarantineVerifier: 'tools/verify_public_browser_quarantine.mjs',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  pythonProject: 'pyproject.toml',
  pythonLock: 'uv.lock',
})
const AUTHORITY_PATH = 'hq/readiness/supabase-preview-rehearsal-authority.json'
const AUTHORITY_APPROVAL_DOMAIN = 'supermega.preview-rehearsal-approval.v4\n'
const AUTHORITY_REVIEW_DOMAIN = 'supermega.preview-rehearsal-independent-review.v1\n'
// A registered signer policy becomes executable only through a separately
// reviewed source change that pins its complete canonical digest here.
const TRUSTED_REGISTERED_REHEARSAL_AUTHORITY_POLICY_DIGEST = null
const REQUIRED_CLEAN_TARGET_CHECKS = [
  'postgres_major_17',
  'read_only_encrypted_connection',
  'session_role_stable',
  'administrative_role_can_create_runtime_role',
  'administrative_role_can_create_private_schema',
  'postgres_database_selected',
  'private_schema_absent',
  'backend_role_absent',
  'public_user_relations_absent',
  'public_routines_absent',
  'event_triggers_absent',
  'subscriptions_absent',
  'foreign_servers_absent',
  'user_mappings_absent',
  'large_objects_absent',
  'unexpected_user_schemas_absent',
  'provider_metadata_fingerprint_captured',
  'complete_provider_catalog_fingerprint',
  'auth_users_absent',
  'auth_sessions_absent',
  'storage_buckets_absent',
  'storage_objects_absent',
]
const CLEAN_TARGET_METADATA_KEYS = [
  'schemas', 'extensions', 'relations', 'columns', 'constraints', 'indexes',
  'routines', 'triggers', 'policies', 'rewrite_rules', 'types', 'event_triggers',
  'default_acls', 'roles', 'role_memberships', 'role_settings', 'publications',
  'publication_relations', 'subscriptions', 'subscription_relations',
  'foreign_data_wrappers', 'foreign_servers', 'user_mappings', 'large_objects',
  'database_configuration',
]
const HOSTED_READY_CHECKS = [
  'postgres_major_supported',
  'supabase_postgres17_unsupported_extensions_absent',
  'read_only_encrypted_connection',
  'dedicated_runtime_role',
  'backend_group_role_safe',
  'private_schema_present',
  'schema_version_current',
  'expected_private_tables_only',
  'metadata_table_rls',
  'tenant_tables_force_rls',
  'trusted_private_object_ownership',
  'runtime_role_membership_exact',
  'backend_membership_exact',
  'runtime_and_backend_role_settings_empty',
  'policy_contract_exact',
  'security_constraints_exact',
  'immutable_and_version_triggers_exact',
  'private_indexes_exact',
  'private_acl_exact',
  'backend_acl_scope_exact',
  'private_default_acl_empty',
  'browser_roles_not_backend_members',
  'storage_audit_connection_read_only_encrypted',
  'storage_catalog_present',
  'storage_tables_rls_enabled',
  'storage_bucket_inventory_readable',
  'storage_public_buckets_absent',
  'storage_policy_surface_empty_until_allowlisted',
]
const SAFE_CHILD_ENV_KEYS = [
  'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME', 'LANG', 'LC_ALL',
]
const SEALED_PYTHON_LAUNCH = [
  'import runpy,sys',
  'site_packages,script,*arguments=sys.argv[1:]',
  'sys.path.insert(0,site_packages)',
  'sys.argv=[script,*arguments]',
  "runpy.run_path(script,run_name='__main__')",
].join(';')
const RUNTIME_CLOSURE_LIMITS = Object.freeze({
  maximumEntries: 100_000,
  maximumFileBytes: 512 * 1024 * 1024,
  maximumTotalBytes: 4 * 1024 * 1024 * 1024,
})
const OWNER_CONSOLE_SEGMENTS = [
  { id: 'owner_branch_creation', estimateMinutes: 45, description: 'Create one empty preview branch without production data and capture ref, connection string, and CA file (docs/rehearsal-runbook.md step 2).' },
  { id: 'owner_runtime_login_and_urls', estimateMinutes: 30, description: 'Create the branch runtime login and read-only Storage-audit login, then prepare the private URL-bound approval (runbook step 4).' },
  { id: 'owner_backup_restore_evidence', estimateMinutes: 90, description: 'Capture provider backup inventory and independent restore evidence on the isolated target (runbook step 7).' },
  { id: 'owner_evidence_review', estimateMinutes: 120, description: 'Review the evidence packet against the required-evidence checklist (runbook step 8).' },
  { id: 'owner_branch_deletion', estimateMinutes: 15, description: 'Delete the preview branch after evidence capture and record the deletion receipt (runbook step 9).' },
]

function fail(code) {
  const error = new Error(code)
  error.rehearsalCode = code
  throw error
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function strictUtcTimestamp(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = ''] = match
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const millisecond = Number(fractionText.padEnd(3, '0'))
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
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

function strictUtcSecondTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null
  return strictUtcTimestamp(value.replace(/Z$/, '.000Z'))
}

function objectDigest(value) {
  return `sha256:${sha256(stableStringify(value))}`
}

function policyDigest(policy) {
  const copy = structuredClone(policy)
  delete copy.sourceDigest
  return objectDigest(copy)
}

function publicKeyFingerprint(publicKey) {
  return `sha256:${sha256(publicKey.export({ type: 'spki', format: 'der' }))}`
}

function parseAuthoritySigner(value, role) {
  if (!exactKeys(value, ['role', 'status', 'keyId', 'publicKeyPem', 'publicKeyFingerprint', 'registeredAt'])
    || value.role !== role) fail('rehearsal_authority_signer_invalid')
  if (value.status === 'unconfigured') {
    if ([value.keyId, value.publicKeyPem, value.publicKeyFingerprint, value.registeredAt].some((entry) => entry !== null)) {
      fail('rehearsal_authority_unconfigured_signer_invalid')
    }
    return null
  }
  if (value.status !== `${role}_policy_digest_pinned`
    || typeof value.keyId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/.test(value.keyId)
    || typeof value.publicKeyPem !== 'string'
    || !digestPattern.test(value.publicKeyFingerprint || '')
    || !strictUtcTimestamp(value.registeredAt)) fail('rehearsal_authority_registered_signer_invalid')
  let publicKey
  try {
    publicKey = createPublicKey(value.publicKeyPem)
  } catch {
    fail('rehearsal_authority_public_key_invalid')
  }
  const canonicalPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  if (publicKey.asymmetricKeyType !== 'ed25519'
    || value.publicKeyPem !== canonicalPublicKeyPem
    || publicKeyFingerprint(publicKey) !== value.publicKeyFingerprint) fail('rehearsal_authority_public_key_invalid')
  return { ...value, publicKey }
}

export function validateRehearsalAuthorityPolicy(policy, trustedRegisteredDigest = TRUSTED_REGISTERED_REHEARSAL_AUTHORITY_POLICY_DIGEST) {
  if (!exactKeys(policy, ['contract', 'state', 'signaturePolicy', 'signers', 'controls', 'sourceDigest'])
    || !exactKeys(policy.signaturePolicy, [
      'algorithm', 'canonicalization', 'approvalDomain', 'reviewDomain',
      'maximumApprovalValidityHours', 'distinctRoleKeysRequired',
    ])
    || !exactKeys(policy.signers, ['owner', 'independentReviewer'])
    || !exactKeys(policy.controls, [
      'executionVerificationEnabled', 'privateKeysStored', 'providerWritesAuthorized', 'registrationOwnerGated',
    ])) fail('rehearsal_authority_policy_schema_invalid')
  if (policy.contract !== PREVIEW_REHEARSAL_AUTHORITY_CONTRACT
    || !['unconfigured', 'registered'].includes(policy.state)
    || policy.signaturePolicy.algorithm !== 'Ed25519'
    || policy.signaturePolicy.canonicalization !== 'supermega.stable-json.v1'
    || policy.signaturePolicy.approvalDomain !== AUTHORITY_APPROVAL_DOMAIN.trimEnd()
    || policy.signaturePolicy.reviewDomain !== AUTHORITY_REVIEW_DOMAIN.trimEnd()
    || policy.signaturePolicy.maximumApprovalValidityHours !== WINDOW_HOURS
    || policy.signaturePolicy.distinctRoleKeysRequired !== true
    || policy.controls.privateKeysStored !== false
    || policy.controls.providerWritesAuthorized !== false
    || policy.controls.registrationOwnerGated !== true
    || policy.sourceDigest !== policyDigest(policy)) fail('rehearsal_authority_policy_invalid')
  const owner = parseAuthoritySigner(policy.signers.owner, 'owner')
  const independentReviewer = parseAuthoritySigner(policy.signers.independentReviewer, 'independent_reviewer')
  if (policy.state === 'unconfigured') {
    if (owner || independentReviewer || policy.controls.executionVerificationEnabled !== false) {
      fail('rehearsal_authority_unconfigured_state_invalid')
    }
  } else if (!owner
    || !independentReviewer
    || owner.keyId === independentReviewer.keyId
    || owner.publicKeyFingerprint === independentReviewer.publicKeyFingerprint
    || policy.controls.executionVerificationEnabled !== true
    || !digestPattern.test(trustedRegisteredDigest || '')
    || trustedRegisteredDigest !== policy.sourceDigest) {
    fail('rehearsal_authority_registered_state_not_owner_pinned')
  }
  return { policy, owner, independentReviewer }
}

function ownerApprovalPayload(approval) {
  const copy = structuredClone(approval)
  delete copy.ownerSignature
  delete copy.independentReview
  return Buffer.from(`${AUTHORITY_APPROVAL_DOMAIN}${stableStringify(copy)}`, 'utf8')
}

function ownerApprovalDigest(approval) {
  const copy = structuredClone(approval)
  delete copy.independentReview
  return objectDigest(copy)
}

function independentReviewPayload(review) {
  const copy = structuredClone(review)
  delete copy.signature
  return Buffer.from(`${AUTHORITY_REVIEW_DOMAIN}${stableStringify(copy)}`, 'utf8')
}

function verifyEd25519Signature(signature, signer, payload, code) {
  if (!exactKeys(signature, ['algorithm', 'keyId', 'value'])
    || signature.algorithm !== 'Ed25519'
    || signature.keyId !== signer?.keyId
    || typeof signature.value !== 'string') fail(code)
  let bytes
  try {
    bytes = Buffer.from(signature.value, 'base64')
  } catch {
    fail(code)
  }
  if (bytes.length !== 64
    || bytes.toString('base64') !== signature.value
    || !verifyBytes(null, payload, signer.publicKey, bytes)) fail(code)
}

function sanitizeText(value, secrets) {
  let output = String(value ?? '')
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[redacted]')
  }
  return output
}

function assertNoCredential(serialized, code) {
  const lowered = serialized.toLowerCase()
  if (LEAK_TOKENS.some((token) => lowered.includes(token))) fail(code)
}

export function parsePreviewDatabaseUrl(rawUrl, { expectedProjectRef, productionProjectRef }) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    fail('rehearsal_database_url_invalid')
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail('rehearsal_database_url_invalid')
  const parameters = [...parsed.searchParams.keys()]
  if (parameters.some((key) => key !== 'sslmode')) fail('rehearsal_connection_parameter_not_allowed')
  if (parsed.searchParams.getAll('sslmode').map((value) => value.toLowerCase()).join(',') !== 'verify-full') {
    fail('rehearsal_verify_full_required')
  }
  if (parsed.pathname.replace(/^\/+|\/+$/g, '') !== 'postgres') fail('rehearsal_database_must_be_postgres')
  const host = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username || '')
  const port = parsed.port ? Number(parsed.port) : 5432
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host)
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
  let targetRef = ''
  if (direct) {
    if (username !== 'postgres' || port !== 5432) fail('rehearsal_direct_admin_connection_required')
    targetRef = direct[1]
  } else if (pooler) {
    const poolerUser = /^postgres\.([a-z0-9]{20})$/.exec(username)
    if (!poolerUser) fail('rehearsal_pooler_admin_connection_required')
    if (port === 6543) fail('rehearsal_transaction_pooler_not_for_migrations')
    if (port !== 5432) fail('rehearsal_session_pooler_required')
    targetRef = poolerUser[1]
  } else {
    fail('rehearsal_target_not_supabase')
  }
  if (targetRef === productionProjectRef) fail('rehearsal_target_is_production')
  if (targetRef !== expectedProjectRef) fail('rehearsal_target_ref_mismatch')
  return {
    host,
    port,
    username,
    password: decodeURIComponent(parsed.password || ''),
    database: 'postgres',
  }
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function parseBoundedDatabaseUrl(rawUrl, {
  expectedProjectRef,
  productionProjectRef,
  purpose,
}) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    fail(`${purpose}_database_url_invalid`)
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail(`${purpose}_database_url_invalid`)
  if (!parsed.username || !parsed.password) fail(`${purpose}_database_url_credentials_incomplete`)
  if ([...parsed.searchParams.keys()].some((key) => key !== 'sslmode')) fail(`${purpose}_connection_parameter_not_allowed`)
  if (parsed.searchParams.getAll('sslmode').map((value) => value.toLowerCase()).join(',') !== 'verify-full') {
    fail(`${purpose}_verify_full_required`)
  }
  if (parsed.pathname.replace(/^\/+|\/+$/g, '') !== 'postgres') fail(`${purpose}_database_must_be_postgres`)

  const host = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username)
  const port = parsed.port ? Number(parsed.port) : 5432
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host)
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
  let targetRef = ''
  let loginRole = username
  if (direct) {
    if (port !== 5432) fail(`${purpose}_direct_port_invalid`)
    targetRef = direct[1]
  } else if (pooler) {
    if (![5432, 6543].includes(port)) fail(`${purpose}_pooler_port_invalid`)
    const match = /^([a-z][a-z0-9_]*)\.([a-z0-9]{20})$/.exec(username)
    if (!match) fail(`${purpose}_pooler_login_invalid`)
    loginRole = match[1]
    targetRef = match[2]
  } else {
    fail(`${purpose}_target_not_supabase`)
  }
  if (targetRef === productionProjectRef) fail('rehearsal_target_is_production')
  if (targetRef !== expectedProjectRef) fail(`${purpose}_target_ref_mismatch`)
  if (PRIVILEGED_DATABASE_ROLES.has(loginRole) || loginRole.startsWith('supabase_')) {
    fail(`${purpose}_privileged_credentials_rejected`)
  }
  if (purpose === 'runtime' && loginRole !== 'supermega_trial_runtime') {
    fail('runtime_dedicated_login_required')
  }
  if (purpose === 'storage_audit' && loginRole !== 'supermega_storage_audit') {
    fail('storage_audit_dedicated_login_required')
  }
  return {
    host,
    port,
    username,
    password: decodeURIComponent(parsed.password),
    database: 'postgres',
    loginRole,
    targetRef,
  }
}

function normalizedBranchCreationReceipt(branch, parentProjectRef, targetProjectRef) {
  const createdAt = strictUtcTimestamp(branch?.created_at)
  if (!createdAt
    || branch?.project_ref !== targetProjectRef
    || branch?.parent_project_ref !== parentProjectRef
    || typeof branch?.name !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(branch.name)
    || branch?.with_data !== false
    || branch?.persistent !== false
    || branch?.is_default !== false
    || !['ACTIVE_HEALTHY', 'FUNCTIONS_DEPLOYED'].includes(branch?.status)
    || branch?.preview_project_status !== 'ACTIVE_HEALTHY') {
    fail('rehearsal_authenticated_branch_receipt_invalid')
  }
  return validateNormalizedBranchReceipt({
    contract: 'supermega.supabase-branch-creation-receipt.v1',
    source: 'supabase-management-api-environment-read',
    providerAuthenticated: true,
    parentProjectRef,
    projectRef: targetProjectRef,
    name: branch.name,
    createdAt: createdAt.toISOString(),
    withData: false,
    persistent: false,
    isDefault: false,
    status: branch.status,
    previewProjectStatus: branch.preview_project_status,
  }, parentProjectRef, targetProjectRef)
}

function validateNormalizedBranchReceipt(receipt, parentProjectRef, targetProjectRef) {
  if (!exactKeys(receipt, [
    'contract', 'source', 'providerAuthenticated', 'parentProjectRef', 'projectRef',
    'name', 'createdAt', 'withData', 'persistent', 'isDefault', 'status', 'previewProjectStatus',
  ])
    || receipt.contract !== 'supermega.supabase-branch-creation-receipt.v1'
    || receipt.source !== 'supabase-management-api-environment-read'
    || receipt.providerAuthenticated !== true
    || receipt.parentProjectRef !== parentProjectRef
    || receipt.projectRef !== targetProjectRef
    || typeof receipt.name !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(receipt.name)
    || !strictUtcTimestamp(receipt.createdAt)
    || receipt.withData !== false
    || receipt.persistent !== false
    || receipt.isDefault !== false
    || !['ACTIVE_HEALTHY', 'FUNCTIONS_DEPLOYED'].includes(receipt.status)
    || receipt.previewProjectStatus !== 'ACTIVE_HEALTHY') {
    fail('rehearsal_authenticated_branch_receipt_invalid')
  }
  return receipt
}

async function defaultFetchBranchObservation({ parentProjectRef, targetProjectRef, token }) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    fail('rehearsal_management_read_token_invalid')
  }
  const response = await fetch(`https://api.supabase.com/v1/projects/${parentProjectRef}/branches`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) fail('rehearsal_authenticated_branch_read_failed')
  const text = await response.text()
  if (Buffer.byteLength(text) > 512 * 1024) fail('rehearsal_authenticated_branch_read_oversized')
  let branches
  try {
    branches = JSON.parse(text)
  } catch {
    fail('rehearsal_authenticated_branch_read_invalid')
  }
  const matches = Array.isArray(branches)
    ? branches.filter((branch) => branch?.project_ref === targetProjectRef)
    : []
  if (matches.length !== 1) fail('rehearsal_authenticated_branch_target_not_unique')
  return normalizedBranchCreationReceipt(matches[0], parentProjectRef, targetProjectRef)
}

function resolvePrivateJson(rootDir, rawPath, code) {
  const value = String(rawPath || '').trim()
  if (!value) fail(`${code}_missing`)
  const temporaryRoot = resolve(rootDir, '.tmp')
  const target = isAbsolute(value) ? resolve(value) : resolve(rootDir, value)
  if (dirname(target) !== temporaryRoot
    || extname(target).toLowerCase() !== '.json'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,119}\.json$/.test(basename(target))) {
    fail(`${code}_must_be_temporary_direct_child`)
  }
  let temporaryMetadata
  let targetMetadata
  try {
    temporaryMetadata = lstatSync(temporaryRoot)
    targetMetadata = lstatSync(target)
  } catch {
    fail(`${code}_invalid`)
  }
  if (!temporaryMetadata.isDirectory()
    || temporaryMetadata.isSymbolicLink()
    || !targetMetadata.isFile()
    || targetMetadata.isSymbolicLink()
    || realpathSync(temporaryRoot) !== temporaryRoot
    || dirname(realpathSync(target)) !== temporaryRoot
    || targetMetadata.size <= 0
    || targetMetadata.size > 1024 * 1024) fail(`${code}_invalid`)
  return target
}

function requirePlainDirectory(path, expectedParent, code) {
  let metadata
  let canonical
  try {
    metadata = lstatSync(path)
    canonical = realpathSync(path)
  } catch {
    fail(code)
  }
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || !sameCanonicalPath(canonical, path)
    || (expectedParent && !sameCanonicalPath(dirname(canonical), expectedParent))) fail(code)
  return canonical
}

function prepareEvidenceDirectory(rootDir, requested) {
  const temporaryRoot = resolve(rootDir, '.tmp')
  requirePlainDirectory(temporaryRoot, rootDir, 'rehearsal_temporary_root_invalid')
  const destination = requested
    ? (isAbsolute(requested) ? resolve(requested) : resolve(rootDir, requested))
    : resolve(temporaryRoot, 'preview-branch-rehearsal')
  if (dirname(destination) !== temporaryRoot
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(basename(destination))) {
    fail('rehearsal_evidence_root_must_be_temporary_direct_child')
  }
  if (!existsSync(destination)) mkdirSync(destination)
  return requirePlainDirectory(destination, temporaryRoot, 'rehearsal_evidence_root_invalid')
}

function writeExclusiveFile(path, bytes) {
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 })
  const metadata = lstatSync(path)
  if (!metadata.isFile() || metadata.isSymbolicLink() || !sameCanonicalPath(realpathSync(path), path)) {
    fail('rehearsal_sealed_file_invalid')
  }
}

function validateExecutionApproval(approval, {
  now,
  releaseCommit,
  packetDigest,
  targetProjectRef,
  productionProjectRef,
  connectionDigests,
  trust,
  policyState,
}) {
  if (!exactKeys(approval, [
    'contract', 'decision', 'approvalId', 'approvedAt', 'expiresAt',
    'releaseCommit', 'rehearsalPacketDigest', 'targetProjectRef', 'connectionDigests',
    'trust', 'branch', 'authorizedActions', 'controls', 'ownerKeyFingerprint', 'ownerSignature',
    'independentReview',
  ])) fail('rehearsal_approval_shape_invalid')
  if (approval.contract !== PREVIEW_REHEARSAL_APPROVAL_CONTRACT || approval.decision !== 'approved') {
    fail('rehearsal_approval_not_granted')
  }
  if (!uuidPattern.test(approval.approvalId || '')
    || approval.ownerKeyFingerprint !== policyState.owner?.publicKeyFingerprint) {
    fail('rehearsal_approval_identity_invalid')
  }
  const approvedAtValue = strictUtcTimestamp(approval.approvedAt)
  const expiresAtValue = strictUtcTimestamp(approval.expiresAt)
  const createdAtValue = strictUtcTimestamp(approval.branch?.createdAt)
  const deleteByValue = strictUtcTimestamp(approval.branch?.deleteBy)
  if (!approvedAtValue || !expiresAtValue || !createdAtValue || !deleteByValue) {
    fail('rehearsal_approval_timestamp_invalid')
  }
  const approvedAt = approvedAtValue.getTime()
  const expiresAt = expiresAtValue.getTime()
  const createdAt = createdAtValue.getTime()
  const deleteBy = deleteByValue.getTime()
  const currentTime = now.getTime()
  if (approvedAt > currentTime || expiresAt <= currentTime
    || createdAt > approvedAt || deleteBy <= currentTime
    || expiresAt > deleteBy
    || expiresAt - approvedAt > WINDOW_HOURS * 60 * 60 * 1000
    || deleteBy - createdAt > WINDOW_HOURS * 60 * 60 * 1000
    || Math.min(expiresAt, deleteBy) - currentTime < MINIMUM_EXECUTION_WINDOW_MINUTES * 60 * 1000) {
    fail('rehearsal_approval_expired_or_window_invalid')
  }
  if (approval.releaseCommit !== releaseCommit
    || approval.rehearsalPacketDigest !== packetDigest
    || approval.targetProjectRef !== targetProjectRef) {
    fail('rehearsal_approval_target_stale')
  }
  if (!exactKeys(approval.connectionDigests, ['administrative', 'runtime', 'storageAudit'])
    || JSON.stringify(approval.connectionDigests) !== JSON.stringify(connectionDigests)
    || !Object.values(approval.connectionDigests).every((value) => digestPattern.test(value))) {
    fail('rehearsal_approval_connections_unreviewed')
  }
  if (!exactKeys(approval.trust, ['certificateAuthorityDigest', 'executables', 'runtimeClosures', 'sources'])
    || !exactKeys(approval.trust.executables, ['node', 'git', 'python', 'psql'])
    || !Object.values(approval.trust.executables).every((entry) => exactKeys(entry, ['path', 'digest'])
      && isAbsolute(entry.path)
      && digestPattern.test(entry.digest || ''))
    || !exactKeys(approval.trust.runtimeClosures, [
      'pythonEnvironment', 'pythonBaseRuntime', 'postgresNative',
    ])
    || !Object.values(approval.trust.runtimeClosures).every(runtimeClosureSummaryValid)
    || !exactKeys(approval.trust.sources, Object.keys(TRUST_SOURCE_PATHS))
    || !Object.values(approval.trust.sources).every((value) => digestPattern.test(value || ''))
    || !digestPattern.test(approval.trust.certificateAuthorityDigest || '')
    || stableStringify(approval.trust) !== stableStringify(trust)) {
    fail('rehearsal_approval_trust_inputs_unreviewed')
  }
  if (!exactKeys(approval.branch, [
    'parentProjectRef', 'name', 'projectRef', 'createdAt', 'deleteBy', 'creationReceiptDigest',
    'cleanTargetMetadataDigest',
    'startsWithProductionData', 'maximumLifetimeHours', 'providerUsageChargesAcknowledged',
    'creationApproved', 'migrationApplicationApproved', 'deleteAfterEvidence',
  ])
    || approval.branch.parentProjectRef !== productionProjectRef
    || approval.branch.projectRef !== targetProjectRef
    || typeof approval.branch.name !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(approval.branch.name)
    || !digestPattern.test(approval.branch.creationReceiptDigest || '')
    || !digestPattern.test(approval.branch.cleanTargetMetadataDigest || '')
    || approval.branch.startsWithProductionData !== false
    || approval.branch.maximumLifetimeHours !== WINDOW_HOURS
    || approval.branch.providerUsageChargesAcknowledged !== true
    || approval.branch.creationApproved !== true
    || approval.branch.migrationApplicationApproved !== true
    || approval.branch.deleteAfterEvidence !== true) {
    fail('rehearsal_approval_branch_boundary_invalid')
  }
  if (JSON.stringify(approval.authorizedActions) !== JSON.stringify(REQUIRED_APPROVED_ACTIONS)) {
    fail('rehearsal_approval_actions_invalid')
  }
  if (!exactKeys(approval.controls, [
    'productionTargetApproved', 'productionDataApproved', 'productionMutationApproved',
    'managedActivationApproved',
  ])
    || Object.values(approval.controls).some((value) => value !== false)) {
    fail('rehearsal_approval_production_boundary_invalid')
  }
  if (approvedAt < Date.parse(policyState.owner.registeredAt)) fail('rehearsal_approval_precedes_owner_registration')
  verifyEd25519Signature(
    approval.ownerSignature,
    policyState.owner,
    ownerApprovalPayload(approval),
    'rehearsal_owner_signature_invalid',
  )
  const approvalDigest = ownerApprovalDigest(approval)
  const review = approval.independentReview
  if (!exactKeys(review, [
    'contract', 'decision', 'approvalDigest', 'reviewedAt', 'expiresAt',
    'reviewerKeyFingerprint', 'signature',
  ])) fail('rehearsal_independent_review_shape_invalid')
  const reviewedAtValue = strictUtcTimestamp(review.reviewedAt)
  const reviewExpiresAtValue = strictUtcTimestamp(review.expiresAt)
  if (review.contract !== PREVIEW_REHEARSAL_REVIEW_CONTRACT
    || review.decision !== 'accepted'
    || review.approvalDigest !== approvalDigest
    || review.reviewerKeyFingerprint !== policyState.independentReviewer?.publicKeyFingerprint
    || !reviewedAtValue
    || !reviewExpiresAtValue
    || reviewedAtValue.getTime() < approvedAt
    || reviewedAtValue.getTime() > currentTime
    || reviewExpiresAtValue.getTime() !== expiresAt
    || reviewedAtValue.getTime() < Date.parse(policyState.independentReviewer.registeredAt)) {
    fail('rehearsal_independent_review_invalid')
  }
  verifyEd25519Signature(
    review.signature,
    policyState.independentReviewer,
    independentReviewPayload(review),
    'rehearsal_independent_review_signature_invalid',
  )
  return {
    approvalIdDigest: `sha256:${sha256(approval.approvalId)}`,
    approvalDigest,
    authorityPolicyDigest: policyState.policy.sourceDigest,
    ownerKeyFingerprint: policyState.owner.publicKeyFingerprint,
    reviewerKeyFingerprint: policyState.independentReviewer.publicKeyFingerprint,
    approvedAt: approvedAtValue.toISOString(),
    reviewedAt: reviewedAtValue.toISOString(),
    expiresAt: expiresAtValue.toISOString(),
    branchCreatedAt: createdAtValue.toISOString(),
    branchDeleteBy: deleteByValue.toISOString(),
    creationReceiptDigest: approval.branch.creationReceiptDigest,
    cleanTargetMetadataDigest: approval.branch.cleanTargetMetadataDigest,
    trustDigest: objectDigest(approval.trust),
    actionDeadlineMs: Math.min(expiresAt, deleteBy),
  }
}

export function buildPlan() {
  const migrationSteps = EXPECTED_MIGRATIONS.map((name, index) => ({
    id: `apply_migration_${String(index + 1).padStart(2, '0')}`,
    kind: 'branch-mutation',
    estimateMinutes: 8,
    covers: ['ordered-migration-application-through-v10'],
    command: `recheck clean reviewed checkout; verify ${MIGRATION_DIRECTORY}/${name}; pass those exact bytes to psql --file -`,
  }))
  const steps = [
    { id: 'release_pin', kind: 'local', estimateMinutes: 1, covers: [], command: 'git status --porcelain && git rev-parse HEAD == origin/main' },
    { id: 'release_authority', kind: 'network-read', estimateMinutes: 3, covers: [], command: `verify ${PACKET_ENV}, digest-pinned owner/reviewer signatures in ${APPROVAL_ENV}, and a fresh authenticated branch receipt bind this clean origin/main commit, target, URL digests, creation time, and absolute deletion deadline` },
    { id: 'local_quarantine_guard', kind: 'local', estimateMinutes: 3, covers: ['public-browser-table-and-sequence-denial (local proof)'], command: '[signed Node] [sealed public quarantine verifier]' },
    { id: 'migration_inventory', kind: 'local', estimateMinutes: 1, covers: [], command: `verify exact packet digests for the public baseline and all eleven private migrations, plus quarantine and rollback-only probe` },
    { id: 'toolchain', kind: 'local', estimateMinutes: 1, covers: [], command: 'psql --version (major 17 required)' },
    { id: 'url_preflight', kind: 'network-read', estimateMinutes: 3, covers: ['hostname-verified-postgresql-17-preflight', 'clean-target-without-production-data'], command: `[signed Python and closure] -I -S -B [sealed launcher] [sealed database validator] --env-key ${URL_ENV} --rehearsal-preflight --expected-project-ref-env-key ${REF_ENV} --production-project-ref-env-key ${PRODUCTION_REF_ENV} --ssl-root-cert-env-key ${CA_ENV}` },
    { id: 'runtime_credential_boundary', kind: 'network-read', estimateMinutes: 3, covers: ['dedicated-unprivileged-runtime-and-storage-audit-logins'], command: `connect read-only with ${RUNTIME_URL_ENV} and ${STORAGE_AUDIT_URL_ENV}; prove exact identities, role attributes, memberships, TLS, and transaction mode without printing credentials` },
    { id: 'storage_privacy_preflight', kind: 'local', estimateMinutes: 2, covers: ['private-storage-isolation-proof (offline configuration preflight; live audit stays owner-gated)'], command: '[signed Python and closure] -I -S -B [sealed launcher] [sealed Storage privacy verifier] --preflight' },
    ...migrationSteps,
    { id: 'apply_quarantine', kind: 'branch-mutation', estimateMinutes: 10, covers: ['public-browser-table-and-sequence-denial', 'public-default-privilege-denial-for-postgres-and-supabase-admin', 'service-role-contact-path-retained'], command: `recheck clean reviewed checkout; verify ${QUARANTINE_PATH}; pass those exact bytes to psql --file -` },
    { id: 'storage_audit_postmigration_boundary', kind: 'network-read', estimateMinutes: 3, covers: ['storage-audit-credential-remains-without-persistent-write-authority'], command: `recheck ${STORAGE_AUDIT_URL_ENV} role attributes, membership paths, ownership, default ACLs, and effective write privileges after DDL` },
    { id: 'hosted_validator', kind: 'network-read', estimateMinutes: 10, covers: ['read-only-v10-runtime-validator'], command: `[signed Python and closure] -I -S -B [sealed launcher] [sealed database validator] --env-key ${RUNTIME_URL_ENV} --storage-audit-env-key ${STORAGE_AUDIT_URL_ENV} --ensure-schema --require-ready` },
    { id: 'session_revocation_probe', kind: 'network-read', estimateMinutes: 5, covers: ['active-session-acceptance-and-revoked-session-denial'], command: `recheck clean reviewed checkout; verify ${PROBE_PATH}; pass exact bytes to psql --file - (single transaction, ends in ROLLBACK)` },
    { id: 'evidence_packet', kind: 'local', estimateMinutes: 2, covers: [], command: 'assemble sanitized evidence packet under .tmp/' },
  ]
  const toolMinutes = steps.reduce((total, step) => total + step.estimateMinutes, 0)
  const ownerMinutes = OWNER_CONSOLE_SEGMENTS.reduce((total, segment) => total + segment.estimateMinutes, 0)
  const plannedMinutes = toolMinutes + ownerMinutes
  return {
    contract: PREVIEW_REHEARSAL_CONTRACT,
    windowHours: WINDOW_HOURS,
    steps,
    ownerConsoleSegments: OWNER_CONSOLE_SEGMENTS,
    totals: {
      toolMinutes,
      ownerConsoleMinutes: ownerMinutes,
      plannedMinutes,
      windowMinutes: WINDOW_HOURS * 60,
      bufferMinutes: WINDOW_HOURS * 60 - plannedMinutes,
    },
  }
}

function safeChildEnvironment(source) {
  const output = {}
  for (const key of SAFE_CHILD_ENV_KEYS) {
    if (typeof source?.[key] === 'string' && source[key]) output[key] = source[key]
  }
  return output
}

function sameCanonicalPath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value
  return normalize(resolve(left)) === normalize(resolve(right))
}

function readBoundedRegularFile(path, maximumBytes, code, { allowEmpty = false } = {}) {
  const absolute = resolve(path)
  let before
  let canonical
  let descriptor
  try {
    before = lstatSync(absolute)
    canonical = realpathSync(absolute)
    descriptor = openSync(absolute, 'r')
  } catch {
    fail(code)
  }
  if (!before.isFile()
    || before.isSymbolicLink()
    || !sameCanonicalPath(canonical, absolute)
    || (!allowEmpty && before.size <= 0)
    || before.size > maximumBytes) {
    if (descriptor !== undefined) closeSync(descriptor)
    fail(code)
  }
  let bytes
  let descriptorMetadata
  try {
    descriptorMetadata = fstatSync(descriptor)
    if (!descriptorMetadata.isFile()
      || descriptorMetadata.size !== before.size
      || descriptorMetadata.dev !== before.dev
      || descriptorMetadata.ino !== before.ino) fail(code)
    bytes = readFileSync(descriptor)
  } catch {
    closeSync(descriptor)
    fail(code)
  } finally {
    try { closeSync(descriptor) } catch { /* already closed on failure */ }
  }
  let after
  try { after = lstatSync(absolute) } catch { fail(code) }
  if (!after.isFile()
    || after.isSymbolicLink()
    || after.size !== bytes.length
    || after.size !== before.size
    || after.dev !== before.dev
    || after.ino !== before.ino
    || after.mtimeMs !== before.mtimeMs
    || !sameCanonicalPath(realpathSync(absolute), canonical)) fail(code)
  return { path: canonical, bytes, digest: `sha256:${sha256(bytes)}` }
}

function collectDirectoryClosure(rootPath, code) {
  const canonicalRoot = requirePlainDirectory(resolve(rootPath), undefined, code)
  const records = []
  let fileCount = 0
  let directoryCount = 0
  let totalBytes = 0

  const visit = (directory) => {
    const before = lstatSync(directory)
    if (!before.isDirectory()
      || before.isSymbolicLink()
      || !sameCanonicalPath(realpathSync(directory), directory)) fail(code)
    const names = readdirSync(directory).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    for (const name of names) {
      const child = join(directory, name)
      const childRelative = relative(canonicalRoot, child).replaceAll('\\', '/')
      if (!childRelative
        || childRelative === '..'
        || childRelative.startsWith('../')
        || isAbsolute(childRelative)) fail(code)
      let metadata
      try { metadata = lstatSync(child) } catch { fail(code) }
      if (metadata.isSymbolicLink()) fail(code)
      if (metadata.isDirectory()) {
        directoryCount += 1
        if (fileCount + directoryCount > RUNTIME_CLOSURE_LIMITS.maximumEntries) fail(code)
        records.push({ path: childRelative, type: 'directory' })
        visit(child)
        continue
      }
      if (!metadata.isFile()) fail(code)
      const file = readBoundedRegularFile(
        child,
        RUNTIME_CLOSURE_LIMITS.maximumFileBytes,
        code,
        { allowEmpty: true },
      )
      fileCount += 1
      totalBytes += file.bytes.length
      if (fileCount + directoryCount > RUNTIME_CLOSURE_LIMITS.maximumEntries
        || totalBytes > RUNTIME_CLOSURE_LIMITS.maximumTotalBytes) fail(code)
      records.push({
        path: childRelative,
        type: 'file',
        size: file.bytes.length,
        digest: file.digest,
      })
    }
    const after = lstatSync(directory)
    if (!after.isDirectory()
      || after.isSymbolicLink()
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.mtimeMs !== before.mtimeMs
      || !sameCanonicalPath(realpathSync(directory), directory)) fail(code)
  }
  visit(canonicalRoot)
  if (fileCount === 0) fail(code)
  return {
    path: canonicalRoot,
    digest: objectDigest({ contract: 'supermega.runtime-directory-closure.v1', records }),
    fileCount,
    directoryCount,
    totalBytes,
  }
}

function parsePythonBaseRuntime(pythonEnvironmentRoot) {
  const configuration = readBoundedRegularFile(
    join(pythonEnvironmentRoot, 'pyvenv.cfg'),
    64 * 1024,
    'python_virtual_environment_configuration_invalid',
  ).bytes.toString('utf8')
  const homes = configuration.split(/\r?\n/)
    .map((line) => /^\s*home\s*=\s*(.+?)\s*$/i.exec(line)?.[1])
    .filter(Boolean)
  if (homes.length !== 1 || !isAbsolute(homes[0])) fail('python_virtual_environment_configuration_invalid')
  return requirePlainDirectory(resolve(homes[0]), undefined, 'python_base_runtime_invalid')
}

function resolvePythonSitePackages(pythonEnvironmentRoot) {
  const candidates = [join(pythonEnvironmentRoot, 'Lib', 'site-packages')]
  const libraryRoot = join(pythonEnvironmentRoot, 'lib')
  if (existsSync(libraryRoot)) {
    requirePlainDirectory(libraryRoot, pythonEnvironmentRoot, 'python_site_packages_invalid')
    for (const name of readdirSync(libraryRoot).sort()) {
      if (/^python\d+(?:\.\d+)?$/i.test(name)) {
        candidates.push(join(libraryRoot, name, 'site-packages'))
      }
    }
  }
  const existing = candidates.filter((candidate) => existsSync(candidate))
  if (existing.length !== 1) fail('python_site_packages_invalid')
  return requirePlainDirectory(existing[0], dirname(existing[0]), 'python_site_packages_invalid')
}

function runtimeClosureSummaryValid(value) {
  return exactKeys(value, ['path', 'digest', 'fileCount', 'directoryCount', 'totalBytes'])
    && isAbsolute(value.path)
    && digestPattern.test(value.digest || '')
    && Number.isInteger(value.fileCount) && value.fileCount > 0
    && Number.isInteger(value.directoryCount) && value.directoryCount >= 0
    && Number.isInteger(value.totalBytes) && value.totalBytes >= 0
}

function resolveExecutable(path, allowedBasenames, code) {
  const value = String(path || '').trim()
  if (!isAbsolute(value)) fail(code)
  const file = readBoundedRegularFile(value, 256 * 1024 * 1024, code)
  if (!allowedBasenames.includes(basename(file.path).toLowerCase())) fail(code)
  return file
}

function resolveTrustedInputs({ env, rootDir, caFile }) {
  const psqlName = process.platform === 'win32' ? 'psql.exe' : 'psql'
  const postgresBin = String(env[POSTGRES_BIN_ENV] || '').trim()
  if (!isAbsolute(postgresBin)) fail('postgres17_bin_absolute_path_required')
  const certificateAuthority = readBoundedRegularFile(caFile, 256 * 1024, 'rehearsal_ssl_root_certificate_invalid')
  const executables = {
    node: resolveExecutable(process.execPath, ['node', 'node.exe'], 'node_executable_invalid'),
    git: resolveExecutable(env[GIT_BIN_ENV], ['git', 'git.exe'], 'git_executable_invalid'),
    python: resolveExecutable(
      env[PYTHON_BIN_ENV],
      ['python', 'python.exe', 'python3', 'python3.exe'],
      'python_executable_invalid',
    ),
    psql: resolveExecutable(join(postgresBin, psqlName), [psqlName], 'psql_executable_invalid'),
  }
  const pythonExecutableDirectory = dirname(executables.python.path)
  if (!['bin', 'scripts'].includes(basename(pythonExecutableDirectory).toLowerCase())) {
    fail('python_virtual_environment_required')
  }
  const pythonEnvironmentRoot = requirePlainDirectory(
    dirname(pythonExecutableDirectory),
    undefined,
    'python_virtual_environment_invalid',
  )
  const pythonBaseRuntimeRoot = parsePythonBaseRuntime(pythonEnvironmentRoot)
  const pythonSitePackages = resolvePythonSitePackages(pythonEnvironmentRoot)
  const runtimeClosures = {
    pythonEnvironment: collectDirectoryClosure(
      pythonEnvironmentRoot,
      'python_virtual_environment_closure_invalid',
    ),
    pythonBaseRuntime: collectDirectoryClosure(
      pythonBaseRuntimeRoot,
      'python_base_runtime_closure_invalid',
    ),
    postgresNative: collectDirectoryClosure(
      dirname(executables.psql.path),
      'postgres_native_runtime_closure_invalid',
    ),
  }
  const sources = Object.fromEntries(Object.entries(TRUST_SOURCE_PATHS).map(([name, path]) => [
    name,
    readBoundedRegularFile(resolve(rootDir, path), 4 * 1024 * 1024, `trusted_source_${name}_invalid`),
  ]))
  const approvalTrust = {
    certificateAuthorityDigest: certificateAuthority.digest,
    executables: Object.fromEntries(Object.entries(executables).map(([name, file]) => [
      name,
      { path: file.path, digest: file.digest },
    ])),
    runtimeClosures,
    sources: Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, file.digest])),
  }
  return {
    certificateAuthority,
    executables,
    pythonSitePackages,
    runtimeClosures,
    sources,
    approvalTrust,
  }
}

export function captureExecutionTrust({ env = process.env, rootDir = root } = {}) {
  const caFile = String(env[CA_ENV] || '').trim()
  if (!caFile || !isAbsolute(caFile)) fail('rehearsal_ssl_root_certificate_absolute_path_required')
  const trustedInputs = resolveTrustedInputs({ env, rootDir, caFile })
  return {
    ok: true,
    contract: 'supermega.preview-rehearsal-execution-trust.v1',
    trust: trustedInputs.approvalTrust,
    networkRequestsPerformed: 0,
    childProcessesSpawned: 0,
    credentialValuesRead: false,
    providerWritesPerformed: 0,
  }
}

function assertExecutableCurrent(file, code) {
  const current = readBoundedRegularFile(file.path, 256 * 1024 * 1024, code)
  if (current.digest !== file.digest) fail(code)
}

function assertRuntimeClosureCurrent(closure, code) {
  const current = collectDirectoryClosure(closure.path, code)
  if (stableStringify(current) !== stableStringify(closure)) fail(code)
}

function assertExecutableRuntimeCurrent(trustedInputs, executable, code) {
  assertExecutableCurrent(executable, code)
  if (sameCanonicalPath(executable.path, trustedInputs.executables.python.path)) {
    assertRuntimeClosureCurrent(trustedInputs.runtimeClosures.pythonEnvironment, code)
    assertRuntimeClosureCurrent(trustedInputs.runtimeClosures.pythonBaseRuntime, code)
  }
  if (sameCanonicalPath(executable.path, trustedInputs.executables.psql.path)) {
    assertRuntimeClosureCurrent(trustedInputs.runtimeClosures.postgresNative, code)
  }
}

function sealedPythonArgv(trustedInputs, script, args = []) {
  return [
    trustedInputs.executables.python.path,
    '-I', '-S', '-B', '-c', SEALED_PYTHON_LAUNCH,
    trustedInputs.pythonSitePackages,
    script,
    ...args,
  ]
}

function defaultExec({ argv, envOverrides, cwd, timeoutMs, input, baseEnv }) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env: { ...safeChildEnvironment(baseEnv ?? process.env), ...envOverrides },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
    input,
    shell: false,
  })
  if (result.error) {
    return { status: 127, stdout: '', stderr: String(result.error.message || 'spawn_failed') }
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function lastJsonLine(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // keep scanning earlier lines
    }
  }
  return null
}

function parseSingleJson(stdout, code) {
  const text = String(stdout ?? '').trim()
  if (!text || Buffer.byteLength(text, 'utf8') > 16 * 1024 * 1024) fail(code)
  try {
    return JSON.parse(text)
  } catch {
    fail(code)
  }
}

function assertNoSecretOccurrence(value, secrets, code) {
  const text = String(value ?? '')
  if (secrets.some((secret) => secret && text.includes(secret))) fail(code)
}

function validateCleanTargetReport(report, approvalMetadataDigest, expectedProjectRef) {
  const metadataInventory = report?.metadata_inventory
  if (!exactKeys(report, [
    'ok', 'ready', 'status', 'contract', 'connection_mode', 'target_project_ref',
    'tls_mode', 'checks', 'failed_checks', 'metadata_inventory', 'metadata_fingerprint_digest',
    'mutation_statements_executed', 'secret_values_exposed', 'production_mutated',
    'supabase_mutated', 'vercel_mutated',
  ])
    || report.ok !== true
    || report.ready !== true
    || report.status !== 'clean_target'
    || report.contract !== 'supermega_supabase_rehearsal_preflight_v1'
    || !['direct', 'session_pooler'].includes(report.connection_mode)
    || report.target_project_ref !== expectedProjectRef
    || report.tls_mode !== 'verify-full'
    || !exactKeys(report.checks, REQUIRED_CLEAN_TARGET_CHECKS)
    || REQUIRED_CLEAN_TARGET_CHECKS.some((check) => report.checks[check] !== true)
    || !Array.isArray(report.failed_checks)
    || report.failed_checks.length !== 0
    || !exactKeys(metadataInventory, CLEAN_TARGET_METADATA_KEYS)
    || Object.values(metadataInventory).some((value) => !Array.isArray(value))
    || metadataInventory.event_triggers.length !== 0
    || metadataInventory.routines.some((entry) => Array.isArray(entry) && entry[0] === 'public')
    || objectDigest(metadataInventory) !== report.metadata_fingerprint_digest
    || report.metadata_fingerprint_digest !== approvalMetadataDigest
    || report.mutation_statements_executed !== 0
    || report.secret_values_exposed !== false
    || report.production_mutated !== false
    || report.supabase_mutated !== false
    || report.vercel_mutated !== false) fail('rehearsal_clean_target_required')
  return report
}

function validateHostedValidatorReport(report) {
  const evidence = report?.evidence
  if (!exactKeys(report, [
    'ok', 'ready', 'status', 'contract', 'checks', 'failed_checks', 'evidence',
    'mutation_statements_executed', 'secret_values_exposed',
  ])
    || report.ok !== true
    || report.ready !== true
    || report.status !== 'ready'
    || report.contract !== 'supermega_private_trial_database_v10'
    || !exactKeys(report.checks, HOSTED_READY_CHECKS)
    || HOSTED_READY_CHECKS.some((check) => report.checks[check] !== true)
    || !Array.isArray(report.failed_checks)
    || report.failed_checks.length !== 0
    || report.mutation_statements_executed !== 0
    || report.secret_values_exposed !== false
    || !exactKeys(evidence, [
      'engine', 'schema', 'role', 'tables', 'rls', 'grant', 'policies',
      'hardening_constraints', 'triggers', 'indexes', 'storage',
    ])
    || !exactKeys(evidence.engine, ['postgres_major', 'installed_extensions', 'unsupported_extensions'])
    || evidence.engine.postgres_major !== 17
    || !Array.isArray(evidence.engine.installed_extensions)
    || !Array.isArray(evidence.engine.unsupported_extensions)
    || evidence.engine.unsupported_extensions.length !== 0
    || !exactKeys(evidence.schema, ['name', 'component', 'version'])
    || evidence.schema.name !== 'app_private'
    || evidence.schema.version !== 10
    || !exactKeys(evidence.role, ['backend_group', 'dedicated_login_verified', 'settings_entries'])
    || evidence.role.backend_group !== 'supermega_trial_backend'
    || evidence.role.dedicated_login_verified !== true
    || evidence.role.settings_entries !== 0
    || !Array.isArray(evidence.tables)
    || !exactKeys(evidence.rls, ['metadata_table', 'forced_tables', 'required_tables'])
    || !exactKeys(evidence.rls.metadata_table, ['enabled', 'forced'])
    || evidence.rls.metadata_table.enabled !== true
    || !Array.isArray(evidence.rls.forced_tables)
    || !Array.isArray(evidence.rls.required_tables)
    || !exactKeys(evidence.grant, ['runtime_acl_entries', 'expected_runtime_acl_entries', 'default_acl_entries'])
    || evidence.grant.runtime_acl_entries !== evidence.grant.expected_runtime_acl_entries
    || evidence.grant.default_acl_entries !== 0
    || !Array.isArray(evidence.policies)
    || !Array.isArray(evidence.hardening_constraints)
    || !Array.isArray(evidence.triggers)
    || !Array.isArray(evidence.indexes)
    || !exactKeys(evidence.storage, [
      'baseline', 'tables', 'audit_connection_read_only_encrypted',
      'bucket_inventory_readable', 'bucket_count', 'public_bucket_count', 'policy_count',
    ])
    || !Array.isArray(evidence.storage.tables)
    || evidence.storage.audit_connection_read_only_encrypted !== true
    || evidence.storage.bucket_inventory_readable !== true
    || evidence.storage.public_bucket_count !== 0
    || evidence.storage.policy_count !== 0) fail('hosted_validator_report_invalid')
  return report
}

function validateStoragePreflightReport(report) {
  const evidenceKeys = [
    'contract', 'mode', 'adapter', 'target_host_digest', 'bucket_digest',
    'owner_approval_digest', 'captured_at', 'tenant_identity_count',
    'credential_shapes_validated_locally', 'provider_credentials_verified',
    'maximum_live_requests', 'signed_url_ttl_seconds', 'network_requests_performed',
    'persistent_mutations_performed', 'secrets_exposed', 'bucket_or_object_names_exposed',
  ]
  if (!exactKeys(report, ['ok', ...evidenceKeys, 'evidence_digest'])
    || report.ok !== true
    || report.contract !== 'supermega.private-storage-privacy.v1'
    || report.mode !== 'offline_configuration_preflight'
    || report.adapter !== 'supabase_storage_rest_v2'
    || !digestPattern.test(report.target_host_digest || '')
    || !digestPattern.test(report.bucket_digest || '')
    || !digestPattern.test(report.owner_approval_digest || '')
    || report.tenant_identity_count !== 2
    || report.credential_shapes_validated_locally !== true
    || report.provider_credentials_verified !== false
    || report.maximum_live_requests !== 6
    || report.signed_url_ttl_seconds !== 60
    || report.network_requests_performed !== 0
    || report.persistent_mutations_performed !== 0
    || report.secrets_exposed !== false
    || report.bucket_or_object_names_exposed !== false
    || !strictUtcSecondTimestamp(report.captured_at)
    || !digestPattern.test(report.evidence_digest || '')
    || report.evidence_digest !== objectDigest(Object.fromEntries(evidenceKeys.map((key) => [key, report[key]])))) {
    fail('storage_privacy_preflight_report_invalid')
  }
  return report
}

function validateLocalQuarantineReport(report, packet, inventory) {
  if (!exactKeys(report, [
    'ok', 'contract', 'sourceAuditDigest', 'sqlDigest', 'tables', 'sequences',
    'browserRolesDenied', 'serviceRolePreserved', 'idempotent',
    'schemaDriftRejected', 'productionMutated',
  ])
    || report.ok !== true
    || report.contract !== 'supermega.public-browser-quarantine.v1'
    || report.sourceAuditDigest !== packet.release.browserQuarantine.sourceAudit.evidenceDigest
    || report.sqlDigest !== inventory[QUARANTINE_PATH]
    || report.tables !== packet.release.browserQuarantine.sourceAudit.publicTableCount
    || report.sequences !== packet.release.browserQuarantine.sourceAudit.publicSequenceCount
    || JSON.stringify(report.browserRolesDenied) !== JSON.stringify(['anon', 'authenticated'])
    || report.serviceRolePreserved !== true
    || report.idempotent !== true
    || report.schemaDriftRejected !== true
    || report.productionMutated !== false) fail('local_quarantine_guard_report_invalid')
  return report
}

function verifyPsql(psqlFile, exec, rootDir, timeoutMs) {
  assertExecutableCurrent(psqlFile, 'psql_executable_changed')
  const result = exec({
    stepId: 'toolchain',
    argv: [psqlFile.path, '--version'],
    envOverrides: {},
    cwd: rootDir,
    timeoutMs,
  })
  if (result.status !== 0) fail('psql_unavailable')
  const match = /\s(\d+)(?:\.\d+)?/.exec(result.stdout || '')
  if (!match || Number(match[1]) !== 17) fail('psql_major_17_required')
  assertExecutableCurrent(psqlFile, 'psql_executable_changed')
  return { psql: psqlFile.path, versionOutput: String(result.stdout || '').trim() }
}

function psqlEnv(connection, caFile) {
  return {
    PGHOST: connection.host,
    PGPORT: String(connection.port),
    PGUSER: connection.username,
    PGPASSWORD: connection.password,
    PGDATABASE: connection.database,
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: caFile,
    PGCONNECT_TIMEOUT: '30',
  }
}

const CREDENTIAL_PREFLIGHT_SQL = `begin read only;
with recursive login_role as (
  select * from pg_roles where rolname = current_user
), role_membership(roleid) as (
  select membership.roleid
  from pg_auth_members membership
  join login_role on login_role.oid = membership.member
  union
  select membership.roleid
  from pg_auth_members membership
  join role_membership parent on parent.roleid = membership.member
), elevated as (
  select * from pg_roles
  where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
     or rolname in (
       'postgres', 'supabase_admin', 'service_role', 'authenticator',
       'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
       'pg_read_server_files', 'pg_write_server_files'
     )
)
select json_build_object(
  'contract', 'supermega.preview-rehearsal-credential-preflight.v1',
  'loginRole', current_user,
  'sessionRoleStable', current_user = session_user,
  'probeTransactionReadOnly', current_setting('transaction_read_only') = 'on',
  'tlsActive', coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false),
  'canLogin', coalesce((select rolcanlogin from login_role), false),
  'noSuperuser', coalesce((select not rolsuper from login_role), false),
  'noBypassRls', coalesce((select not rolbypassrls from login_role), false),
  'noCreateRole', coalesce((select not rolcreaterole from login_role), false),
  'noCreateDb', coalesce((select not rolcreatedb from login_role), false),
  'noReplication', coalesce((select not rolreplication from login_role), false),
  'noRoleMemberships', not exists (select 1 from role_membership),
  'noElevatedMembershipPath', not exists (
    select 1
    from role_membership
    join elevated on elevated.oid = role_membership.roleid
  ),
  'noDatabaseCreatePrivilege', not has_database_privilege(current_user, current_database(), 'CREATE'),
  'noSchemaCreatePrivilege', not exists (
    select 1
    from pg_namespace schema_record
    where schema_record.nspname !~ '^pg_(catalog|toast|temp|toasted|internal)'
      and schema_record.nspname <> 'information_schema'
      and has_schema_privilege(current_user, schema_record.oid, 'CREATE')
  ),
  'noTableWritePrivilege', not exists (
    select 1
    from pg_class relation_record
    join pg_namespace schema_record on schema_record.oid = relation_record.relnamespace
    where relation_record.relkind in ('r', 'p', 'v', 'm', 'f')
      and schema_record.nspname !~ '^pg_(catalog|toast|temp|toasted|internal)'
      and schema_record.nspname <> 'information_schema'
      and (
        has_table_privilege(current_user, relation_record.oid, 'INSERT')
        or has_table_privilege(current_user, relation_record.oid, 'UPDATE')
        or has_table_privilege(current_user, relation_record.oid, 'DELETE')
        or has_table_privilege(current_user, relation_record.oid, 'TRUNCATE')
        or has_table_privilege(current_user, relation_record.oid, 'REFERENCES')
        or has_table_privilege(current_user, relation_record.oid, 'TRIGGER')
        or has_table_privilege(current_user, relation_record.oid, 'MAINTAIN')
        or has_any_column_privilege(current_user, relation_record.oid, 'INSERT')
        or has_any_column_privilege(current_user, relation_record.oid, 'UPDATE')
        or has_any_column_privilege(current_user, relation_record.oid, 'REFERENCES')
      )
  ),
  'noSequenceMutationPrivilege', not exists (
    select 1
    from pg_class sequence_record
    join pg_namespace schema_record on schema_record.oid = sequence_record.relnamespace
    where sequence_record.relkind = 'S'
      and schema_record.nspname !~ '^pg_(catalog|toast|temp|toasted|internal)'
      and schema_record.nspname <> 'information_schema'
      and (
        has_sequence_privilege(current_user, sequence_record.oid, 'USAGE')
        or has_sequence_privilege(current_user, sequence_record.oid, 'UPDATE')
      )
  ),
  'noLargeObjectWritePrivilege', not exists (
    select 1
    from pg_largeobject_metadata large_object
    where has_largeobject_privilege(current_user, large_object.oid, 'UPDATE')
  ),
  'noLargeObjectCreationPrivilege', not (
    has_function_privilege(current_user, 'pg_catalog.lo_create(oid)', 'EXECUTE')
    or has_function_privilege(current_user, 'pg_catalog.lo_import(text)', 'EXECUTE')
    or has_function_privilege(current_user, 'pg_catalog.lo_import(text,oid)', 'EXECUTE')
    or has_function_privilege(current_user, 'pg_catalog.lo_from_bytea(oid,bytea)', 'EXECUTE')
  ),
  'noSecurityDefinerExecutePrivilege', not exists (
    select 1
    from pg_proc function_record
    join pg_namespace schema_record on schema_record.oid = function_record.pronamespace
    where function_record.prosecdef
      and schema_record.nspname !~ '^pg_(catalog|toast|temp|toasted|internal)'
      and schema_record.nspname <> 'information_schema'
      and has_function_privilege(current_user, function_record.oid, 'EXECUTE')
  ),
  'noObjectOwnership', not exists (
    select 1
    from login_role
    join pg_shdepend dependency
      on dependency.refclassid = 'pg_authid'::regclass
     and dependency.refobjid = login_role.oid
     and dependency.deptype = 'o'
  ),
  'noDefaultWritePrivileges', not exists (
    select 1
    from pg_default_acl default_acl
    cross join login_role
    cross join lateral aclexplode(coalesce(
      default_acl.defaclacl,
      acldefault(default_acl.defaclobjtype, default_acl.defaclrole)
    )) privilege
    where privilege.grantee in (0, login_role.oid)
      and (
        (default_acl.defaclobjtype = 'r' and privilege.privilege_type in (
          'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
        ))
        or (default_acl.defaclobjtype = 'S' and privilege.privilege_type in ('USAGE', 'UPDATE'))
        or (default_acl.defaclobjtype = 'n' and privilege.privilege_type = 'CREATE')
      )
  ),
  'noRoleSettings', not exists (
    select 1
    from login_role
    join pg_db_role_setting role_setting on role_setting.setrole = login_role.oid
  )
)::text;
rollback;`

function validateCredentialPreflightReport(report, expectedRole, purpose) {
  if (!exactKeys(report, [
    'contract', 'loginRole', 'sessionRoleStable', 'probeTransactionReadOnly', 'tlsActive',
    'canLogin', 'noSuperuser', 'noBypassRls', 'noCreateRole', 'noCreateDb',
    'noReplication', 'noRoleMemberships', 'noElevatedMembershipPath',
    'noDatabaseCreatePrivilege', 'noSchemaCreatePrivilege', 'noTableWritePrivilege',
    'noSequenceMutationPrivilege', 'noLargeObjectWritePrivilege', 'noLargeObjectCreationPrivilege',
    'noSecurityDefinerExecutePrivilege',
    'noObjectOwnership', 'noDefaultWritePrivileges', 'noRoleSettings',
  ])
    || report.contract !== 'supermega.preview-rehearsal-credential-preflight.v1'
    || report.loginRole !== expectedRole
    || Object.entries(report).some(([key, value]) => key !== 'contract' && key !== 'loginRole' && value !== true)) {
    fail(`${purpose}_privileged_credentials_rejected`)
  }
  return {
    loginRole: report.loginRole,
    sessionRoleStable: true,
    probeTransactionReadOnly: true,
    tlsActive: true,
    canLogin: true,
    noSuperuser: true,
    noBypassRls: true,
    noCreateRole: true,
    noCreateDb: true,
    noReplication: true,
    noRoleMemberships: true,
    noElevatedMembershipPath: true,
    noDatabaseCreatePrivilege: true,
    noSchemaCreatePrivilege: true,
    noTableWritePrivilege: true,
    noSequenceMutationPrivilege: true,
    noLargeObjectWritePrivilege: true,
    noLargeObjectCreationPrivilege: true,
    noSecurityDefinerExecutePrivilege: true,
    noObjectOwnership: true,
    noDefaultWritePrivileges: true,
    noRoleSettings: true,
  }
}

async function runRehearsalWithAuthority({
  argv = [],
  env = process.env,
  exec = defaultExec,
  rootDir = root,
  evidenceRoot = '',
  now = () => new Date(),
  log = (line) => process.stdout.write(`${line}\n`),
  readFile = (path) => readFileSync(path, 'utf8'),
} = {}, {
  authorityPolicy = null,
  trustedRegisteredAuthorityDigest = TRUSTED_REGISTERED_REHEARSAL_AUTHORITY_POLICY_DIGEST,
  fetchBranchObservation = defaultFetchBranchObservation,
} = {}) {
  const flags = new Set(argv)
  for (const flag of flags) {
    if (!['--dry-run', '--self-test', '--capture-branch-receipt'].includes(flag)) fail('rehearsal_arguments_invalid')
  }
  const childBaseEnv = safeChildEnvironment(env)
  const invoke = (call) => exec({ ...call, baseEnv: childBaseEnv })

  if (flags.has('--capture-branch-receipt')) {
    if (flags.size !== 1) fail('rehearsal_arguments_invalid')
    const manifest = JSON.parse(readFile(resolve(rootDir, 'package.json')))
    const parentProjectRef = String(manifest?.supermega?.productionSupabaseProjectRef || '')
    const targetProjectRef = String(env[REF_ENV] || '').trim().toLowerCase()
    if (!projectRefPattern.test(parentProjectRef) || !projectRefPattern.test(targetProjectRef)
      || targetProjectRef === parentProjectRef) fail('rehearsal_branch_receipt_target_invalid')
    const receipt = validateNormalizedBranchReceipt(await fetchBranchObservation({
      parentProjectRef,
      targetProjectRef,
      token: String(env[MANAGEMENT_TOKEN_ENV] || ''),
    }), parentProjectRef, targetProjectRef)
    const report = {
      ok: true,
      mode: 'authenticated-branch-receipt',
      receipt,
      receiptDigest: objectDigest(receipt),
      providerReadsPerformed: 1,
      providerWritesPerformed: 0,
      credentialValuesIncluded: false,
    }
    log(JSON.stringify(report, null, 2))
    return { ...report, exitCode: 0 }
  }

  if (flags.has('--dry-run')) {
    const plan = buildPlan()
    if (plan.totals.bufferMinutes <= 0) fail('rehearsal_plan_exceeds_window')
    log(JSON.stringify({ ok: true, mode: 'dry-run', ...plan }, null, 2))
    return { ok: true, mode: 'dry-run', plan, exitCode: 0 }
  }

  const databaseUrl = String(env[URL_ENV] || '').trim()
  if (!databaseUrl) {
    const report = {
      ok: true,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'rehearsal_target_not_configured',
      stepsExecuted: 0,
      externalActionsPerformed: 0,
      productionMutated: false,
      hint: `Set ${URL_ENV} to the owner-reviewed preview-branch connection string (docs/rehearsal-runbook.md step 4) or use --dry-run to inspect the plan.`,
    }
    log(JSON.stringify(report))
    return { ...report, exitCode: 0 }
  }

  const stepResults = []
  let runRoot = ''
  try {
  const expectedProjectRef = String(env[REF_ENV] || '').trim().toLowerCase()
  if (!projectRefPattern.test(expectedProjectRef)) fail('rehearsal_expected_project_ref_invalid')
  const caFile = String(env[CA_ENV] || '').trim()
  if (!caFile) fail('rehearsal_ssl_root_certificate_missing')
  const policy = authorityPolicy ?? JSON.parse(readFile(resolve(rootDir, AUTHORITY_PATH)))
  const policyState = validateRehearsalAuthorityPolicy(policy, trustedRegisteredAuthorityDigest)
  if (policy.state !== 'registered') fail('rehearsal_signing_authority_unconfigured')
  const trustedInputs = resolveTrustedInputs({ env, rootDir, caFile })
  const manifest = JSON.parse(trustedInputs.sources.packageManifest.bytes.toString('utf8'))
  const productionProjectRef = String(manifest?.supermega?.productionSupabaseProjectRef || '')
  if (!projectRefPattern.test(productionProjectRef)) fail('rehearsal_production_ref_unconfigured')
  if (manifest?.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') fail('rehearsal_production_guard_invalid')
  if (expectedProjectRef === productionProjectRef) fail('rehearsal_target_is_production')

  const connection = parsePreviewDatabaseUrl(databaseUrl, { expectedProjectRef, productionProjectRef })
  const runtimeUrl = String(env[RUNTIME_URL_ENV] || '').trim()
  const storageAuditUrl = String(env[STORAGE_AUDIT_URL_ENV] || '').trim()
  if (!runtimeUrl || !storageAuditUrl) fail('hosted_validator_environment_missing')
  const runtimeConnection = parseBoundedDatabaseUrl(runtimeUrl, {
    expectedProjectRef,
    productionProjectRef,
    purpose: 'runtime',
  })
  const storageAuditConnection = parseBoundedDatabaseUrl(storageAuditUrl, {
    expectedProjectRef,
    productionProjectRef,
    purpose: 'storage_audit',
  })
  if (runtimeConnection.loginRole === storageAuditConnection.loginRole) fail('storage_audit_distinct_login_required')
  const missingStoragePrivacy = STORAGE_PRIVACY_ENV.filter((key) => !String(env[key] || '').trim())
  if (missingStoragePrivacy.length) fail('storage_privacy_environment_missing')
  const managementToken = String(env[MANAGEMENT_TOKEN_ENV] || '').trim()
  const secrets = [
    databaseUrl,
    connection.password,
    runtimeUrl,
    runtimeConnection.password,
    storageAuditUrl,
    storageAuditConnection.password,
    managementToken,
    ...STORAGE_PRIVACY_SECRET_ENV.map((key) => String(env[key] || '')),
  ]
    .map((value) => value.trim())
    .filter(Boolean)

  const startedAt = now()
  assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
  const releaseHead = invoke({
    stepId: 'release_pin',
    argv: [trustedInputs.executables.git.path, '-C', rootDir, 'rev-parse', 'HEAD'],
    envOverrides: { GIT_NO_LAZY_FETCH: '1' },
    cwd: rootDir,
    timeoutMs: LOCAL_SUBPROCESS_TIMEOUT_MS,
  })
  assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
  if (releaseHead.status !== 0) fail('rehearsal_release_commit_unavailable')
  const releaseCommit = releaseHead.stdout.trim()
  if (!commitPattern.test(releaseCommit)) fail('rehearsal_release_commit_invalid')

  const readReviewedBlob = (sourcePath) => {
    assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
    const result = invoke({
      stepId: `reviewed_blob_${sha256(sourcePath).slice(0, 12)}`,
      argv: [
        trustedInputs.executables.git.path, '-C', rootDir,
        'cat-file', 'blob', `${releaseCommit}:${sourcePath}`,
      ],
      envOverrides: { GIT_NO_LAZY_FETCH: '1' },
      cwd: rootDir,
      timeoutMs: LOCAL_SUBPROCESS_TIMEOUT_MS,
    })
    assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
    if (result.status !== 0) fail('rehearsal_reviewed_source_blob_unavailable')
    return Buffer.from(result.stdout, 'utf8')
  }
  const readReviewedMigrationNames = () => {
    assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
    const result = invoke({
      stepId: 'reviewed_migration_inventory',
      argv: [
        trustedInputs.executables.git.path, '-C', rootDir, 'ls-tree', '--name-only',
        `${releaseCommit}:${MIGRATION_DIRECTORY}`,
      ],
      envOverrides: { GIT_NO_LAZY_FETCH: '1' },
      cwd: rootDir,
      timeoutMs: LOCAL_SUBPROCESS_TIMEOUT_MS,
    })
    assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
    if (result.status !== 0) fail('rehearsal_reviewed_migration_inventory_unavailable')
    return result.stdout.split(/\r?\n/)
      .filter((name) => /^\d{14}_(?:public_legacy_baseline|private_trial_backend.*)\.sql$/.test(name))
      .sort()
  }
  const reviewedMigrationNames = readReviewedMigrationNames()

  const reviewedSourceBytes = Object.fromEntries(Object.entries(TRUST_SOURCE_PATHS).map(([name, sourcePath]) => {
    const bytes = readReviewedBlob(sourcePath)
    if (`sha256:${sha256(bytes)}` !== trustedInputs.sources[name].digest) {
      fail('rehearsal_trusted_source_not_release_bound')
    }
    return [name, bytes]
  }))

  const packetPath = resolvePrivateJson(rootDir, env[PACKET_ENV], 'rehearsal_packet_file')
  let packet
  try {
    packet = JSON.parse(readBoundedRegularFile(
      packetPath,
      1024 * 1024,
      'rehearsal_packet_file_invalid',
    ).bytes.toString('utf8'))
    await validateSupabaseRehearsalPacket(packet, {
      repositoryRoot: rootDir,
      expectedReleaseCommit: releaseCommit,
      sourceReader: readReviewedBlob,
      migrationNames: reviewedMigrationNames,
    })
  } catch {
    fail('rehearsal_packet_invalid_or_stale')
  }
  if (packet.release?.review?.mode !== 'origin_main'
    || packet.release.review.branch !== 'main'
    || packet.release.review.commit !== releaseCommit) {
    fail('rehearsal_release_not_reviewed_main')
  }
  if (packet.authority?.rehearsalProjectRef !== expectedProjectRef
    || packet.authority?.protectedProductionProjectRef !== productionProjectRef
    || packet.authority?.targetMustRemainNonProduction !== true
    || packet.preflight?.expectedStartingState !== 'clean-target') {
    fail('rehearsal_packet_target_invalid')
  }

  const migrations = packet.release?.migrations
  if (!Array.isArray(migrations)
    || migrations.length !== EXPECTED_MIGRATION_COUNT
    || migrations[0]?.name !== EXPECTED_FIRST_MIGRATION
    || migrations.at(-1)?.name !== EXPECTED_FINAL_MIGRATION
    || JSON.stringify(migrations.map((migration) => migration.name)) !== JSON.stringify(EXPECTED_MIGRATIONS)) {
    fail('rehearsal_packet_migration_chain_invalid')
  }
  const inventory = {}
  const reviewedSqlBytes = {}
  for (const migration of migrations) {
    const sourcePath = `${MIGRATION_DIRECTORY}/${migration.name}`
    const bytes = readReviewedBlob(sourcePath)
    const digest = `sha256:${sha256(bytes)}`
    if (migration.sha256 !== digest.slice(7)) fail('rehearsal_packet_migration_digest_mismatch')
    inventory[migration.name] = digest
    reviewedSqlBytes[migration.name] = bytes
  }
  const quarantineBytes = readReviewedBlob(QUARANTINE_PATH)
  const quarantineDigest = `sha256:${sha256(quarantineBytes)}`
  if (packet.release?.browserQuarantine?.script?.path !== QUARANTINE_PATH
    || packet.release.browserQuarantine.script.sha256 !== quarantineDigest.slice(7)) {
    fail('rehearsal_packet_quarantine_digest_mismatch')
  }
  inventory[QUARANTINE_PATH] = quarantineDigest
  const securityAuditBytes = readReviewedBlob(SECURITY_AUDIT_PATH)
  const securityAuditDigest = `sha256:${sha256(securityAuditBytes)}`
  if (packet.release?.browserQuarantine?.sourceAudit?.path !== SECURITY_AUDIT_PATH
    || `sha256:${packet.release.browserQuarantine.sourceAudit.sha256}` !== securityAuditDigest) {
    fail('rehearsal_packet_security_audit_digest_mismatch')
  }
  inventory[SECURITY_AUDIT_PATH] = securityAuditDigest
  const probeBytes = readReviewedBlob(PROBE_PATH)
  const probeDigest = `sha256:${sha256(probeBytes)}`
  if (!exactKeys(packet.release?.sessionRevocationProbe, ['path', 'sha256', 'mutationScope'])
    || packet.release.sessionRevocationProbe.path !== PROBE_PATH
    || packet.release.sessionRevocationProbe.sha256 !== probeDigest.slice(7)
    || packet.release.sessionRevocationProbe.mutationScope !== 'single-transaction-rollback-only') {
    fail('rehearsal_packet_session_revocation_probe_invalid')
  }
  inventory[PROBE_PATH] = probeDigest

  const connectionDigests = {
    administrative: `sha256:${sha256(databaseUrl)}`,
    runtime: `sha256:${sha256(runtimeUrl)}`,
    storageAudit: `sha256:${sha256(storageAuditUrl)}`,
  }
  const approvalPath = resolvePrivateJson(rootDir, env[APPROVAL_ENV], 'rehearsal_approval_file')
  let approval
  try {
    approval = JSON.parse(readBoundedRegularFile(
      approvalPath,
      1024 * 1024,
      'rehearsal_approval_file_invalid',
    ).bytes.toString('utf8'))
  } catch {
    fail('rehearsal_approval_file_invalid')
  }
  const approvalAuthority = validateExecutionApproval(approval, {
    now: startedAt,
    releaseCommit,
    packetDigest: packet.packetDigest,
    targetProjectRef: expectedProjectRef,
    productionProjectRef,
    connectionDigests,
    trust: trustedInputs.approvalTrust,
    policyState,
  })
  const { actionDeadlineMs, ...approvalEvidence } = approvalAuthority
  const branchReceipt = validateNormalizedBranchReceipt(await fetchBranchObservation({
    parentProjectRef: productionProjectRef,
    targetProjectRef: expectedProjectRef,
    token: managementToken,
  }), productionProjectRef, expectedProjectRef)
  if (branchReceipt.name !== approval.branch.name
    || branchReceipt.createdAt !== approval.branch.createdAt
    || objectDigest(branchReceipt) !== approval.branch.creationReceiptDigest) {
    fail('rehearsal_authenticated_branch_receipt_stale')
  }
  const plan = buildPlan()
  const assertActionWindow = () => {
    const remainingMs = actionDeadlineMs - now().getTime()
    if (remainingMs <= 0) fail('rehearsal_branch_or_approval_deadline_reached')
    return remainingMs
  }
  assertActionWindow()

  const fingerprint = `sha256:${sha256(JSON.stringify({
    contract: PREVIEW_REHEARSAL_CONTRACT,
    releaseCommit,
    targetProjectRef: expectedProjectRef,
    packetDigest: packet.packetDigest,
    approval: approvalEvidence,
    branchReceipt,
    inventory,
  }))}`

  const resolvedEvidenceRoot = prepareEvidenceDirectory(rootDir, evidenceRoot)
  runRoot = join(resolvedEvidenceRoot, fingerprint.slice(7, 19))
  if (existsSync(runRoot)) fail('rehearsal_prior_attempt_requires_new_empty_branch')
  mkdirSync(runRoot)
  runRoot = requirePlainDirectory(runRoot, resolvedEvidenceRoot, 'rehearsal_run_root_invalid')

  const makePlainChildDirectory = (parent, name) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)) fail('rehearsal_sealed_directory_invalid')
    const destination = join(parent, name)
    mkdirSync(destination)
    return requirePlainDirectory(destination, parent, 'rehearsal_sealed_directory_invalid')
  }
  const sealedRoot = makePlainChildDirectory(runRoot, 'sealed')
  const sealedTools = makePlainChildDirectory(sealedRoot, 'tools')
  const sealedHq = makePlainChildDirectory(sealedRoot, 'hq')
  const sealedReadiness = makePlainChildDirectory(sealedHq, 'readiness')
  const sealedSupabase = makePlainChildDirectory(sealedRoot, 'supabase')
  const sealedRehearsal = makePlainChildDirectory(sealedSupabase, 'rehearsal')
  const sealed = {
    certificateAuthority: join(sealedRoot, 'rehearsal-ca.crt'),
    databaseValidator: join(sealedTools, 'validate_supermega_database_url.py'),
    storagePrivacyVerifier: join(sealedTools, 'verify_private_storage_privacy.py'),
    publicQuarantineVerifier: join(sealedTools, 'verify_public_browser_quarantine.mjs'),
    securityAudit: join(sealedReadiness, basename(SECURITY_AUDIT_PATH)),
    quarantine: join(sealedRehearsal, basename(QUARANTINE_PATH)),
  }
  writeExclusiveFile(sealed.certificateAuthority, trustedInputs.certificateAuthority.bytes)
  writeExclusiveFile(sealed.databaseValidator, reviewedSourceBytes.databaseValidator)
  writeExclusiveFile(sealed.storagePrivacyVerifier, reviewedSourceBytes.storagePrivacyVerifier)
  writeExclusiveFile(sealed.publicQuarantineVerifier, reviewedSourceBytes.publicQuarantineVerifier)
  writeExclusiveFile(sealed.securityAudit, securityAuditBytes)
  writeExclusiveFile(sealed.quarantine, quarantineBytes)

  let stepIndex = 0
  const record = (id, outcome, detail) => {
    stepIndex += 1
    const evidenceFile = join(runRoot, `${String(stepIndex).padStart(2, '0')}-${id}.json`)
    const payload = {
      contract: PREVIEW_REHEARSAL_CONTRACT,
      step: id,
      outcome,
      recordedAt: now().toISOString(),
      ...detail,
    }
    const serialized = JSON.stringify(payload, null, 2)
    assertNoCredential(serialized, 'rehearsal_evidence_credential_detected')
    writeExclusiveFile(evidenceFile, Buffer.from(`${serialized}\n`, 'utf8'))
    stepResults.push({ id, outcome, evidenceFile })
    return payload
  }

  const runCommandStep = (id, argv, envOverrides, {
    requireExitZero = true,
    input,
    validateResult = null,
  } = {}) => {
    const remainingMs = assertActionWindow()
    const started = now()
    const executable = Object.values(trustedInputs.executables)
      .find((entry) => sameCanonicalPath(entry.path, argv[0]))
    if (!executable) fail('rehearsal_untrusted_child_executable')
    assertExecutableRuntimeCurrent(trustedInputs, executable, 'rehearsal_child_runtime_changed')
    const result = invoke({ stepId: id, argv, envOverrides, cwd: rootDir, timeoutMs: remainingMs, input })
    assertExecutableRuntimeCurrent(trustedInputs, executable, 'rehearsal_child_runtime_changed')
    assertActionWindow()
    assertNoSecretOccurrence(result.stdout, secrets, 'rehearsal_child_output_contained_secret')
    assertNoSecretOccurrence(result.stderr, secrets, 'rehearsal_child_output_contained_secret')
    const stdout = sanitizeText(result.stdout, secrets)
    const stderr = sanitizeText(result.stderr, secrets)
    const detail = {
      argv: argv.map((entry) => sanitizeText(entry, secrets)),
      exitCode: result.status,
      durationMs: now().getTime() - started.getTime(),
      stdout: stdout.slice(0, 20000),
      stderr: stderr.slice(0, 20000),
    }
    if (requireExitZero && result.status !== 0) {
      record(id, 'failed', detail)
      fail(`step_failed_${id}`)
    }
    if (validateResult) {
      try {
        validateResult({ ...result, stdout, stderr })
      } catch (error) {
        record(id, 'failed', detail)
        throw error
      }
    }
    record(id, 'ok', detail)
    return { ...result, stdout, stderr }
  }

    const assertReviewedCheckout = (stepId) => {
      const runGit = (args) => {
        const timeoutMs = Math.min(assertActionWindow(), LOCAL_SUBPROCESS_TIMEOUT_MS)
        assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
        const result = invoke({
          stepId: `${stepId}_source_guard`,
          argv: [trustedInputs.executables.git.path, '-C', rootDir, ...args],
          envOverrides: { GIT_NO_LAZY_FETCH: '1' },
          cwd: rootDir,
          timeoutMs,
        })
        assertExecutableCurrent(trustedInputs.executables.git, 'git_executable_changed')
        assertActionWindow()
        return result
      }
      const status = runGit(['status', '--porcelain'])
      if (status.status !== 0 || status.stdout.trim()) fail('rehearsal_checkout_dirty')
      const currentHead = runGit(['rev-parse', 'HEAD'])
      if (currentHead.status !== 0 || currentHead.stdout.trim() !== releaseCommit) {
        fail('rehearsal_release_commit_changed')
      }
      const originMain = runGit(['rev-parse', 'origin/main'])
      if (originMain.status !== 0 || originMain.stdout.trim() !== releaseCommit) {
        fail('rehearsal_head_not_origin_main_fetch_first')
      }
    }

    // Local evidence is append-only and cannot authorize a resume. Every SQL
    // execution rechecks the clean reviewed checkout and executes only the
    // already-hashed bytes supplied on stdin.
    assertReviewedCheckout('release_pin')
    record('release_pin', 'ok', { releaseCommit, targetProjectRef: expectedProjectRef })

    record('release_authority', 'ok', {
      releaseCommit,
      targetProjectRef: expectedProjectRef,
      rehearsalPacketContract: packet.contract,
      rehearsalPacketDigest: packet.packetDigest,
      approvalContract: PREVIEW_REHEARSAL_APPROVAL_CONTRACT,
      ...approvalEvidence,
      authenticatedBranchReceipt: branchReceipt,
      authenticatedBranchReceiptDigest: objectDigest(branchReceipt),
      providerAuthenticated: true,
      providerReadsPerformed: 1,
      providerWritesPerformed: 0,
      connectionReviewDigest: `sha256:${sha256(JSON.stringify(connectionDigests))}`,
      maximumLifetimeHours: WINDOW_HOURS,
      startsWithProductionData: false,
    })

    runCommandStep(
      'local_quarantine_guard',
      [trustedInputs.executables.node.path, sealed.publicQuarantineVerifier],
      {},
      {
        validateResult: (result) => validateLocalQuarantineReport(
          parseSingleJson(result.stdout, 'local_quarantine_guard_report_invalid'),
          packet,
          inventory,
        ),
      },
    )

    // migration_inventory: bind every migration byte to the reviewed packet
    // before any hosted mutation. The chain starts with the public baseline,
    // then applies all eleven private migrations through v10.
    record('migration_inventory', 'ok', {
      migrationCount: EXPECTED_MIGRATION_COUNT,
      migrations: migrations.map((migration) => ({
        name: migration.name,
        packetDigest: `sha256:${migration.sha256}`,
      })),
      quarantineDigest: inventory[QUARANTINE_PATH],
      sessionRevocationProbeDigest: inventory[PROBE_PATH],
    })

    assertActionWindow()
    assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.psql, 'psql_runtime_changed')
    const toolchain = verifyPsql(
      trustedInputs.executables.psql,
      invoke,
      rootDir,
      Math.min(assertActionWindow(), LOCAL_SUBPROCESS_TIMEOUT_MS),
    )
    assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.psql, 'psql_runtime_changed')
    assertActionWindow()
    record('toolchain', 'ok', { psqlVersion: sanitizeText(toolchain.versionOutput, secrets) })

    // url_preflight: require the clean target described by the reviewed packet.
    // A production schema mirror, existing private schema, or existing backend
    // role is rejected before any migration is handed to psql.
    const preflightArgv = sealedPythonArgv(trustedInputs, sealed.databaseValidator, [
      '--env-key', URL_ENV,
      '--rehearsal-preflight',
      '--expected-project-ref-env-key', REF_ENV,
      '--production-project-ref-env-key', PRODUCTION_REF_ENV,
      '--ssl-root-cert-env-key', CA_ENV,
    ])
    const preflightStarted = now()
    assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.python, 'python_runtime_changed')
    const result = invoke({
      stepId: 'url_preflight',
      argv: preflightArgv,
      envOverrides: {
        [URL_ENV]: databaseUrl,
        [PRODUCTION_REF_ENV]: productionProjectRef,
        [REF_ENV]: expectedProjectRef,
        [CA_ENV]: sealed.certificateAuthority,
        PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      cwd: rootDir,
      timeoutMs: assertActionWindow(),
    })
    assertActionWindow()
    assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.python, 'python_runtime_changed')
    assertNoSecretOccurrence(result.stdout, secrets, 'rehearsal_child_output_contained_secret')
    assertNoSecretOccurrence(result.stderr, secrets, 'rehearsal_child_output_contained_secret')
    const report = parseSingleJson(
      sanitizeText(result.stdout, secrets),
      'url_preflight_report_invalid',
    )
    const detail = {
      argv: preflightArgv,
      exitCode: result.status,
      durationMs: now().getTime() - preflightStarted.getTime(),
      report,
      stderr: sanitizeText(result.stderr, secrets).slice(0, 20000),
    }
    if (result.status !== 0) {
      record('url_preflight', 'failed', detail)
      fail('rehearsal_clean_target_required')
    }
    try {
      validateCleanTargetReport(report, approvalAuthority.cleanTargetMetadataDigest, expectedProjectRef)
    } catch {
      record('url_preflight', 'failed', detail)
      fail('rehearsal_clean_target_required')
    }
    record('url_preflight', 'ok', { ...detail, baseline: 'clean-target-without-production-data' })

    // Prove both fresh logins have no persistent write/ownership/default
    // authority or SET-role path before the first migration.
    const credentialReports = {}
    for (const [purpose, boundedConnection] of [
      ['runtime', runtimeConnection],
      ['storage_audit', storageAuditConnection],
    ]) {
      const remainingMs = assertActionWindow()
      assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.psql, 'psql_runtime_changed')
      const result = invoke({
        stepId: `${purpose}_credential_preflight`,
        argv: [
          toolchain.psql, '--no-psqlrc', '--no-password', '--tuples-only', '--no-align',
          '--set', 'ON_ERROR_STOP=1', '--command', CREDENTIAL_PREFLIGHT_SQL,
        ],
        envOverrides: psqlEnv(boundedConnection, sealed.certificateAuthority),
        cwd: rootDir,
        timeoutMs: remainingMs,
      })
      assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.psql, 'psql_runtime_changed')
      assertActionWindow()
      assertNoSecretOccurrence(result.stdout, secrets, 'rehearsal_child_output_contained_secret')
      assertNoSecretOccurrence(result.stderr, secrets, 'rehearsal_child_output_contained_secret')
      const report = lastJsonLine(sanitizeText(result.stdout, secrets))
      if (result.status !== 0 || !report) {
        record('runtime_credential_boundary', 'failed', {
          purpose,
          exitCode: result.status,
          stderr: sanitizeText(result.stderr, secrets).slice(0, 20000),
          credentialsIncluded: false,
        })
        fail(`${purpose}_credential_preflight_failed`)
      }
      credentialReports[purpose] = validateCredentialPreflightReport(report, boundedConnection.loginRole, purpose)
    }
    record('runtime_credential_boundary', 'ok', {
      targetProjectRef: expectedProjectRef,
      runtime: credentialReports.runtime,
      storageAudit: credentialReports.storage_audit,
      privilegedCredentialsRejected: true,
      credentialsIncluded: false,
    })

    // All Storage configuration must pass locally before the first branch
    // mutation. The live six-request audit remains a separately confirmed,
    // read-only owner action documented in the runbook.
    runCommandStep('storage_privacy_preflight', sealedPythonArgv(
      trustedInputs,
      sealed.storagePrivacyVerifier,
      ['--preflight'],
    ), {
      ...Object.fromEntries(STORAGE_PRIVACY_ENV.map((key) => [key, env[key]])),
      PYTHONNOUSERSITE: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    }, {
      validateResult: (result) => validateStoragePreflightReport(parseSingleJson(
        result.stdout,
        'storage_privacy_preflight_report_invalid',
      )),
    })

    // Apply the reviewed public baseline and all private migrations through
    // v10. Recheck the exact packet digest immediately before every psql call.
    const branchEnv = psqlEnv(connection, sealed.certificateAuthority)
    for (const [index, migration] of migrations.entries()) {
      const id = `apply_migration_${String(index + 1).padStart(2, '0')}`
      assertReviewedCheckout(id)
      const bytes = reviewedSqlBytes[migration.name]
      if (sha256(bytes) !== migration.sha256) {
        fail(`migration_digest_mismatch_${String(index + 1).padStart(2, '0')}`)
      }
      runCommandStep(id, [
        toolchain.psql, '--no-psqlrc', '--no-password',
        '--set', 'ON_ERROR_STOP=1',
        '--file', '-',
      ], branchEnv, { input: bytes })
    }

    assertReviewedCheckout('apply_quarantine')
    if (`sha256:${sha256(quarantineBytes)}` !== inventory[QUARANTINE_PATH]) {
      fail('rehearsal_quarantine_digest_mismatch')
    }
    runCommandStep('apply_quarantine', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', '-',
    ], branchEnv, { input: quarantineBytes })

    // The dedicated Storage auditor must still have no persistent write path
    // after reviewed DDL/default privileges have been installed.
    assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.psql, 'psql_runtime_changed')
    const postStorageResult = invoke({
      stepId: 'storage_audit_postmigration_credential_preflight',
      argv: [
        toolchain.psql, '--no-psqlrc', '--no-password', '--tuples-only', '--no-align',
        '--set', 'ON_ERROR_STOP=1', '--command', CREDENTIAL_PREFLIGHT_SQL,
      ],
      envOverrides: psqlEnv(storageAuditConnection, sealed.certificateAuthority),
      cwd: rootDir,
      timeoutMs: assertActionWindow(),
    })
    assertExecutableRuntimeCurrent(trustedInputs, trustedInputs.executables.psql, 'psql_runtime_changed')
    assertActionWindow()
    assertNoSecretOccurrence(postStorageResult.stdout, secrets, 'rehearsal_child_output_contained_secret')
    assertNoSecretOccurrence(postStorageResult.stderr, secrets, 'rehearsal_child_output_contained_secret')
    const postStorageReport = lastJsonLine(sanitizeText(postStorageResult.stdout, secrets))
    if (postStorageResult.status !== 0 || !postStorageReport) {
      record('storage_audit_postmigration_boundary', 'failed', {
        exitCode: postStorageResult.status,
        stderr: sanitizeText(postStorageResult.stderr, secrets).slice(0, 20000),
        credentialsIncluded: false,
      })
      fail('storage_audit_postmigration_preflight_failed')
    }
    record('storage_audit_postmigration_boundary', 'ok', {
      storageAudit: validateCredentialPreflightReport(
        postStorageReport,
        storageAuditConnection.loginRole,
        'storage_audit_postmigration',
      ),
      persistentWriteAuthorityAbsent: true,
      credentialsIncluded: false,
    })

    // hosted_validator: read-only v10 contract via the prevalidated dedicated
    // runtime and Storage-audit logins.
    runCommandStep('hosted_validator', sealedPythonArgv(trustedInputs, sealed.databaseValidator, [
      '--env-key', RUNTIME_URL_ENV,
      '--storage-audit-env-key', STORAGE_AUDIT_URL_ENV,
      '--ensure-schema', '--require-ready',
    ]), {
      [RUNTIME_URL_ENV]: runtimeUrl,
      [STORAGE_AUDIT_URL_ENV]: storageAuditUrl,
      PYTHONNOUSERSITE: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    }, {
      validateResult: (result) => validateHostedValidatorReport(parseSingleJson(
        result.stdout,
        'hosted_validator_report_invalid',
      )),
    })

    assertReviewedCheckout('session_revocation_probe')
    if (`sha256:${sha256(probeBytes)}` !== inventory[PROBE_PATH]) {
      fail('rehearsal_session_revocation_probe_digest_mismatch')
    }
    runCommandStep('session_revocation_probe', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', '-',
    ], branchEnv, { input: probeBytes })

    assertActionWindow()
    const finishedAt = now()
    const evidencePacket = {
      contract: PREVIEW_REHEARSAL_CONTRACT,
      ok: true,
      generatedAt: finishedAt.toISOString(),
      releaseCommit,
      targetProjectRef: expectedProjectRef,
      baseline: 'clean-target-without-production-data',
      fingerprint,
      authority: {
        rehearsalPacketContract: packet.contract,
        rehearsalPacketDigest: packet.packetDigest,
        approvalContract: PREVIEW_REHEARSAL_APPROVAL_CONTRACT,
        ...approvalEvidence,
        connectionReviewDigest: `sha256:${sha256(JSON.stringify(connectionDigests))}`,
      },
      window: {
        windowHours: WINDOW_HOURS,
        branchCreatedAt: approvalEvidence.branchCreatedAt,
        branchDeleteBy: approvalEvidence.branchDeleteBy,
        plannedMinutes: plan.totals.plannedMinutes,
        toolStartedAt: startedAt.toISOString(),
        toolFinishedAt: finishedAt.toISOString(),
        actualToolMinutes: Math.ceil((finishedAt.getTime() - startedAt.getTime()) / 60000),
      },
      steps: stepResults,
      digests: {
        migrations: migrations.map((migration) => ({
          name: migration.name,
          packetDigest: `sha256:${migration.sha256}`,
        })),
        quarantine: inventory[QUARANTINE_PATH],
        sessionRevocationProbe: inventory[PROBE_PATH],
      },
      ownerGatedEvidence: [
        'provider-backup-inventory-before-migration (OWNER-CONSOLE, runbook step 7)',
        'independent-restore-to-isolated-target (OWNER-CONSOLE, runbook step 7)',
        'supabase-security-and-performance-advisors (OWNER-CONSOLE, runbook step 7)',
        'named-user-auth-and-cross-tenant-denial (live Storage audit, owner-approved, runbook step 7)',
        'branch deletion receipt (OWNER-CONSOLE, runbook step 9)',
      ],
      controls: {
        productionMutated: false,
        previewBranchMutated: true,
        authenticatedManagementReads: 1,
        managementWrites: 0,
        activationAllowed: false,
        productionWritesEnabled: false,
        credentialsIncluded: false,
      },
    }
    const serialized = JSON.stringify(evidencePacket, null, 2)
    assertNoCredential(serialized, 'rehearsal_evidence_credential_detected')
    const evidencePacketPath = join(runRoot, `evidence-packet-${finishedAt.toISOString().replaceAll(':', '').replace(/\..+$/, 'Z')}.json`)
    writeExclusiveFile(evidencePacketPath, Buffer.from(`${serialized}\n`, 'utf8'))
    const summary = {
      ok: true,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'rehearsal_evidence_captured',
      evidencePacket: evidencePacketPath,
      stepsExecuted: stepResults.filter((step) => step.outcome === 'ok').length,
      stepsSkipped: 0,
      productionMutated: false,
      nextAction: 'Founder evidence review, then preview-branch deletion (docs/rehearsal-runbook.md steps 8-9).',
    }
    log(JSON.stringify(summary))
    return { ...summary, packet: evidencePacket, runRoot, exitCode: 0 }
  } catch (error) {
    const code = error?.rehearsalCode || 'rehearsal_failed'
    const summary = {
      ok: false,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'attention',
      error: code,
      failedAfterSteps: stepResults.filter((step) => step.outcome === 'ok').length,
      resumable: false,
      requiresNewEmptyBranch: true,
      evidenceRoot: runRoot,
      productionMutated: false,
      hint: 'Stop this branch. Fix source locally, obtain a new empty branch and fresh exact approval, then start a new run. Local evidence never authorizes resuming hosted mutations.',
    }
    log(JSON.stringify(summary))
    return { ...summary, exitCode: 1 }
  }
}

export async function runRehearsal(options = {}) {
  return runRehearsalWithAuthority(options)
}

// ---------------------------------------------------------------------------
// Self-test: stubbed database layer, no network, no child processes.
// ---------------------------------------------------------------------------

async function selfTestFixtures(testRoot) {
  mkdirSync(testRoot)
  const temporaryRoot = resolve(root, '.tmp')
  const prefix = basename(testRoot)
  const privateJsonPath = (name) => join(temporaryRoot, `${prefix}-${name}.json`)
  const evidencePath = (name) => join(temporaryRoot, `${prefix}-evidence-${name}`)
  const fixtureRef = 'previewbranchzzzz001'
  const releaseCommit = 'a'.repeat(40)
  const administrativeUrl = `postgresql://postgres:stub-password@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const runtimeUrl = `postgresql://supermega_trial_runtime:runtime-password-selftest-001@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const storageAuditUrl = `postgresql://supermega_storage_audit:storage-password-selftest-002@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot: root,
    targetProjectRef: fixtureRef,
    releaseCommit,
    releaseReview: originMainReleaseReview(releaseCommit),
    generatedAt: '2026-08-12T16:00:00.000Z',
  })
  const packetPath = privateJsonPath('packet')
  const approvalPath = privateJsonPath('approval')
  writeExclusiveFile(packetPath, Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8'))
  const connectionDigests = {
    administrative: `sha256:${sha256(administrativeUrl)}`,
    runtime: `sha256:${sha256(runtimeUrl)}`,
    storageAudit: `sha256:${sha256(storageAuditUrl)}`,
  }
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const parentProjectRef = manifest.supermega.productionSupabaseProjectRef
  const branchReceipt = {
    contract: 'supermega.supabase-branch-creation-receipt.v1',
    source: 'supabase-management-api-environment-read',
    providerAuthenticated: true,
    parentProjectRef,
    projectRef: fixtureRef,
    name: 'clean-preview-self-test',
    createdAt: '2026-08-12T15:30:00.000Z',
    withData: false,
    persistent: false,
    isDefault: false,
    status: 'ACTIVE_HEALTHY',
    previewProjectStatus: 'ACTIVE_HEALTHY',
  }
  const ownerKeys = generateKeyPairSync('ed25519')
  const reviewerKeys = generateKeyPairSync('ed25519')
  const policy = {
    contract: PREVIEW_REHEARSAL_AUTHORITY_CONTRACT,
    state: 'registered',
    signaturePolicy: {
      algorithm: 'Ed25519',
      canonicalization: 'supermega.stable-json.v1',
      approvalDomain: AUTHORITY_APPROVAL_DOMAIN.trimEnd(),
      reviewDomain: AUTHORITY_REVIEW_DOMAIN.trimEnd(),
      maximumApprovalValidityHours: WINDOW_HOURS,
      distinctRoleKeysRequired: true,
    },
    signers: {
      owner: {
        role: 'owner',
        status: 'owner_policy_digest_pinned',
        keyId: 'rehearsal-owner-self-test',
        publicKeyPem: ownerKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        publicKeyFingerprint: publicKeyFingerprint(ownerKeys.publicKey),
        registeredAt: '2026-08-12T15:00:00.000Z',
      },
      independentReviewer: {
        role: 'independent_reviewer',
        status: 'independent_reviewer_policy_digest_pinned',
        keyId: 'rehearsal-reviewer-self-test',
        publicKeyPem: reviewerKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        publicKeyFingerprint: publicKeyFingerprint(reviewerKeys.publicKey),
        registeredAt: '2026-08-12T15:01:00.000Z',
      },
    },
    controls: {
      executionVerificationEnabled: true,
      privateKeysStored: false,
      providerWritesAuthorized: false,
      registrationOwnerGated: true,
    },
    sourceDigest: '',
  }
  policy.sourceDigest = policyDigest(policy)
  const fixtureBin = join(testRoot, 'git-bin')
  const pythonEnvironmentRoot = join(testRoot, 'python-environment')
  const pythonBin = join(pythonEnvironmentRoot, process.platform === 'win32' ? 'Scripts' : 'bin')
  const pythonPackageRoot = join(pythonEnvironmentRoot, 'Lib', 'site-packages', 'psycopg')
  const pythonBaseRoot = join(testRoot, 'python-base-runtime')
  const postgresBin = join(testRoot, 'postgres-bin')
  mkdirSync(fixtureBin)
  mkdirSync(pythonEnvironmentRoot)
  mkdirSync(pythonBin)
  mkdirSync(pythonPackageRoot, { recursive: true })
  mkdirSync(pythonBaseRoot)
  mkdirSync(postgresBin)
  const gitPath = join(fixtureBin, process.platform === 'win32' ? 'git.exe' : 'git')
  const pythonPath = join(pythonBin, process.platform === 'win32' ? 'python.exe' : 'python3')
  const psqlPath = join(postgresBin, process.platform === 'win32' ? 'psql.exe' : 'psql')
  const pythonPackagePath = join(pythonPackageRoot, '__init__.py')
  const postgresLibraryPath = join(postgresBin, process.platform === 'win32' ? 'libpq.dll' : 'libpq.so')
  const caPath = join(testRoot, 'fixture-ca.crt')
  for (const [path, bytes] of [
    [gitPath, 'self-test-git-executable-v1'],
    [pythonPath, 'self-test-python-executable-v1'],
    [psqlPath, 'self-test-psql-executable-v1'],
    [postgresLibraryPath, 'self-test-libpq-v1'],
    [join(pythonBaseRoot, process.platform === 'win32' ? 'python312.dll' : 'libpython3.so'), 'self-test-python-runtime-v1'],
    [pythonPackagePath, 'self-test-psycopg-package-v1'],
    [join(pythonEnvironmentRoot, 'pyvenv.cfg'), `home = ${pythonBaseRoot}\ninclude-system-site-packages = false\n`],
    [caPath, 'self-test-certificate-authority-v1'],
  ]) writeExclusiveFile(path, Buffer.from(bytes, 'utf8'))
  const storageEnvironment = Object.fromEntries(STORAGE_PRIVACY_ENV.map((key, index) => [
    key,
    `storage-secret-selftest-${String(index + 1).padStart(2, '0')}-abcdefgh`,
  ]))
  const env = {
    [URL_ENV]: administrativeUrl,
    [REF_ENV]: fixtureRef,
    [CA_ENV]: caPath,
    [RUNTIME_URL_ENV]: runtimeUrl,
    [STORAGE_AUDIT_URL_ENV]: storageAuditUrl,
    [PACKET_ENV]: packetPath,
    [APPROVAL_ENV]: approvalPath,
    [MANAGEMENT_TOKEN_ENV]: 'fixture-management-token-read-only-0001',
    [GIT_BIN_ENV]: gitPath,
    [PYTHON_BIN_ENV]: pythonPath,
    [POSTGRES_BIN_ENV]: postgresBin,
    ...storageEnvironment,
  }
  const trustedInputs = resolveTrustedInputs({ env, rootDir: root, caFile: caPath })
  const cleanTargetMetadataInventory = {
    schemas: [
      ['auth', 'supabase_admin', ''],
      ['extensions', 'postgres', ''],
      ['public', 'postgres', ''],
      ['storage', 'supabase_admin', ''],
    ],
    extensions: [['pgcrypto', '1.3', 'extensions', 'postgres', true]],
    relations: [],
    columns: [],
    constraints: [],
    indexes: [],
    routines: [],
    triggers: [],
    policies: [],
    rewrite_rules: [],
    types: [],
    event_triggers: [],
    default_acls: [],
    roles: [],
    role_memberships: [],
    role_settings: [],
    publications: [],
    publication_relations: [],
    subscriptions: [],
    subscription_relations: [],
    foreign_data_wrappers: [],
    foreign_servers: [],
    user_mappings: [],
    large_objects: [],
    database_configuration: [['postgres', 'postgres', '', true, -1, '']],
  }
  const cleanTargetMetadataDigest = objectDigest(cleanTargetMetadataInventory)
  const approval = {
    contract: PREVIEW_REHEARSAL_APPROVAL_CONTRACT,
    decision: 'approved',
    approvalId: '123e4567-e89b-42d3-a456-426614174000',
    approvedAt: '2026-08-12T15:50:00.000Z',
    expiresAt: '2026-08-13T15:00:00.000Z',
    releaseCommit,
    rehearsalPacketDigest: packet.packetDigest,
    targetProjectRef: fixtureRef,
    connectionDigests,
    trust: trustedInputs.approvalTrust,
    branch: {
      parentProjectRef,
      name: branchReceipt.name,
      projectRef: fixtureRef,
      createdAt: branchReceipt.createdAt,
      deleteBy: '2026-08-13T15:30:00.000Z',
      creationReceiptDigest: objectDigest(branchReceipt),
      cleanTargetMetadataDigest,
      startsWithProductionData: false,
      maximumLifetimeHours: WINDOW_HOURS,
      providerUsageChargesAcknowledged: true,
      creationApproved: true,
      migrationApplicationApproved: true,
      deleteAfterEvidence: true,
    },
    authorizedActions: REQUIRED_APPROVED_ACTIONS,
    controls: {
      productionTargetApproved: false,
      productionDataApproved: false,
      productionMutationApproved: false,
      managedActivationApproved: false,
    },
    ownerKeyFingerprint: policy.signers.owner.publicKeyFingerprint,
    ownerSignature: { algorithm: 'Ed25519', keyId: policy.signers.owner.keyId, value: '' },
    independentReview: null,
  }
  approval.ownerSignature.value = signBytes(null, ownerApprovalPayload(approval), ownerKeys.privateKey).toString('base64')
  approval.independentReview = {
    contract: PREVIEW_REHEARSAL_REVIEW_CONTRACT,
    decision: 'accepted',
    approvalDigest: ownerApprovalDigest(approval),
    reviewedAt: '2026-08-12T15:55:00.000Z',
    expiresAt: approval.expiresAt,
    reviewerKeyFingerprint: policy.signers.independentReviewer.publicKeyFingerprint,
    signature: { algorithm: 'Ed25519', keyId: policy.signers.independentReviewer.keyId, value: '' },
  }
  approval.independentReview.signature.value = signBytes(
    null,
    independentReviewPayload(approval.independentReview),
    reviewerKeys.privateKey,
  ).toString('base64')
  writeExclusiveFile(approvalPath, Buffer.from(`${JSON.stringify(approval, null, 2)}\n`, 'utf8'))
  const cleanPreflight = JSON.stringify({
    ok: true,
    ready: true,
    status: 'clean_target',
    contract: 'supermega_supabase_rehearsal_preflight_v1',
    connection_mode: 'direct',
    target_project_ref: fixtureRef,
    tls_mode: 'verify-full',
    checks: Object.fromEntries(REQUIRED_CLEAN_TARGET_CHECKS.map((check) => [check, true])),
    failed_checks: [],
    metadata_inventory: cleanTargetMetadataInventory,
    metadata_fingerprint_digest: cleanTargetMetadataDigest,
    mutation_statements_executed: 0,
    secret_values_exposed: false,
    production_mutated: false,
    supabase_mutated: false,
    vercel_mutated: false,
  })
  const safeCredentialReport = (loginRole, overrides = {}) => ({
    contract: 'supermega.preview-rehearsal-credential-preflight.v1',
    loginRole,
    sessionRoleStable: true,
    probeTransactionReadOnly: true,
    tlsActive: true,
    canLogin: true,
    noSuperuser: true,
    noBypassRls: true,
    noCreateRole: true,
    noCreateDb: true,
    noReplication: true,
    noRoleMemberships: true,
    noElevatedMembershipPath: true,
    noDatabaseCreatePrivilege: true,
    noSchemaCreatePrivilege: true,
    noTableWritePrivilege: true,
    noSequenceMutationPrivilege: true,
    noLargeObjectWritePrivilege: true,
    noLargeObjectCreationPrivilege: true,
    noSecurityDefinerExecutePrivilege: true,
    noObjectOwnership: true,
    noDefaultWritePrivileges: true,
    noRoleSettings: true,
    ...overrides,
  })
  const storageEvidence = {
    contract: 'supermega.private-storage-privacy.v1',
    mode: 'offline_configuration_preflight',
    adapter: 'supabase_storage_rest_v2',
    target_host_digest: `sha256:${'1'.repeat(64)}`,
    bucket_digest: `sha256:${'2'.repeat(64)}`,
    owner_approval_digest: `sha256:${'3'.repeat(64)}`,
    captured_at: '2026-08-12T16:00:00Z',
    tenant_identity_count: 2,
    credential_shapes_validated_locally: true,
    provider_credentials_verified: false,
    maximum_live_requests: 6,
    signed_url_ttl_seconds: 60,
    network_requests_performed: 0,
    persistent_mutations_performed: 0,
    secrets_exposed: false,
    bucket_or_object_names_exposed: false,
  }
  const storagePreflight = JSON.stringify({
    ok: true,
    ...storageEvidence,
    evidence_digest: objectDigest(storageEvidence),
  })
  const hostedReport = JSON.stringify({
    ok: true,
    ready: true,
    status: 'ready',
    contract: 'supermega_private_trial_database_v10',
    checks: Object.fromEntries(HOSTED_READY_CHECKS.map((check) => [check, true])),
    failed_checks: [],
    evidence: {
      engine: { postgres_major: 17, installed_extensions: ['pgcrypto'], unsupported_extensions: [] },
      schema: { name: 'app_private', component: 'private_trial_backend', version: 10 },
      role: { backend_group: 'supermega_trial_backend', dedicated_login_verified: true, settings_entries: 0 },
      tables: ['trial_schema_meta'],
      rls: { metadata_table: { enabled: true, forced: false }, forced_tables: [], required_tables: [] },
      grant: { runtime_acl_entries: 1, expected_runtime_acl_entries: 1, default_acl_entries: 0 },
      policies: [],
      hardening_constraints: [],
      triggers: [],
      indexes: [],
      storage: {
        baseline: 'private-unconfigured', tables: ['buckets', 'objects'],
        audit_connection_read_only_encrypted: true, bucket_inventory_readable: true,
        bucket_count: 0, public_bucket_count: 0, policy_count: 0,
      },
    },
    mutation_statements_executed: 0,
    secret_values_exposed: false,
  })
  const localQuarantineReport = JSON.stringify({
    ok: true,
    contract: 'supermega.public-browser-quarantine.v1',
    sourceAuditDigest: packet.release.browserQuarantine.sourceAudit.evidenceDigest,
    sqlDigest: `sha256:${packet.release.browserQuarantine.script.sha256}`,
    tables: packet.release.browserQuarantine.sourceAudit.publicTableCount,
    sequences: packet.release.browserQuarantine.sourceAudit.publicSequenceCount,
    browserRolesDenied: ['anon', 'authenticated'],
    serviceRolePreserved: true,
    idempotent: true,
    schemaDriftRejected: true,
    productionMutated: false,
  })
  const makeExec = (overrides = {}, calls = []) => ({
    calls,
    exec(call) {
      calls.push({
        stepId: call.stepId,
        argv: call.argv,
        envKeys: Object.keys(call.envOverrides || {}).sort(),
        baseEnvKeys: Object.keys(call.baseEnv || {}).sort(),
        inputDigest: call.input === undefined ? null : `sha256:${sha256(call.input)}`,
      })
      if (overrides[call.stepId]) {
        const override = overrides[call.stepId]
        return typeof override === 'function' ? override(call) : override
      }
      if (call.argv.includes('cat-file')) {
        const specification = call.argv.at(-1)
        const sourcePath = specification.slice(specification.indexOf(':') + 1)
        if (overrides.reviewedBlob) return overrides.reviewedBlob(call, sourcePath)
        return { status: 0, stdout: readFileSync(resolve(root, sourcePath), 'utf8'), stderr: '' }
      }
      if (call.argv.includes('ls-tree')) {
        return { status: 0, stdout: `${EXPECTED_MIGRATIONS.join('\n')}\n`, stderr: '' }
      }
      if (call.argv.includes('rev-parse')) return { status: 0, stdout: releaseCommit, stderr: '' }
      if (call.argv.includes('status')) return { status: 0, stdout: '', stderr: '' }
      if (call.argv[1] === '--version') return { status: 0, stdout: 'psql (PostgreSQL) 17.10', stderr: '' }
      if (call.stepId?.endsWith('_credential_preflight')) {
        const loginRole = call.stepId.startsWith('runtime') ? 'supermega_trial_runtime' : 'supermega_storage_audit'
        return {
          status: 0,
          stdout: JSON.stringify(safeCredentialReport(loginRole)),
          stderr: '',
        }
      }
      if (call.argv.includes('--rehearsal-preflight')) return { status: 0, stdout: cleanPreflight, stderr: '' }
      if (call.argv.includes('--require-ready')) return { status: 0, stdout: hostedReport, stderr: '' }
      if (call.argv.includes('--preflight')) return { status: 0, stdout: storagePreflight, stderr: '' }
      if (call.stepId === 'local_quarantine_guard') return { status: 0, stdout: localQuarantineReport, stderr: '' }
      return { status: 0, stdout: 'stubbed-ok', stderr: '' }
    },
  })
  return {
    env,
    makeExec,
    approvalPath,
    packetPath,
    releaseCommit,
    policy,
    trustedRegisteredAuthorityDigest: policy.sourceDigest,
    branchReceipt,
    safeCredentialReport,
    privateJsonPath,
    evidencePath,
    testPrefix: prefix,
    cleanPreflight,
    runtimeFixtureFiles: { pythonPackagePath, postgresLibraryPath },
    fetchBranchObservation: async () => structuredClone(branchReceipt),
  }
}

export async function runSelfTest() {
  const silent = () => {}
  const testRoot = resolve(root, '.tmp', `rehearsal-selftest-${process.pid}-${Date.now()}`)
  const fixture = await selfTestFixtures(testRoot)
  try {
  const { env, makeExec, approvalPath, safeCredentialReport, privateJsonPath, evidencePath } = fixture
  const fixedNow = () => new Date('2026-08-12T16:00:00.000Z')
  const authorityContext = {
    authorityPolicy: fixture.policy,
    trustedRegisteredAuthorityDigest: fixture.trustedRegisteredAuthorityDigest,
    fetchBranchObservation: fixture.fetchBranchObservation,
  }
  const run = (options) => runRehearsalWithAuthority(
    { log: silent, now: fixedNow, ...options },
    authorityContext,
  )
  let cases = 0
  cases += 1
  const trustCapture = captureExecutionTrust({ env, rootDir: root })
  const approvedTrust = JSON.parse(readFileSync(approvalPath, 'utf8')).trust
  if (!exactKeys(trustCapture, [
    'ok', 'contract', 'trust', 'networkRequestsPerformed', 'childProcessesSpawned',
    'credentialValuesRead', 'providerWritesPerformed',
  ])
    || trustCapture.ok !== true
    || stableStringify(trustCapture.trust) !== stableStringify(approvedTrust)
    || trustCapture.networkRequestsPerformed !== 0
    || trustCapture.childProcessesSpawned !== 0
    || trustCapture.credentialValuesRead !== false
    || trustCapture.providerWritesPerformed !== 0) {
    throw new Error('self_test_execution_trust_capture_invalid')
  }
  const expectFailure = async (code, options) => {
    cases += 1
    const result = await run(options)
    if (result.ok !== false || result.error !== code || result.exitCode !== 1) {
      throw new Error(`self_test_expected_${code}_got_${result.error ?? result.status}`)
    }
    return result
  }

  // 1. Absent target environment performs zero actions.
  cases += 1
  {
    const stub = makeExec()
    const result = await run({ env: {}, exec: stub.exec })
    if (result.status !== 'rehearsal_target_not_configured' || result.exitCode !== 0 || stub.calls.length !== 0) {
      throw new Error('self_test_not_configured_failed')
    }
  }

  // 2. Dry-run prints the full plan inside the 24-hour budget with no calls.
  cases += 1
  {
    const stub = makeExec()
    const result = await run({ argv: ['--dry-run'], env: {}, exec: stub.exec })
    if (result.exitCode !== 0 || stub.calls.length !== 0) throw new Error('self_test_dry_run_failed')
    const plan = result.plan
    if (plan.steps.length !== 25 || plan.totals.bufferMinutes <= 0 || plan.totals.plannedMinutes >= plan.totals.windowMinutes) {
      throw new Error('self_test_dry_run_budget_failed')
    }
    if (plan.ownerConsoleSegments.length !== OWNER_CONSOLE_SEGMENTS.length) throw new Error('self_test_dry_run_owner_segments_failed')
  }

  // A bounded receipt capture performs one mocked authenticated read, emits
  // only canonical branch metadata, and never invokes a child process.
  cases += 1
  {
    const stub = makeExec()
    const result = await runRehearsalWithAuthority(
      {
        argv: ['--capture-branch-receipt'],
        env: { [REF_ENV]: env[REF_ENV], [MANAGEMENT_TOKEN_ENV]: env[MANAGEMENT_TOKEN_ENV] },
        exec: stub.exec,
        log: silent,
      },
      authorityContext,
    )
    if (result.mode !== 'authenticated-branch-receipt'
      || result.receiptDigest !== objectDigest(fixture.branchReceipt)
      || result.providerReadsPerformed !== 1
      || result.providerWritesPerformed !== 0
      || stub.calls.length !== 0) {
      throw new Error('self_test_branch_receipt_capture_failed')
    }
  }

  // 3. Happy path executes every step in order and captures a clean packet.
  cases += 1
  {
    const stub = makeExec()
    const result = await run({
      env, exec: stub.exec, evidenceRoot: evidencePath('happy'),
    })
    if (result.ok !== true || result.status !== 'rehearsal_evidence_captured' || result.exitCode !== 0) {
      throw new Error(`self_test_happy_path_failed_${result.error ?? ''}`)
    }
    const packetText = readFileSync(result.evidencePacket, 'utf8')
    assertNoCredential(packetText, 'self_test_packet_leaked_credential')
    if (packetText.includes('stub-password')) throw new Error('self_test_packet_leaked_password')
    const sqlCalls = stub.calls.filter((call) => call.argv.includes('--file'))
    const expectedOrder = [
      ...EXPECTED_MIGRATIONS.map((name, index) => ({
        stepId: `apply_migration_${String(index + 1).padStart(2, '0')}`,
        inputDigest: `sha256:${sha256(readFileSync(resolve(root, MIGRATION_DIRECTORY, name)))}`,
      })),
      { stepId: 'apply_quarantine', inputDigest: `sha256:${sha256(readFileSync(resolve(root, QUARANTINE_PATH)))}` },
      { stepId: 'session_revocation_probe', inputDigest: `sha256:${sha256(readFileSync(resolve(root, PROBE_PATH)))}` },
    ]
    if (sqlCalls.some((call) => call.argv[call.argv.indexOf('--file') + 1] !== '-')
      || JSON.stringify(sqlCalls.map(({ stepId, inputDigest }) => ({ stepId, inputDigest }))) !== JSON.stringify(expectedOrder)) {
      throw new Error('self_test_step_order_or_byte_binding_failed')
    }
    if (stub.calls.some((call) => call.envKeys.includes(MANAGEMENT_TOKEN_ENV)
      || call.baseEnvKeys.some((key) => !SAFE_CHILD_ENV_KEYS.includes(key)))) {
      throw new Error('self_test_child_environment_not_scrubbed')
    }

    // 4. Local evidence cannot authorize a resume or skip hosted work.
    const resumeStub = makeExec()
    const resumed = await expectFailure('rehearsal_prior_attempt_requires_new_empty_branch', {
      env, exec: resumeStub.exec, evidenceRoot: evidencePath('happy'),
    })
    if (resumed.resumable !== false
      || !resumed.requiresNewEmptyBranch
      || resumeStub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_local_state_authorized_resume')
    }

    // The clean-checkout guard also runs on a first attempt.
    const dirtyResumeStub = makeExec({
      release_pin_source_guard: (call) => call.argv.includes('status')
        ? { status: 0, stdout: ' M tools/run_preview_branch_rehearsal.mjs', stderr: '' }
        : { status: 0, stdout: fixture.releaseCommit, stderr: '' },
    })
    const dirtyResume = await expectFailure('rehearsal_checkout_dirty', {
      env, exec: dirtyResumeStub.exec, evidenceRoot: evidencePath('dirty-checkout'),
    })
    if (dirtyResume.productionMutated !== false
      || dirtyResumeStub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_dirty_resume_reached_migration')
    }
  }

  // 5. A non-empty schema target fails closed before the first migration.
  {
    const nonCleanPreflight = {
      status: 1,
      stdout: JSON.stringify({
        ok: false, ready: false, status: 'attention',
        contract: 'supermega_supabase_rehearsal_preflight_v1',
        checks: { private_schema_absent: false, backend_role_absent: false },
        failed_checks: ['backend_role_absent', 'private_schema_absent'],
        production_mutated: false,
        supabase_mutated: false,
      }),
      stderr: '',
    }
    const stub = makeExec({ url_preflight: nonCleanPreflight })
    const result = await expectFailure('rehearsal_clean_target_required', {
      env, exec: stub.exec, evidenceRoot: evidencePath('non-clean-target'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_non_clean_target_applied_migration')
    if (result.productionMutated !== false) throw new Error('self_test_non_clean_target_controls_failed')
  }

  // 6. A reviewed-commit blob that disagrees with the packet fails closed.
  {
    const stub = makeExec({
      reviewedBlob: (_call, sourcePath) => ({
        status: 0,
        stdout: sourcePath.includes('_v9_')
          ? `${readFileSync(resolve(root, sourcePath), 'utf8')}-- tampered\n`
          : readFileSync(resolve(root, sourcePath), 'utf8'),
        stderr: '',
      }),
    })
    await expectFailure('rehearsal_packet_invalid_or_stale', {
      env, exec: stub.exec, evidenceRoot: evidencePath('tampered'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_tampered_digest_applied_migration')
  }

  // An extra managed migration in the reviewed tree cannot be silently skipped.
  {
    const stub = makeExec({
      reviewed_migration_inventory: {
        status: 0,
        stdout: `${EXPECTED_MIGRATIONS.join('\n')}\n20260805000000_private_trial_backend_v11_unreviewed.sql\n`,
        stderr: '',
      },
    })
    await expectFailure('rehearsal_packet_invalid_or_stale', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('extra-managed-migration'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_extra_migration_reached_psql')
  }

  // 7. A mid-run failure stops the sequence and cannot be resumed locally.
  {
    let v9Attempts = 0
    const failingV9 = () => {
      v9Attempts += 1
      return v9Attempts === 1
        ? { status: 3, stdout: '', stderr: 'psql:...: ERROR: private trial backend v9 requires schema version 8' }
        : { status: 0, stdout: 'stubbed-ok', stderr: '' }
    }
    const stub = makeExec({ apply_migration_11: failingV9 })
    await expectFailure('step_failed_apply_migration_11', {
      env, exec: stub.exec, evidenceRoot: evidencePath('midrun'),
    })
    if (stub.calls.some((call) => call.stepId === 'apply_migration_12' || call.stepId === 'apply_quarantine')) {
      throw new Error('self_test_failure_did_not_stop_sequence')
    }
    const resumeStub = makeExec({ apply_migration_11: failingV9 })
    const resumed = await expectFailure('rehearsal_prior_attempt_requires_new_empty_branch', {
      env, exec: resumeStub.exec, evidenceRoot: evidencePath('midrun'),
    })
    if (resumed.resumable !== false || resumeStub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_midrun_resume_failed_closed')
    }
  }

  // 8. Credential material in captured tool output is redacted, never stored.
  {
    cases += 1
    const leakyValidator = {
      status: 0,
      stdout: `{"ok": true, "contract": "supermega_private_trial_database_v10", "leak": "postgresql://user:secret@db.example.com/postgres"}`,
      stderr: '',
    }
    const stub = makeExec({ hosted_validator: leakyValidator })
    const result = await run({ env, exec: stub.exec, evidenceRoot: evidencePath('leak') })
    if (result.ok !== false || result.error !== 'rehearsal_evidence_credential_detected') {
      throw new Error('self_test_leak_guard_failed')
    }
  }

  // 9. A valid but differently credentialed URL is unreviewed and rejected.
  {
    const stub = makeExec()
    await expectFailure('rehearsal_approval_connections_unreviewed', {
      env: {
        ...env,
        [RUNTIME_URL_ENV]: env[RUNTIME_URL_ENV].replace(
          ':runtime-password-selftest-001@',
          ':different-password-selftest-999@',
        ),
      },
      exec: stub.exec,
      evidenceRoot: evidencePath('unreviewed-url'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_unreviewed_url_reached_psql')
  }

  // 10. Privileged runtime credentials are rejected before any tool call.
  {
    const stub = makeExec()
    await expectFailure('runtime_privileged_credentials_rejected', {
      env: {
        ...env,
        [RUNTIME_URL_ENV]: env[URL_ENV],
      },
      exec: stub.exec,
      evidenceRoot: evidencePath('privileged-runtime'),
    })
    if (stub.calls.length !== 0) throw new Error('self_test_privileged_runtime_reached_execution')
  }

  // 11. An approval that permits production data is invalid even for preview.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.branch.startsWithProductionData = true
    const productionDataApprovalPath = privateJsonPath('approval-production-data')
    writeFileSync(productionDataApprovalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_branch_boundary_invalid', {
      env: { ...env, [APPROVAL_ENV]: productionDataApprovalPath },
      exec: stub.exec,
      evidenceRoot: evidencePath('production-data-approval'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_production_data_approval_reached_psql')
  }

  // 12. An expired approval cannot resume or start a hosted rehearsal.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.expiresAt = '2026-08-12T15:59:30.000Z'
    const expiredApprovalPath = privateJsonPath('approval-expired')
    writeFileSync(expiredApprovalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_expired_or_window_invalid', {
      env: { ...env, [APPROVAL_ENV]: expiredApprovalPath },
      exec: stub.exec,
      evidenceRoot: evidencePath('expired-approval'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_expired_approval_reached_psql')
  }

  // 13. Production ref as the target fails closed offline.
  {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const productionRef = manifest.supermega.productionSupabaseProjectRef
    const stub = makeExec()
    await expectFailure('rehearsal_target_is_production', {
      env: {
        ...env,
        [REF_ENV]: productionRef,
        [URL_ENV]: `postgresql://postgres:stub@db.${productionRef}.supabase.co:5432/postgres?sslmode=verify-full`,
      },
      exec: stub.exec,
      evidenceRoot: evidencePath('production-ref'),
    })
    if (stub.calls.length !== 0) throw new Error('self_test_production_ref_reached_execution')
  }

  // 14. URL binding rejects the transaction pooler and parameter smuggling.
  cases += 2
  for (const [badUrl, code] of [
    [`postgresql://postgres.previewbranchzzzz001:x@aws-0-x.pooler.supabase.com:6543/postgres?sslmode=verify-full`, 'rehearsal_transaction_pooler_not_for_migrations'],
    [`postgresql://postgres:x@db.previewbranchzzzz001.supabase.co:5432/postgres?sslmode=verify-full&options=x`, 'rehearsal_connection_parameter_not_allowed'],
  ]) {
    try {
      parsePreviewDatabaseUrl(badUrl, { expectedProjectRef: 'previewbranchzzzz001', productionProjectRef: 'z'.repeat(20) })
      throw new Error(`self_test_url_binding_missed_${code}`)
    } catch (error) {
      if (error?.rehearsalCode !== code) throw error
    }
  }

  // 15. The checked-in unconfigured trust root cannot authorize any provider read or write.
  {
    cases += 1
    const stub = makeExec()
    const unconfiguredPolicy = JSON.parse(readFileSync(resolve(root, AUTHORITY_PATH), 'utf8'))
    const result = await runRehearsalWithAuthority(
      { env, exec: stub.exec, log: silent, now: fixedNow, evidenceRoot: evidencePath('unconfigured-authority') },
      {
        authorityPolicy: unconfiguredPolicy,
        trustedRegisteredAuthorityDigest: null,
        fetchBranchObservation: async () => { throw new Error('unconfigured_authority_reached_provider') },
      },
    )
    if (result.error !== 'rehearsal_signing_authority_unconfigured' || stub.calls.length !== 0) {
      throw new Error('self_test_unconfigured_authority_failed_open')
    }
  }

  // 16. An operator-created approval cannot replace the registered owner signature.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.ownerSignature.value = Buffer.alloc(64).toString('base64')
    const path = privateJsonPath('approval-forged-owner')
    writeFileSync(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_owner_signature_invalid', {
      env: { ...env, [APPROVAL_ENV]: path }, exec: stub.exec, evidenceRoot: evidencePath('forged-owner'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_forged_owner_reached_psql')
  }

  // 17. Independent review is digest-bound and cannot be self-declared.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.independentReview.approvalDigest = `sha256:${'0'.repeat(64)}`
    const path = privateJsonPath('approval-forged-review')
    writeFileSync(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_independent_review_invalid', {
      env: { ...env, [APPROVAL_ENV]: path }, exec: stub.exec, evidenceRoot: evidencePath('forged-review'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_forged_review_reached_psql')
  }

  // 18. Owner and independent reviewer must be distinct digest-pinned keys.
  {
    cases += 1
    const collidingPolicy = structuredClone(fixture.policy)
    collidingPolicy.signers.independentReviewer = {
      ...collidingPolicy.signers.owner,
      role: 'independent_reviewer',
      status: 'independent_reviewer_policy_digest_pinned',
      keyId: 'rehearsal-reviewer-colliding-key',
    }
    collidingPolicy.sourceDigest = policyDigest(collidingPolicy)
    const stub = makeExec()
    const result = await runRehearsalWithAuthority(
      { env, exec: stub.exec, log: silent, now: fixedNow, evidenceRoot: evidencePath('colliding-keys') },
      {
        authorityPolicy: collidingPolicy,
        trustedRegisteredAuthorityDigest: collidingPolicy.sourceDigest,
        fetchBranchObservation: fixture.fetchBranchObservation,
      },
    )
    if (result.error !== 'rehearsal_authority_registered_state_not_owner_pinned' || stub.calls.length !== 0) {
      throw new Error('self_test_colliding_authority_failed_open')
    }
  }

  // A private key can never be smuggled into the tracked public-key policy.
  {
    cases += 1
    const keyPair = generateKeyPairSync('ed25519')
    const privateKeyPolicy = structuredClone(fixture.policy)
    privateKeyPolicy.signers.owner.publicKeyPem = keyPair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString()
    privateKeyPolicy.signers.owner.publicKeyFingerprint = publicKeyFingerprint(keyPair.publicKey)
    privateKeyPolicy.sourceDigest = policyDigest(privateKeyPolicy)
    try {
      validateRehearsalAuthorityPolicy(privateKeyPolicy, privateKeyPolicy.sourceDigest)
      throw new Error('self_test_private_key_policy_accepted')
    } catch (error) {
      if (error?.rehearsalCode !== 'rehearsal_authority_public_key_invalid') throw error
    }
  }

  // 19. The provider-authenticated creation receipt must prove an empty ephemeral branch.
  {
    cases += 1
    const stub = makeExec()
    const result = await runRehearsalWithAuthority(
      { env, exec: stub.exec, log: silent, now: fixedNow, evidenceRoot: evidencePath('branch-with-data') },
      {
        ...authorityContext,
        fetchBranchObservation: async () => ({ ...fixture.branchReceipt, withData: true }),
      },
    )
    if (result.error !== 'rehearsal_authenticated_branch_receipt_invalid'
      || stub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_branch_receipt_failed_open')
    }
  }

  // 20. Actual role attributes and memberships are checked before the first migration.
  {
    const privilegedReport = {
      status: 0,
      stdout: JSON.stringify(safeCredentialReport('supermega_trial_runtime', { noSuperuser: false })),
      stderr: '',
    }
    const stub = makeExec({ runtime_credential_preflight: privilegedReport })
    await expectFailure('runtime_privileged_credentials_rejected', {
      env, exec: stub.exec, evidenceRoot: evidencePath('runtime-role-attributes'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_role_attributes_reached_migration')
  }

  // A NOINHERIT/SET-only membership is still authority and fails closed.
  {
    const setRoleReport = {
      status: 0,
      stdout: JSON.stringify(safeCredentialReport('supermega_trial_runtime', {
        noRoleMemberships: false,
        noElevatedMembershipPath: false,
      })),
      stderr: '',
    }
    const stub = makeExec({ runtime_credential_preflight: setRoleReport })
    await expectFailure('runtime_privileged_credentials_rejected', {
      env, exec: stub.exec, evidenceRoot: evidencePath('runtime-set-role-path'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_set_role_path_reached_migration')
  }

  // Reviewed DDL cannot leave the Storage auditor with effective writes.
  {
    const postWriteReport = {
      status: 0,
      stdout: JSON.stringify(safeCredentialReport('supermega_storage_audit', {
        noTableWritePrivilege: false,
      })),
      stderr: '',
    }
    const stub = makeExec({ storage_audit_postmigration_credential_preflight: postWriteReport })
    await expectFailure('storage_audit_postmigration_privileged_credentials_rejected', {
      env, exec: stub.exec, evidenceRoot: evidencePath('storage-postmigration-write'),
    })
    if (stub.calls.some((call) => call.stepId === 'hosted_validator')) {
      throw new Error('self_test_storage_postmigration_write_reached_validator')
    }
  }

  // 21. The absolute branch deadline is rechecked after each provider action.
  {
    cases += 1
    let clock = new Date('2026-08-12T16:00:00.000Z')
    const nowAtClock = () => new Date(clock)
    const stub = makeExec({
      apply_migration_01: () => {
        clock = new Date('2026-08-13T15:30:00.000Z')
        return { status: 0, stdout: 'stubbed-ok', stderr: '' }
      },
    })
    const result = await runRehearsalWithAuthority(
      { env, exec: stub.exec, log: silent, now: nowAtClock, evidenceRoot: evidencePath('deadline-during-action') },
      authorityContext,
    )
    if (result.error !== 'rehearsal_branch_or_approval_deadline_reached'
      || !stub.calls.some((call) => call.stepId === 'apply_migration_01')
      || stub.calls.some((call) => call.stepId === 'apply_migration_02')) {
      throw new Error('self_test_action_deadline_failed_open')
    }
  }

  // Every persistent preview write is an exact signed action.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.authorizedActions = approval.authorizedActions.filter(
      (action) => action !== 'apply_packet_bound_public_browser_quarantine_to_preview',
    )
    const path = privateJsonPath('approval-missing-quarantine-action')
    writeFileSync(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_actions_invalid', {
      env: { ...env, [APPROVAL_ENV]: path },
      exec: stub.exec,
      evidenceRoot: evidencePath('missing-quarantine-action'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_unsigned_quarantine_reached_psql')
  }

  // CA and executable/source trust bytes are exact approval inputs.
  {
    const alternateCa = join(testRoot, 'alternate-ca.crt')
    writeExclusiveFile(alternateCa, Buffer.from('alternate-self-test-ca', 'utf8'))
    const stub = makeExec()
    await expectFailure('rehearsal_approval_trust_inputs_unreviewed', {
      env: { ...env, [CA_ENV]: alternateCa },
      exec: stub.exec,
      evidenceRoot: evidencePath('alternate-ca'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_alternate_ca_reached_psql')
  }
  {
    const stub = makeExec({
      reviewedBlob: (_call, sourcePath) => ({
        status: 0,
        stdout: sourcePath === TRUST_SOURCE_PATHS.databaseValidator
          ? `${readFileSync(resolve(root, sourcePath), 'utf8')}# swapped\n`
          : readFileSync(resolve(root, sourcePath), 'utf8'),
        stderr: '',
      }),
    })
    await expectFailure('rehearsal_trusted_source_not_release_bound', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('trusted-source-drift'),
    })
  }
  for (const [name, path] of Object.entries(fixture.runtimeFixtureFiles)) {
    const original = readFileSync(path)
    writeFileSync(path, Buffer.concat([original, Buffer.from('-changed', 'utf8')]))
    const stub = makeExec()
    try {
      await expectFailure('rehearsal_approval_trust_inputs_unreviewed', {
        env,
        exec: stub.exec,
        evidenceRoot: evidencePath(`${name}-closure-drift`),
      })
    } finally {
      writeFileSync(path, original)
    }
    if (stub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error(`self_test_${name}_closure_drift_reached_psql`)
    }
  }
  {
    const path = fixture.runtimeFixtureFiles.pythonPackagePath
    const original = readFileSync(path)
    const stub = makeExec({
      url_preflight: () => {
        writeFileSync(path, Buffer.concat([original, Buffer.from('-during-run', 'utf8')]))
        return { status: 0, stdout: fixture.cleanPreflight, stderr: '' }
      },
    })
    try {
      await expectFailure('python_runtime_changed', {
        env,
        exec: stub.exec,
        evidenceRoot: evidencePath('python-closure-mid-run-drift'),
      })
    } finally {
      writeFileSync(path, original)
    }
    if (stub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_python_mid_run_drift_reached_psql')
    }
  }
  {
    const path = fixture.runtimeFixtureFiles.postgresLibraryPath
    const original = readFileSync(path)
    const stub = makeExec({
      toolchain: () => {
        writeFileSync(path, Buffer.concat([original, Buffer.from('-during-run', 'utf8')]))
        return { status: 0, stdout: 'psql (PostgreSQL) 17.10', stderr: '' }
      },
    })
    try {
      await expectFailure('psql_runtime_changed', {
        env,
        exec: stub.exec,
        evidenceRoot: evidencePath('psql-closure-mid-run-drift'),
      })
    } finally {
      writeFileSync(path, original)
    }
    if (stub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_psql_mid_run_drift_reached_migration')
    }
  }

  // Bare decoded passwords and Storage secrets are rejected before evidence.
  {
    const stub = makeExec({
      runtime_credential_preflight: {
        status: 1,
        stdout: 'runtime-password-selftest-001',
        stderr: '',
      },
    })
    await expectFailure('rehearsal_child_output_contained_secret', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('decoded-password-output'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_secret_output_reached_psql')
  }
  {
    const leakedStorageSecret = env[STORAGE_PRIVACY_SECRET_ENV.at(-1)]
    const stub = makeExec({
      storage_privacy_preflight: { status: 1, stdout: leakedStorageSecret, stderr: '' },
    })
    await expectFailure('rehearsal_child_output_contained_secret', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('storage-secret-output'),
    })
  }

  // Report schemas reject unknown authority fields and incomplete successes.
  {
    const cleanReport = JSON.parse(fixture.cleanPreflight)
    cleanReport.productionWriteAuthorized = true
    const stub = makeExec({
      url_preflight: { status: 0, stdout: JSON.stringify(cleanReport), stderr: '' },
    })
    await expectFailure('rehearsal_clean_target_required', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('preflight-schema-smuggling'),
    })
  }
  {
    const catalogDrift = JSON.parse(fixture.cleanPreflight)
    catalogDrift.metadata_inventory.triggers.push([
      'storage', 'objects', 'unexpected_trigger', 'O', false,
      'storage.side_effect()', `sha256:${'9'.repeat(64)}`,
    ])
    catalogDrift.metadata_fingerprint_digest = objectDigest(catalogDrift.metadata_inventory)
    const stub = makeExec({
      url_preflight: { status: 0, stdout: JSON.stringify(catalogDrift), stderr: '' },
    })
    await expectFailure('rehearsal_clean_target_required', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('preflight-catalog-drift'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) {
      throw new Error('self_test_catalog_drift_reached_psql')
    }
  }
  {
    const stub = makeExec({
      hosted_validator: {
        status: 0,
        stdout: JSON.stringify({ ok: true, contract: 'supermega_private_trial_database_v10' }),
        stderr: '',
      },
    })
    await expectFailure('hosted_validator_report_invalid', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath('hosted-minimal-report'),
    })
  }

  // PostgreSQL 17 MAINTAIN and large-object creation are write authority.
  for (const [name, override] of [
    ['maintain-privilege', { noTableWritePrivilege: false }],
    ['large-object-create', { noLargeObjectCreationPrivilege: false }],
  ]) {
    const stub = makeExec({
      runtime_credential_preflight: {
        status: 0,
        stdout: JSON.stringify(safeCredentialReport('supermega_trial_runtime', override)),
        stderr: '',
      },
    })
    await expectFailure('runtime_privileged_credentials_rejected', {
      env,
      exec: stub.exec,
      evidenceRoot: evidencePath(name),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error(`self_test_${name}_reached_psql`)
  }

  // Private inputs and evidence are direct children of a plain .tmp root.
  cases += 2
  for (const [path, code] of [
    [join(testRoot, 'nested.json'), 'rehearsal_packet_file_must_be_temporary_direct_child'],
    [join(testRoot, 'nested-evidence'), 'rehearsal_evidence_root_must_be_temporary_direct_child'],
  ]) {
    try {
      if (path.endsWith('.json')) resolvePrivateJson(root, path, 'rehearsal_packet_file')
      else prepareEvidenceDirectory(root, path)
      throw new Error(`self_test_expected_${code}`)
    } catch (error) {
      if (error?.rehearsalCode !== code) throw error
    }
  }

  return {
    ok: true,
    contract: `${PREVIEW_REHEARSAL_CONTRACT}.self-test`,
    cases,
    networkRequestsPerformed: 0,
    childProcessesSpawned: 0,
    productionMutated: false,
  }
  } finally {
    const temporaryRoot = resolve(root, '.tmp')
    for (const entry of readdirSync(temporaryRoot)) {
      if (entry === fixture.testPrefix || entry.startsWith(`${fixture.testPrefix}-`)) {
        const target = resolve(temporaryRoot, entry)
        if (dirname(target) !== temporaryRoot) throw new Error('self_test_cleanup_target_invalid')
        const metadata = lstatSync(target)
        if (metadata.isSymbolicLink()) throw new Error('self_test_cleanup_target_invalid')
        rmSync(target, { recursive: true, force: true })
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) {
    runSelfTest()
      .then((report) => {
        console.log(JSON.stringify(report))
        process.exitCode = report.ok ? 0 : 1
      })
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: String(error?.message || 'self_test_failed').slice(0, 240) }))
        process.exitCode = 1
      })
  } else if (argv.includes('--capture-trust-inputs')) {
    try {
      if (argv.length !== 1) fail('rehearsal_arguments_invalid')
      console.log(JSON.stringify(captureExecutionTrust()))
    } catch (error) {
      console.error(JSON.stringify({
        ok: false,
        contract: 'supermega.preview-rehearsal-execution-trust.v1',
        error: String(error?.rehearsalCode || error?.message || 'trust_capture_failed').slice(0, 240),
        providerWritesPerformed: 0,
      }))
      process.exitCode = 1
    }
  } else {
    runRehearsal({ argv })
      .then((result) => {
        process.exitCode = result.exitCode
      })
      .catch((error) => {
        console.error(JSON.stringify({
          ok: false,
          contract: PREVIEW_REHEARSAL_CONTRACT,
          error: String(error?.rehearsalCode || error?.message || 'rehearsal_failed').slice(0, 240),
          productionMutated: false,
        }))
        process.exitCode = 1
      })
  }
}
