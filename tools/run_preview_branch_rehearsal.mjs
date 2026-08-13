import { createHash, createPublicKey, generateKeyPairSync, sign as signBytes, verify as verifyBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
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
// absent, is resumable through a state file, fail-closes on the first
// failing step, and never accepts or prints credential values.

export const PREVIEW_REHEARSAL_CONTRACT = 'supermega.preview-branch-rehearsal.v2'
export const PREVIEW_REHEARSAL_APPROVAL_CONTRACT = 'supermega.preview-rehearsal-approval.v2'
export const PREVIEW_REHEARSAL_REVIEW_CONTRACT = 'supermega.preview-rehearsal-independent-review.v1'
export const PREVIEW_REHEARSAL_AUTHORITY_CONTRACT = 'supermega.preview-rehearsal-authority.v1'
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const WINDOW_HOURS = 24
const MINIMUM_EXECUTION_WINDOW_MINUTES = 180
const projectRefPattern = /^[a-z0-9]{20}$/
const commitPattern = /^[0-9a-f]{40}$/
const digestPattern = /^sha256:[0-9a-f]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const QUARANTINE_PATH = 'supabase/rehearsal/20260804_public_browser_quarantine.sql'
const PROBE_PATH = 'supabase/rehearsal/20260807_preview_session_revocation_probe.sql'
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
const LEAK_TOKENS = ['postgres://', 'postgresql://', 'sb_secret_', 'password=']
const PRIVILEGED_DATABASE_ROLES = new Set([
  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated',
  'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
  'pg_read_server_files', 'pg_write_server_files',
])
const REQUIRED_APPROVED_ACTIONS = [
  'apply_complete_source_migration_chain_to_preview',
  'run_preview_validation_and_rollback_only_probes',
]
const AUTHORITY_PATH = 'hq/readiness/supabase-preview-rehearsal-authority.json'
const AUTHORITY_APPROVAL_DOMAIN = 'supermega.preview-rehearsal-approval.v2\n'
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
  'auth_users_absent',
  'auth_sessions_absent',
  'storage_buckets_absent',
  'storage_objects_absent',
]
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
  const target = isAbsolute(value) ? resolve(value) : resolve(rootDir, value)
  const temporaryRoot = resolve(rootDir, '.tmp')
  if (target !== temporaryRoot && !target.startsWith(`${temporaryRoot}${sep}`)) fail(`${code}_must_be_temporary`)
  if (!target.toLowerCase().endsWith('.json') || !existsSync(target)) fail(`${code}_invalid`)
  return target
}

function validateExecutionApproval(approval, {
  now,
  releaseCommit,
  packetDigest,
  targetProjectRef,
  productionProjectRef,
  connectionDigests,
  policyState,
}) {
  if (!exactKeys(approval, [
    'contract', 'decision', 'approvalId', 'approvedAt', 'expiresAt',
    'releaseCommit', 'rehearsalPacketDigest', 'targetProjectRef', 'connectionDigests',
    'branch', 'authorizedActions', 'controls', 'ownerKeyFingerprint', 'ownerSignature',
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
  if (!exactKeys(approval.branch, [
    'parentProjectRef', 'name', 'projectRef', 'createdAt', 'deleteBy', 'creationReceiptDigest',
    'startsWithProductionData', 'maximumLifetimeHours', 'providerUsageChargesAcknowledged',
    'creationApproved', 'migrationApplicationApproved', 'deleteAfterEvidence',
  ])
    || approval.branch.parentProjectRef !== productionProjectRef
    || approval.branch.projectRef !== targetProjectRef
    || typeof approval.branch.name !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(approval.branch.name)
    || !digestPattern.test(approval.branch.creationReceiptDigest || '')
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
    actionDeadlineMs: Math.min(expiresAt, deleteBy),
  }
}

export function buildPlan() {
  const migrationSteps = EXPECTED_MIGRATIONS.map((name, index) => ({
    id: `apply_migration_${String(index + 1).padStart(2, '0')}`,
    kind: 'branch-mutation',
    estimateMinutes: 8,
    covers: ['ordered-migration-application-through-v10'],
    command: `psql --set ON_ERROR_STOP=1 --file ${MIGRATION_DIRECTORY}/${name}`,
  }))
  const steps = [
    { id: 'release_pin', kind: 'local', estimateMinutes: 1, covers: [], command: 'git status --porcelain && git rev-parse HEAD == origin/main' },
    { id: 'release_authority', kind: 'network-read', estimateMinutes: 3, covers: [], command: `verify ${PACKET_ENV}, digest-pinned owner/reviewer signatures in ${APPROVAL_ENV}, and a fresh authenticated branch receipt bind this clean origin/main commit, target, URL digests, creation time, and absolute deletion deadline` },
    { id: 'local_quarantine_guard', kind: 'local', estimateMinutes: 3, covers: ['public-browser-table-and-sequence-denial (local proof)'], command: 'node tools/verify_public_browser_quarantine.mjs' },
    { id: 'migration_inventory', kind: 'local', estimateMinutes: 1, covers: [], command: `verify exact packet digests for the public baseline and all eleven private migrations, plus quarantine and rollback-only probe` },
    { id: 'toolchain', kind: 'local', estimateMinutes: 1, covers: [], command: 'psql --version (major 17 required)' },
    { id: 'url_preflight', kind: 'network-read', estimateMinutes: 3, covers: ['hostname-verified-postgresql-17-preflight', 'clean-target-without-production-data'], command: `node tools/run_python_tool.mjs tools/validate_supermega_database_url.py --env-key ${URL_ENV} --rehearsal-preflight --expected-project-ref-env-key ${REF_ENV} --production-project-ref-env-key ${PRODUCTION_REF_ENV} --ssl-root-cert-env-key ${CA_ENV}` },
    { id: 'runtime_credential_boundary', kind: 'network-read', estimateMinutes: 3, covers: ['dedicated-unprivileged-runtime-and-storage-audit-logins'], command: `connect read-only with ${RUNTIME_URL_ENV} and ${STORAGE_AUDIT_URL_ENV}; prove exact identities, role attributes, memberships, TLS, and transaction mode without printing credentials` },
    { id: 'storage_privacy_preflight', kind: 'local', estimateMinutes: 2, covers: ['private-storage-isolation-proof (offline configuration preflight; live audit stays owner-gated)'], command: 'node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --preflight' },
    ...migrationSteps,
    { id: 'apply_quarantine', kind: 'branch-mutation', estimateMinutes: 10, covers: ['public-browser-table-and-sequence-denial', 'public-default-privilege-denial-for-postgres-and-supabase-admin', 'service-role-contact-path-retained'], command: `psql --set ON_ERROR_STOP=1 --file ${QUARANTINE_PATH}` },
    { id: 'hosted_validator', kind: 'network-read', estimateMinutes: 10, covers: ['read-only-v10-runtime-validator'], command: `node tools/run_python_tool.mjs tools/validate_supermega_database_url.py --env-key ${RUNTIME_URL_ENV} --storage-audit-env-key ${STORAGE_AUDIT_URL_ENV} --ensure-schema --require-ready` },
    { id: 'session_revocation_probe', kind: 'network-read', estimateMinutes: 5, covers: ['active-session-acceptance-and-revoked-session-denial'], command: `psql --set ON_ERROR_STOP=1 --file ${PROBE_PATH} (single transaction, ends in ROLLBACK)` },
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

function defaultExec({ argv, envOverrides, cwd, timeoutMs }) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
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

function resolvePsql(env, exec, rootDir) {
  const configured = String(env[POSTGRES_BIN_ENV] || '').trim()
  const psql = configured ? join(configured, process.platform === 'win32' ? 'psql.exe' : 'psql') : 'psql'
  const result = exec({ stepId: 'toolchain', argv: [psql, '--version'], envOverrides: {}, cwd: rootDir })
  if (result.status !== 0) fail('psql_unavailable')
  const match = /\s(\d+)(?:\.\d+)?/.exec(result.stdout || '')
  if (!match || Number(match[1]) !== 17) fail('psql_major_17_required')
  return { psql, versionOutput: String(result.stdout || '').trim() }
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
with login_role as (
  select * from pg_roles where rolname = current_user
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
  'transactionReadOnly', current_setting('transaction_read_only') = 'on',
  'tlsActive', coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false),
  'canLogin', coalesce((select rolcanlogin from login_role), false),
  'noSuperuser', coalesce((select not rolsuper from login_role), false),
  'noBypassRls', coalesce((select not rolbypassrls from login_role), false),
  'noCreateRole', coalesce((select not rolcreaterole from login_role), false),
  'noCreateDb', coalesce((select not rolcreatedb from login_role), false),
  'noReplication', coalesce((select not rolreplication from login_role), false),
  'noElevatedMembership', not exists (
    select 1 from login_role cross join elevated
    where login_role.oid <> elevated.oid
      and pg_has_role(login_role.oid, elevated.oid, 'USAGE')
  )
)::text;
rollback;`

function validateCredentialPreflightReport(report, expectedRole, purpose) {
  if (!exactKeys(report, [
    'contract', 'loginRole', 'sessionRoleStable', 'transactionReadOnly', 'tlsActive',
    'canLogin', 'noSuperuser', 'noBypassRls', 'noCreateRole', 'noCreateDb',
    'noReplication', 'noElevatedMembership',
  ])
    || report.contract !== 'supermega.preview-rehearsal-credential-preflight.v1'
    || report.loginRole !== expectedRole
    || Object.entries(report).some(([key, value]) => key !== 'contract' && key !== 'loginRole' && value !== true)) {
    fail(`${purpose}_privileged_credentials_rejected`)
  }
  return {
    loginRole: report.loginRole,
    sessionRoleStable: true,
    transactionReadOnly: true,
    tlsActive: true,
    canLogin: true,
    noSuperuser: true,
    noBypassRls: true,
    noCreateRole: true,
    noCreateDb: true,
    noReplication: true,
    noElevatedMembership: true,
  }
}

function readState(statePath, readFile) {
  try {
    return JSON.parse(readFile(statePath))
  } catch {
    return null
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
  readFileBytes = (path) => readFileSync(path),
} = {}, {
  authorityPolicy = null,
  trustedRegisteredAuthorityDigest = TRUSTED_REGISTERED_REHEARSAL_AUTHORITY_POLICY_DIGEST,
  fetchBranchObservation = defaultFetchBranchObservation,
} = {}) {
  const flags = new Set(argv)
  for (const flag of flags) {
    if (!['--dry-run', '--reset-state', '--self-test', '--capture-branch-receipt'].includes(flag)) fail('rehearsal_arguments_invalid')
  }

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
  let statePath = ''
  let state = null
  const saveState = () => {
    if (!state || !statePath) return
    const staged = `${statePath}.tmp`
    writeFileSync(staged, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(staged, statePath)
  }
  try {
  const expectedProjectRef = String(env[REF_ENV] || '').trim().toLowerCase()
  if (!projectRefPattern.test(expectedProjectRef)) fail('rehearsal_expected_project_ref_invalid')
  const caFile = String(env[CA_ENV] || '').trim()
  if (!caFile || !existsSync(caFile)) fail('rehearsal_ssl_root_certificate_missing')

  const manifest = JSON.parse(readFile(resolve(rootDir, 'package.json')))
  const productionProjectRef = String(manifest?.supermega?.productionSupabaseProjectRef || '')
  if (!projectRefPattern.test(productionProjectRef)) fail('rehearsal_production_ref_unconfigured')
  if (manifest?.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') fail('rehearsal_production_guard_invalid')
  if (expectedProjectRef === productionProjectRef) fail('rehearsal_target_is_production')
  const policy = authorityPolicy ?? JSON.parse(readFile(resolve(rootDir, AUTHORITY_PATH)))
  const policyState = validateRehearsalAuthorityPolicy(policy, trustedRegisteredAuthorityDigest)
  if (policy.state !== 'registered') fail('rehearsal_signing_authority_unconfigured')

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
  const secrets = [databaseUrl, connection.password, runtimeUrl, storageAuditUrl, managementToken]
    .map((value) => value.trim())
    .filter(Boolean)

  const startedAt = now()
  const releaseHead = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'rev-parse', 'HEAD'], envOverrides: {}, cwd: rootDir })
  if (releaseHead.status !== 0) fail('rehearsal_release_commit_unavailable')
  const releaseCommit = releaseHead.stdout.trim()
  if (!commitPattern.test(releaseCommit)) fail('rehearsal_release_commit_invalid')

  const packetPath = resolvePrivateJson(rootDir, env[PACKET_ENV], 'rehearsal_packet_file')
  let packet
  try {
    packet = JSON.parse(readFile(packetPath))
    await validateSupabaseRehearsalPacket(packet, {
      repositoryRoot: rootDir,
      expectedReleaseCommit: releaseCommit,
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
  for (const migration of migrations) {
    const digest = `sha256:${sha256(readFileBytes(resolve(rootDir, MIGRATION_DIRECTORY, migration.name)))}`
    if (migration.sha256 !== digest.slice(7)) fail('rehearsal_packet_migration_digest_mismatch')
    inventory[migration.name] = digest
  }
  const quarantineDigest = `sha256:${sha256(readFileBytes(resolve(rootDir, QUARANTINE_PATH)))}`
  if (packet.release?.browserQuarantine?.script?.path !== QUARANTINE_PATH
    || packet.release.browserQuarantine.script.sha256 !== quarantineDigest.slice(7)) {
    fail('rehearsal_packet_quarantine_digest_mismatch')
  }
  inventory[QUARANTINE_PATH] = quarantineDigest
  inventory[PROBE_PATH] = `sha256:${sha256(readFileBytes(resolve(rootDir, PROBE_PATH)))}`

  const connectionDigests = {
    administrative: `sha256:${sha256(databaseUrl)}`,
    runtime: `sha256:${sha256(runtimeUrl)}`,
    storageAudit: `sha256:${sha256(storageAuditUrl)}`,
  }
  const approvalPath = resolvePrivateJson(rootDir, env[APPROVAL_ENV], 'rehearsal_approval_file')
  let approval
  try {
    approval = JSON.parse(readFile(approvalPath))
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

  const resolvedEvidenceRoot = evidenceRoot
    ? (isAbsolute(evidenceRoot) ? evidenceRoot : resolve(rootDir, evidenceRoot))
    : resolve(rootDir, '.tmp', 'preview-branch-rehearsal')
  const temporaryRoot = resolve(rootDir, '.tmp')
  if (resolvedEvidenceRoot !== temporaryRoot && !resolvedEvidenceRoot.startsWith(`${temporaryRoot}${sep}`)) {
    fail('rehearsal_evidence_root_must_be_temporary')
  }
  runRoot = join(resolvedEvidenceRoot, fingerprint.slice(7, 19))
  statePath = join(runRoot, 'state.json')
  mkdirSync(runRoot, { recursive: true })
  if (flags.has('--reset-state')) rmSync(statePath, { force: true })
  state = readState(statePath, readFile)
  if (state && state.fingerprint !== fingerprint) fail('rehearsal_state_fingerprint_mismatch')
  if (!state) state = { contract: PREVIEW_REHEARSAL_CONTRACT, fingerprint, releaseCommit, targetProjectRef: expectedProjectRef, steps: {} }

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
    writeFileSync(evidenceFile, `${serialized}\n`, 'utf8')
    stepResults.push({ id, outcome, evidenceFile })
    if (outcome === 'ok') {
      state.steps[id] = { ok: true, completedAt: payload.recordedAt, digest: `sha256:${sha256(serialized)}` }
      saveState()
    }
    return payload
  }

  const runCommandStep = (id, argv, envOverrides, { requireExitZero = true } = {}) => {
    if (state.steps[id]?.ok) {
      stepResults.push({ id, outcome: 'skipped_already_complete' })
      return null
    }
    const remainingMs = assertActionWindow()
    const started = now()
    const result = exec({ stepId: id, argv, envOverrides, cwd: rootDir, timeoutMs: remainingMs })
    assertActionWindow()
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
    record(id, 'ok', detail)
    return { ...result, stdout, stderr }
  }

    // release_pin: every invocation, including a resume, must use the clean
    // reviewed bytes. Local resume state never waives this source check.
    const status = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'status', '--porcelain'], envOverrides: {}, cwd: rootDir })
    if (status.status !== 0 || status.stdout.trim()) {
      if (!state.steps.release_pin?.ok) record('release_pin', 'failed', { reason: 'rehearsal_checkout_dirty' })
      fail('rehearsal_checkout_dirty')
    }
    const originMain = exec({ stepId: 'release_pin', argv: ['git', '-C', rootDir, 'rev-parse', 'origin/main'], envOverrides: {}, cwd: rootDir })
    if (originMain.status !== 0 || originMain.stdout.trim() !== releaseCommit) {
      if (!state.steps.release_pin?.ok) record('release_pin', 'failed', { reason: 'rehearsal_head_not_origin_main_fetch_first' })
      fail('rehearsal_head_not_origin_main_fetch_first')
    }
    if (!state.steps.release_pin?.ok) {
      record('release_pin', 'ok', { releaseCommit, targetProjectRef: expectedProjectRef })
    } else {
      stepResults.push({ id: 'release_pin', outcome: 'skipped_already_complete' })
    }

    if (!state.steps.release_authority?.ok) {
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
    } else {
      stepResults.push({ id: 'release_authority', outcome: 'skipped_already_complete' })
    }

    runCommandStep('local_quarantine_guard', ['node', 'tools/verify_public_browser_quarantine.mjs'], {})

    // migration_inventory: bind every migration byte to the reviewed packet
    // before any hosted mutation. The chain starts with the public baseline,
    // then applies all eleven private migrations through v10.
    if (!state.steps.migration_inventory?.ok) {
      record('migration_inventory', 'ok', {
        migrationCount: EXPECTED_MIGRATION_COUNT,
        migrations: migrations.map((migration) => ({
          name: migration.name,
          packetDigest: `sha256:${migration.sha256}`,
        })),
        quarantineDigest: inventory[QUARANTINE_PATH],
        sessionRevocationProbeDigest: inventory[PROBE_PATH],
      })
    } else {
      stepResults.push({ id: 'migration_inventory', outcome: 'skipped_already_complete' })
    }

    assertActionWindow()
    const toolchain = resolvePsql(env, exec, rootDir)
    assertActionWindow()
    if (!state.steps.toolchain?.ok) record('toolchain', 'ok', { psqlVersion: sanitizeText(toolchain.versionOutput, secrets) })
    else stepResults.push({ id: 'toolchain', outcome: 'skipped_already_complete' })

    // url_preflight: require the clean target described by the reviewed packet.
    // A production schema mirror, existing private schema, or existing backend
    // role is rejected before any migration is handed to psql.
    if (!state.steps.url_preflight?.ok) {
      const preflightArgv = [
        'node', 'tools/run_python_tool.mjs', 'tools/validate_supermega_database_url.py',
        '--env-key', URL_ENV,
        '--rehearsal-preflight',
        '--expected-project-ref-env-key', REF_ENV,
        '--production-project-ref-env-key', PRODUCTION_REF_ENV,
        '--ssl-root-cert-env-key', CA_ENV,
      ]
      const started = now()
      const remainingMs = assertActionWindow()
      const result = exec({
        stepId: 'url_preflight',
        argv: preflightArgv,
        envOverrides: { [PRODUCTION_REF_ENV]: productionProjectRef, [REF_ENV]: expectedProjectRef },
        cwd: rootDir,
        timeoutMs: remainingMs,
      })
      assertActionWindow()
      const report = lastJsonLine(sanitizeText(result.stdout, secrets))
      const detail = {
        argv: preflightArgv,
        exitCode: result.status,
        durationMs: now().getTime() - started.getTime(),
        report,
        stderr: sanitizeText(result.stderr, secrets).slice(0, 20000),
      }
      if (!report || report.contract !== 'supermega_supabase_rehearsal_preflight_v1') {
        record('url_preflight', 'failed', detail)
        fail('url_preflight_report_invalid')
      }
      const failed = Array.isArray(report.failed_checks) ? report.failed_checks : null
      if (report.ready !== true
        || report.status !== 'clean_target'
        || !failed
        || failed.length !== 0
        || REQUIRED_CLEAN_TARGET_CHECKS.some((check) => report.checks?.[check] !== true)
        || report.production_mutated !== false
        || report.supabase_mutated !== false) {
        record('url_preflight', 'failed', detail)
        fail('rehearsal_clean_target_required')
      }
      record('url_preflight', 'ok', { ...detail, baseline: 'clean-target-without-production-data' })
    } else {
      stepResults.push({ id: 'url_preflight', outcome: 'skipped_already_complete' })
    }

    // Re-run these authenticated read-only identity checks on every invocation,
    // including a resume. A role can be altered after local state was recorded.
    const credentialReports = {}
    for (const [purpose, boundedConnection] of [
      ['runtime', runtimeConnection],
      ['storage_audit', storageAuditConnection],
    ]) {
      const remainingMs = assertActionWindow()
      const result = exec({
        stepId: `${purpose}_credential_preflight`,
        argv: [
          toolchain.psql, '--no-psqlrc', '--no-password', '--tuples-only', '--no-align',
          '--set', 'ON_ERROR_STOP=1', '--command', CREDENTIAL_PREFLIGHT_SQL,
        ],
        envOverrides: psqlEnv(boundedConnection, caFile),
        cwd: rootDir,
        timeoutMs: remainingMs,
      })
      assertActionWindow()
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
    runCommandStep('storage_privacy_preflight', [
      'node', 'tools/run_python_tool.mjs', 'tools/verify_private_storage_privacy.py', '--preflight',
    ], {})

    // Apply the reviewed public baseline and all private migrations through
    // v10. Recheck the exact packet digest immediately before every psql call.
    const branchEnv = psqlEnv(connection, caFile)
    for (const [index, migration] of migrations.entries()) {
      const id = `apply_migration_${String(index + 1).padStart(2, '0')}`
      if (state.steps[id]?.ok) {
        stepResults.push({ id, outcome: 'skipped_already_complete' })
        continue
      }
      const bytes = readFileBytes(resolve(rootDir, MIGRATION_DIRECTORY, migration.name))
      if (sha256(bytes) !== migration.sha256) {
        fail(`migration_digest_mismatch_${String(index + 1).padStart(2, '0')}`)
      }
      runCommandStep(id, [
        toolchain.psql, '--no-psqlrc', '--no-password',
        '--set', 'ON_ERROR_STOP=1',
        '--file', resolve(rootDir, MIGRATION_DIRECTORY, migration.name),
      ], branchEnv)
    }

    runCommandStep('apply_quarantine', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', resolve(rootDir, QUARANTINE_PATH),
    ], branchEnv)

    // hosted_validator: read-only v10 contract via the prevalidated dedicated
    // runtime and Storage-audit logins.
    if (!state.steps.hosted_validator?.ok) {
      runCommandStep('hosted_validator', [
        'node', 'tools/run_python_tool.mjs', 'tools/validate_supermega_database_url.py',
        '--env-key', RUNTIME_URL_ENV,
        '--storage-audit-env-key', STORAGE_AUDIT_URL_ENV,
        '--ensure-schema', '--require-ready',
      ], {})
    } else {
      stepResults.push({ id: 'hosted_validator', outcome: 'skipped_already_complete' })
    }

    runCommandStep('session_revocation_probe', [
      toolchain.psql, '--no-psqlrc', '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--file', resolve(rootDir, PROBE_PATH),
    ], branchEnv)

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
    writeFileSync(evidencePacketPath, `${serialized}\n`, 'utf8')
    state.steps.evidence_packet = { ok: true, completedAt: evidencePacket.generatedAt, digest: `sha256:${sha256(serialized)}` }
    saveState()
    const summary = {
      ok: true,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'rehearsal_evidence_captured',
      evidencePacket: evidencePacketPath,
      stepsExecuted: stepResults.filter((step) => step.outcome === 'ok').length,
      stepsSkipped: stepResults.filter((step) => step.outcome === 'skipped_already_complete').length,
      productionMutated: false,
      nextAction: 'Founder evidence review, then preview-branch deletion (docs/rehearsal-runbook.md steps 8-9).',
    }
    log(JSON.stringify(summary))
    return { ...summary, packet: evidencePacket, runRoot, exitCode: 0 }
  } catch (error) {
    const code = error?.rehearsalCode || 'rehearsal_failed'
    saveState()
    const summary = {
      ok: false,
      contract: PREVIEW_REHEARSAL_CONTRACT,
      status: 'attention',
      error: code,
      failedAfterSteps: stepResults.filter((step) => step.outcome === 'ok').length,
      resumable: true,
      evidenceRoot: runRoot,
      productionMutated: false,
      hint: 'Fix the named failure and re-run; completed steps are skipped through the state file. Do not improvise: docs/rehearsal-runbook.md maps every failure code to its action.',
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
  const fixtureRef = 'previewbranchzzzz001'
  const releaseCommit = 'a'.repeat(40)
  const administrativeUrl = `postgresql://postgres:stub-password@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const runtimeUrl = `postgresql://supermega_trial_runtime:stub@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const storageAuditUrl = `postgresql://supermega_storage_audit:stub@db.${fixtureRef}.supabase.co:5432/postgres?sslmode=verify-full`
  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot: root,
    targetProjectRef: fixtureRef,
    releaseCommit,
    releaseReview: originMainReleaseReview(releaseCommit),
    generatedAt: '2026-08-12T16:00:00.000Z',
  })
  const authorityRoot = join(testRoot, 'authority')
  mkdirSync(authorityRoot, { recursive: true })
  const packetPath = join(authorityRoot, 'packet.json')
  const approvalPath = join(authorityRoot, 'approval.json')
  writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
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
    branch: {
      parentProjectRef,
      name: branchReceipt.name,
      projectRef: fixtureRef,
      createdAt: branchReceipt.createdAt,
      deleteBy: '2026-08-13T15:30:00.000Z',
      creationReceiptDigest: objectDigest(branchReceipt),
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
  writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
  const env = {
    [URL_ENV]: administrativeUrl,
    [REF_ENV]: fixtureRef,
    [CA_ENV]: resolve(root, 'package.json'),
    [RUNTIME_URL_ENV]: runtimeUrl,
    [STORAGE_AUDIT_URL_ENV]: storageAuditUrl,
    [PACKET_ENV]: packetPath,
    [APPROVAL_ENV]: approvalPath,
    [MANAGEMENT_TOKEN_ENV]: 'fixture-management-token-read-only-0001',
    ...Object.fromEntries(STORAGE_PRIVACY_ENV.map((key) => [key, 'fixture'])),
  }
  const cleanPreflight = JSON.stringify({
    ok: true,
    ready: true,
    status: 'clean_target',
    contract: 'supermega_supabase_rehearsal_preflight_v1',
    checks: Object.fromEntries(REQUIRED_CLEAN_TARGET_CHECKS.map((check) => [check, true])),
    failed_checks: [],
    mutation_statements_executed: 0,
    secret_values_exposed: false,
    production_mutated: false,
    supabase_mutated: false,
  })
  const makeExec = (overrides = {}, calls = []) => ({
    calls,
    exec(call) {
      calls.push({ stepId: call.stepId, argv: call.argv })
      if (overrides[call.stepId]) {
        const override = overrides[call.stepId]
        return typeof override === 'function' ? override(call) : override
      }
      if (call.argv[0] === 'git' && call.argv.includes('rev-parse')) return { status: 0, stdout: releaseCommit, stderr: '' }
      if (call.argv[0] === 'git' && call.argv.includes('status')) return { status: 0, stdout: '', stderr: '' }
      if (call.argv[1] === '--version') return { status: 0, stdout: 'psql (PostgreSQL) 17.10', stderr: '' }
      if (call.stepId?.endsWith('_credential_preflight')) {
        const loginRole = call.stepId.startsWith('runtime') ? 'supermega_trial_runtime' : 'supermega_storage_audit'
        return {
          status: 0,
          stdout: JSON.stringify({
            contract: 'supermega.preview-rehearsal-credential-preflight.v1',
            loginRole,
            sessionRoleStable: true,
            transactionReadOnly: true,
            tlsActive: true,
            canLogin: true,
            noSuperuser: true,
            noBypassRls: true,
            noCreateRole: true,
            noCreateDb: true,
            noReplication: true,
            noElevatedMembership: true,
          }),
          stderr: '',
        }
      }
      if (call.argv.includes('--rehearsal-preflight')) return { status: 0, stdout: cleanPreflight, stderr: '' }
      if (call.argv.includes('--require-ready')) return { status: 0, stdout: '{"ok": true, "contract": "supermega_private_trial_database_v10"}', stderr: '' }
      if (call.argv.includes('--preflight')) return { status: 0, stdout: '{"ok": true, "mode": "offline_configuration_preflight"}', stderr: '' }
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
    fetchBranchObservation: async () => structuredClone(branchReceipt),
  }
}

export async function runSelfTest() {
  const silent = () => {}
  const testRoot = resolve(root, '.tmp', 'preview-branch-rehearsal-self-test', `${process.pid}-${Date.now()}`)
  const fixture = await selfTestFixtures(testRoot)
  const { env, makeExec, approvalPath } = fixture
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
    if (plan.steps.length !== 24 || plan.totals.bufferMinutes <= 0 || plan.totals.plannedMinutes >= plan.totals.windowMinutes) {
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
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'happy'),
    })
    if (result.ok !== true || result.status !== 'rehearsal_evidence_captured' || result.exitCode !== 0) {
      throw new Error(`self_test_happy_path_failed_${result.error ?? ''}`)
    }
    const packetText = readFileSync(result.evidencePacket, 'utf8')
    assertNoCredential(packetText, 'self_test_packet_leaked_credential')
    if (packetText.includes('stub-password')) throw new Error('self_test_packet_leaked_password')
    const psqlFiles = stub.calls
      .filter((call) => call.argv.includes('--file'))
      .map((call) => call.argv[call.argv.indexOf('--file') + 1])
    const expectedOrder = [
      ...EXPECTED_MIGRATIONS.map((name) => resolve(root, MIGRATION_DIRECTORY, name)),
      resolve(root, QUARANTINE_PATH),
      resolve(root, PROBE_PATH),
    ]
    if (JSON.stringify(psqlFiles) !== JSON.stringify(expectedOrder)) throw new Error('self_test_step_order_failed')

    // 4. Resume skips every completed step: no psql or validator re-runs.
    cases += 1
    const resumeStub = makeExec()
    const resumed = await run({
      env, exec: resumeStub.exec, evidenceRoot: join(testRoot, 'happy'),
    })
    if (resumed.ok !== true || resumed.stepsSkipped < 22) throw new Error('self_test_resume_failed')
    if (!resumeStub.calls.some((call) => call.stepId === 'runtime_credential_preflight')
      || !resumeStub.calls.some((call) => call.stepId === 'storage_audit_credential_preflight')) {
      throw new Error('self_test_resume_skipped_fresh_credential_preflight')
    }
    if (resumeStub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_resume_reapplied_migration')

    // Resume state never waives the clean-checkout guard.
    const dirtyResumeStub = makeExec({
      release_pin: (call) => call.argv.includes('status')
        ? { status: 0, stdout: ' M tools/run_preview_branch_rehearsal.mjs', stderr: '' }
        : { status: 0, stdout: fixture.releaseCommit, stderr: '' },
    })
    const dirtyResume = await expectFailure('rehearsal_checkout_dirty', {
      env, exec: dirtyResumeStub.exec, evidenceRoot: join(testRoot, 'happy'),
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
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'non-clean-target'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_non_clean_target_applied_migration')
    if (result.productionMutated !== false) throw new Error('self_test_non_clean_target_controls_failed')
  }

  // 6. Tampered migration bytes fail closed before psql runs.
  {
    const stub = makeExec()
    const readFileBytes = (path) => {
      const bytes = readFileSync(path)
      if (String(path).includes('_v9_')) return Buffer.concat([bytes, Buffer.from('-- tampered\n')])
      return bytes
    }
    await expectFailure('rehearsal_packet_migration_digest_mismatch', {
      env, exec: stub.exec, readFileBytes, evidenceRoot: join(testRoot, 'tampered'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_tampered_digest_applied_migration')
  }

  // 7. A mid-run failure stops the sequence and resumes after the fix.
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
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'midrun'),
    })
    if (stub.calls.some((call) => call.stepId === 'apply_migration_12' || call.stepId === 'apply_quarantine')) {
      throw new Error('self_test_failure_did_not_stop_sequence')
    }
    cases += 1
    const resumeStub = makeExec({ apply_migration_11: failingV9 })
    const resumed = await run({ env, exec: resumeStub.exec, evidenceRoot: join(testRoot, 'midrun') })
    if (resumed.ok !== true) throw new Error('self_test_midrun_resume_failed')
    if (resumeStub.calls.some((call) => call.stepId === 'apply_migration_10' && call.argv.includes('--file'))) {
      throw new Error('self_test_midrun_resume_reapplied_prior_migration')
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
    const result = await run({ env, exec: stub.exec, evidenceRoot: join(testRoot, 'leak') })
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
        [RUNTIME_URL_ENV]: env[RUNTIME_URL_ENV].replace(':stub@', ':different@'),
      },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'unreviewed-url'),
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
      evidenceRoot: join(testRoot, 'privileged-runtime'),
    })
    if (stub.calls.length !== 0) throw new Error('self_test_privileged_runtime_reached_execution')
  }

  // 11. An approval that permits production data is invalid even for preview.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.branch.startsWithProductionData = true
    const productionDataApprovalPath = join(testRoot, 'authority', 'approval-production-data.json')
    writeFileSync(productionDataApprovalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_branch_boundary_invalid', {
      env: { ...env, [APPROVAL_ENV]: productionDataApprovalPath },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'production-data-approval'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_production_data_approval_reached_psql')
  }

  // 12. An expired approval cannot resume or start a hosted rehearsal.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.expiresAt = '2026-08-12T15:59:30.000Z'
    const expiredApprovalPath = join(testRoot, 'authority', 'approval-expired.json')
    writeFileSync(expiredApprovalPath, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_approval_expired_or_window_invalid', {
      env: { ...env, [APPROVAL_ENV]: expiredApprovalPath },
      exec: stub.exec,
      evidenceRoot: join(testRoot, 'expired-approval'),
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
      evidenceRoot: join(testRoot, 'production-ref'),
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
      { env, exec: stub.exec, log: silent, now: fixedNow, evidenceRoot: join(testRoot, 'unconfigured-authority') },
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
    const path = join(testRoot, 'authority', 'approval-forged-owner.json')
    writeFileSync(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_owner_signature_invalid', {
      env: { ...env, [APPROVAL_ENV]: path }, exec: stub.exec, evidenceRoot: join(testRoot, 'forged-owner'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_forged_owner_reached_psql')
  }

  // 17. Independent review is digest-bound and cannot be self-declared.
  {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    approval.independentReview.approvalDigest = `sha256:${'0'.repeat(64)}`
    const path = join(testRoot, 'authority', 'approval-forged-review.json')
    writeFileSync(path, `${JSON.stringify(approval, null, 2)}\n`, 'utf8')
    const stub = makeExec()
    await expectFailure('rehearsal_independent_review_invalid', {
      env: { ...env, [APPROVAL_ENV]: path }, exec: stub.exec, evidenceRoot: join(testRoot, 'forged-review'),
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
      { env, exec: stub.exec, log: silent, now: fixedNow, evidenceRoot: join(testRoot, 'colliding-keys') },
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
      { env, exec: stub.exec, log: silent, now: fixedNow, evidenceRoot: join(testRoot, 'branch-with-data') },
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
      stdout: JSON.stringify({
        contract: 'supermega.preview-rehearsal-credential-preflight.v1',
        loginRole: 'supermega_trial_runtime',
        sessionRoleStable: true,
        transactionReadOnly: true,
        tlsActive: true,
        canLogin: true,
        noSuperuser: false,
        noBypassRls: true,
        noCreateRole: true,
        noCreateDb: true,
        noReplication: true,
        noElevatedMembership: true,
      }),
      stderr: '',
    }
    const stub = makeExec({ runtime_credential_preflight: privilegedReport })
    await expectFailure('runtime_privileged_credentials_rejected', {
      env, exec: stub.exec, evidenceRoot: join(testRoot, 'runtime-role-attributes'),
    })
    if (stub.calls.some((call) => call.argv.includes('--file'))) throw new Error('self_test_role_attributes_reached_migration')
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
      { env, exec: stub.exec, log: silent, now: nowAtClock, evidenceRoot: join(testRoot, 'deadline-during-action') },
      authorityContext,
    )
    if (result.error !== 'rehearsal_branch_or_approval_deadline_reached'
      || !stub.calls.some((call) => call.stepId === 'apply_migration_01')
      || stub.calls.some((call) => call.stepId === 'apply_migration_02')) {
      throw new Error('self_test_action_deadline_failed_open')
    }
  }

  rmSync(testRoot, { recursive: true, force: true })
  return {
    ok: true,
    contract: `${PREVIEW_REHEARSAL_CONTRACT}.self-test`,
    cases,
    networkRequestsPerformed: 0,
    childProcessesSpawned: 0,
    productionMutated: false,
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
