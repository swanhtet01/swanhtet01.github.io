import { createHash, randomBytes } from 'node:crypto'
import { lstat, open, readFile, realpath, rename, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const POSTGRES17_AUTHORITY_REQUEST_CONTRACT =
  'supermega.postgres17-authority-request.v1'

const SHA256 = /^[0-9a-f]{64}$/
const GIT_ID = /^[0-9a-f]{40}$/
const SESSION_ID = /^[0-9a-f]{32}$/
const NONCE = /^[0-9a-f]{64}$/
const MAX_LIFETIME_MS = 120_000
const MAX_REQUEST_BYTES = 32_768

function fail(code) {
  throw new Error(code)
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, keys) {
  return isObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

function canonicalAbsolutePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && isAbsolute(value)
    && resolve(value) === value
}

function childPath(root, candidate) {
  if (!canonicalAbsolutePath(root) || !canonicalAbsolutePath(candidate)) return false
  const child = relative(root, candidate)
  return child.length > 0 && child !== '..' && !child.startsWith(`..${sep}`)
    && !isAbsolute(child)
}

function exactSource(source) {
  return exactKeys(source, ['head', 'tree', 'implementationDigest'])
    && GIT_ID.test(source.head || '')
    && GIT_ID.test(source.tree || '')
    && /^sha256:[0-9a-f]{64}$/.test(source.implementationDigest || '')
}

function exactToolchain(toolchain) {
  return exactKeys(toolchain, [
    'profileId', 'manifestSha256', 'policyId', 'policySha256',
    'sourceArtifactSha256', 'materializationEvidenceSha256',
    'materializationInventorySha256', 'loadClosureEvidenceSha256',
    'executionBundleSha256',
  ])
    && typeof toolchain.profileId === 'string' && toolchain.profileId.length > 0
    && typeof toolchain.policyId === 'string' && toolchain.policyId.length > 0
    && Object.entries(toolchain).every(([key, value]) =>
      ['profileId', 'policyId'].includes(key) || SHA256.test(value || ''))
}

function exactExecution(execution) {
  if (!exactKeys(execution, [
    'archivePath', 'root', 'postgresBin', 'openssl', 'python', 'psycopg',
  ]) || !canonicalAbsolutePath(execution.archivePath)
    || !canonicalAbsolutePath(execution.root)) return false
  return ['postgresBin', 'openssl', 'python', 'psycopg']
    .every((key) => childPath(execution.root, execution[key]))
}

function exactMaterialization(materialization) {
  return exactKeys(materialization, ['firstRoot', 'secondRoot'])
    && canonicalAbsolutePath(materialization.firstRoot)
    && canonicalAbsolutePath(materialization.secondRoot)
    && materialization.firstRoot !== materialization.secondRoot
}

function exactParent(parent) {
  return exactKeys(parent, ['pid', 'executablePath', 'executableSha256'])
    && Number.isSafeInteger(parent.pid) && parent.pid > 0
    && canonicalAbsolutePath(parent.executablePath)
    && SHA256.test(parent.executableSha256 || '')
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

export function authorityRequestDigest(request) {
  return createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex')
}

export function buildPostgres17AuthorityRequest({
  source,
  toolchain,
  execution,
  materialization,
  parent,
  now = Date.now(),
  lifetimeMs = 60_000,
  sessionId = randomBytes(16).toString('hex'),
  nonce = randomBytes(32).toString('hex'),
}) {
  const request = {
    contract: POSTGRES17_AUTHORITY_REQUEST_CONTRACT,
    authoritative: false,
    sessionId,
    nonce,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + lifetimeMs).toISOString(),
    source,
    toolchain,
    materialization,
    execution,
    parent,
  }
  validatePostgres17AuthorityRequest(request, request, { now })
  if (execution.root !== materialization.firstRoot) {
    fail('database_rehearsal_authority_request_mismatch')
  }
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_REQUEST_BYTES) {
    fail('database_rehearsal_authority_request_invalid')
  }
  return request
}

export function validatePostgres17AuthorityRequest(request, expected, options = {}) {
  if (!exactKeys(request, [
    'contract', 'authoritative', 'sessionId', 'nonce', 'issuedAt', 'expiresAt',
    'source', 'toolchain', 'materialization', 'execution', 'parent',
  ])
    || request.contract !== POSTGRES17_AUTHORITY_REQUEST_CONTRACT
    || request.authoritative !== false
    || !SESSION_ID.test(request.sessionId || '')
    || !NONCE.test(request.nonce || '')
    || !exactSource(request.source)
    || !exactToolchain(request.toolchain)
    || !exactMaterialization(request.materialization)
    || !exactExecution(request.execution)
    || !exactParent(request.parent)
    || request.execution.root !== request.materialization.firstRoot) {
    fail('database_rehearsal_authority_request_invalid')
  }
  const issuedAt = Date.parse(request.issuedAt)
  const expiresAt = Date.parse(request.expiresAt)
  const now = options.now ?? Date.now()
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
    || expiresAt <= issuedAt || expiresAt - issuedAt > MAX_LIFETIME_MS
    || issuedAt > now + 5_000 || expiresAt < now) {
    fail('database_rehearsal_authority_request_stale')
  }
  if (!isObject(expected)
    || request.sessionId !== expected.sessionId
    || request.nonce !== expected.nonce
    || request.issuedAt !== expected.issuedAt
    || request.expiresAt !== expected.expiresAt
    || JSON.stringify(canonical(request.source)) !== JSON.stringify(canonical(expected.source))
    || JSON.stringify(canonical(request.toolchain)) !== JSON.stringify(canonical(expected.toolchain))
    || JSON.stringify(canonical(request.materialization))
      !== JSON.stringify(canonical(expected.materialization))
    || JSON.stringify(canonical(request.execution)) !== JSON.stringify(canonical(expected.execution))
    || JSON.stringify(canonical(request.parent)) !== JSON.stringify(canonical(expected.parent))) {
    fail('database_rehearsal_authority_request_mismatch')
  }
  return {
    sessionId: request.sessionId,
    nonce: request.nonce,
    digest: authorityRequestDigest(request),
    expiresAt: request.expiresAt,
    authoritative: false,
  }
}

export async function writePostgres17AuthorityRequest(path, request) {
  const parent = resolve(path, '..')
  if (!canonicalAbsolutePath(path) || await realpath(parent) !== parent) {
    fail('database_rehearsal_authority_request_path_invalid')
  }
  const metadata = await stat(parent)
  if (!metadata.isDirectory() || (metadata.mode & 0o077) !== 0) {
    fail('database_rehearsal_authority_request_directory_insecure')
  }
  const bytes = Buffer.from(`${JSON.stringify(canonical(request))}\n`, 'utf8')
  if (bytes.length > MAX_REQUEST_BYTES) fail('database_rehearsal_authority_request_invalid')
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

export async function claimPostgres17AuthorityRequest(path, expected, options = {}) {
  const parent = resolve(path, '..')
  if (!canonicalAbsolutePath(path) || await realpath(parent) !== parent) {
    fail('database_rehearsal_authority_request_path_invalid')
  }
  const before = await lstat(path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink()
    || await realpath(path) !== path
    || before.nlink !== 1n || (before.mode & 0o077n) !== 0n
    || before.size > BigInt(MAX_REQUEST_BYTES)) {
    fail('database_rehearsal_authority_request_file_insecure')
  }
  const sessionId = expected?.sessionId
  if (!SESSION_ID.test(sessionId || '')) fail('database_rehearsal_authority_request_invalid')
  const claimedPath = `${path}.claimed-${sessionId}`
  await rename(path, claimedPath)
  const after = await stat(claimedPath, { bigint: true })
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
    fail('database_rehearsal_authority_request_substituted')
  }
  let firstBytes, secondBytes, request
  try {
    firstBytes = await readFile(claimedPath)
    const stable = await stat(claimedPath, { bigint: true })
    secondBytes = await readFile(claimedPath)
    if (stable.dev !== after.dev || stable.ino !== after.ino || stable.size !== after.size
      || !firstBytes.equals(secondBytes)) {
      fail('database_rehearsal_authority_request_substituted')
    }
    request = JSON.parse(firstBytes.toString('utf8'))
  } catch (error) {
    if (String(error?.message || '').includes('authority_request_substituted')) throw error
    fail('database_rehearsal_authority_request_invalid')
  }
  const validation = validatePostgres17AuthorityRequest(request, expected, options)
  return { ...validation, claimedPath }
}
