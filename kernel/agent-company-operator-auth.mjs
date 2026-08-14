// Tenant-bound Agent Company operator sessions. The owner key can issue one-time codes,
// but it is never copied into an operator session or returned by this module.

import { usableOpsKey } from './ops-key.mjs'
import {
  createHash,
  randomBytes as cryptoRandomBytes,
  timingSafeEqual,
} from 'node:crypto'

import {
  claimActivity,
  getCachedResponse,
  listCachedResponseRecords,
  putCachedResponse,
  releaseActivityClaim,
  transitionCachedResponse,
} from './store.mjs'

export const COMPANY_SESSION_COOKIE = '__Host-supermega_company_session'
export const COMPANY_REQUEST_HEADER = 'x-supermega-company-request'
export const COMPANY_OPERATOR_ROLES = Object.freeze(['operator', 'reviewer', 'viewer', 'customer'])
export const DEFAULT_SIGN_IN_CODE_MINUTES = 15
export const MAX_SIGN_IN_CODE_MINUTES = 60
export const DEFAULT_OPERATOR_SESSION_HOURS = 8
export const MAX_OPERATOR_SESSION_HOURS = 12

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CLIENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const OPERATOR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,79}$/
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const SHA256_RE = /^[a-f0-9]{64}$/
const ISSUE_FIELDS = new Set(['clientId', 'operatorId', 'role', 'expiresInMinutes', 'sessionHours', 'scope'])
const EXCHANGE_FIELDS = new Set(['code'])
const SESSION_FIELDS = new Set(['token'])
const ACCESS_LIST_FIELDS = new Set(['clientId'])
const ACCESS_REVOKE_FIELDS = new Set(['clientId', 'accessType', 'accessId'])
const ACCESS_TYPES = new Set(['code', 'session'])
const MAX_ACTIVE_ACCESS_RECORDS = 200
const INVITE_KEY_PREFIX = 'agent-company-sign-in-code:'
const SESSION_KEY_PREFIX = 'agent-company-operator-session:'
const CODE_ACCESS_ID_RE = /^company-code:[a-f0-9]{40}$/
const SESSION_ACCESS_ID_RE = /^company-session:[a-f0-9]{40}$/
const CUSTOMER_REVIEW_SCOPE_KIND = 'work_order_review'
const WORK_ORDER_ID_RE = /^company-order:[a-f0-9]{40}$/

const VIEWER_ACTIONS = Object.freeze([
  'mission-get',
  'mission-list',
  'operations-report',
  'work-order-get',
  'work-order-list',
  'work-order-proof',
])
const REVIEWER_ACTIONS = Object.freeze([
  ...VIEWER_ACTIONS,
  'mission-stage-advance',
  'plan',
  'playbook-plan',
  'work-order-evaluate',
  'work-order-review',
])
const CUSTOMER_ACTIONS = Object.freeze([
  'work-order-get',
  'work-order-review',
])
const ROLE_ACTIONS = Object.freeze({
  customer: new Set(CUSTOMER_ACTIONS),
  reviewer: new Set(REVIEWER_ACTIONS),
  viewer: new Set(VIEWER_ACTIONS),
})

const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra })
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex')
const inviteKey = (digest) => `${INVITE_KEY_PREFIX}${digest}`
const sessionKey = (digest) => `${SESSION_KEY_PREFIX}${digest}`

function onlyFields(input, allowed, reason = 'company_auth_invalid_request') {
  if (!isRecord(input)) return failure(reason)
  const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort()
  return fields.length ? failure('company_auth_unknown_field', { fields }) : { ok: true }
}

function normalizeId(value, pattern, reason) {
  const normalized = String(value || '').trim()
  return pattern.test(normalized) ? normalized : failure(reason)
}

function boundedInteger(value, fallback, minimum, maximum, reason) {
  const normalized = value === undefined ? fallback : Number(value)
  return Number.isInteger(normalized) && normalized >= minimum && normalized <= maximum
    ? normalized
    : failure(reason, { minimum, maximum })
}

function nowDate(options = {}) {
  const date = new Date(options.now?.() ?? Date.now())
  return Number.isFinite(date.getTime()) ? date : null
}

function secureRandomBytes(size, options = {}) {
  try {
    const bytes = Buffer.from((options.randomBytes || cryptoRandomBytes)(size))
    return bytes.length === size ? bytes : null
  } catch {
    return null
  }
}

function generateCode(options = {}) {
  const bytes = secureRandomBytes(12, options)
  if (!bytes) return null
  const compact = [...bytes].map((value) => CODE_ALPHABET[value & 31]).join('')
  return `SM-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`
}

function normalizeCode(value) {
  let compact = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '')
  if (compact.startsWith('SM')) compact = compact.slice(2)
  compact = compact.replaceAll('O', '0').replace(/[IL]/g, '1')
  return compact.length === 12 && [...compact].every((character) => CODE_ALPHABET.includes(character))
    ? compact
    : null
}

function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left)).digest()
  const rightHash = createHash('sha256').update(String(right)).digest()
  return timingSafeEqual(leftHash, rightHash)
}

function normalizeCustomerScope(value) {
  if (!isRecord(value)) return failure('company_customer_scope_required')
  const fields = Object.keys(value).sort()
  if (fields.length !== 3 || fields.join(',') !== 'kind,resultHash,workOrderId') {
    return failure('company_customer_scope_invalid')
  }
  const kind = String(value.kind || '').trim()
  const workOrderId = String(value.workOrderId || '').trim()
  const resultHash = String(value.resultHash || '').trim()
  if (kind !== CUSTOMER_REVIEW_SCOPE_KIND
    || !WORK_ORDER_ID_RE.test(workOrderId)
    || !SHA256_RE.test(resultHash)) {
    return failure('company_customer_scope_invalid')
  }
  return { ok: true, scope: { kind, workOrderId, resultHash } }
}

function normalizeRoleScope(role, value) {
  if (role === 'customer') return normalizeCustomerScope(value)
  return value === undefined
    ? { ok: true, scope: null }
    : failure('company_customer_scope_forbidden')
}

function scopePlanFields(scope) {
  return scope ? ['scope', scope.kind, scope.workOrderId, scope.resultHash] : []
}

function canonicalIsoTime(value) {
  if (typeof value !== 'string') return Number.NaN
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
    ? date.getTime()
    : Number.NaN
}

function signInCodePlanHash(record) {
  return sha256([
    record.clientId,
    record.operatorId,
    record.role,
    record.issuedAt,
    record.expiresAt,
    record.sessionHours,
    ...scopePlanFields(record.scope),
  ].join('\n'))
}

function operatorSessionPlanHash(record) {
  return sha256([
    record.tokenDigest,
    record.clientId,
    record.operatorId,
    record.role,
    record.issuedAt,
    record.expiresAt,
    ...scopePlanFields(record.scope),
  ].join('\n'))
}

function validSignInCodeRecord(record) {
  if (!isRecord(record)
    || record.version !== 1
    || record.kind !== 'agent_company_sign_in_code'
    || !['active', 'consumed', 'revoked'].includes(record.status)
    || !Number.isInteger(record.revision)
    || record.revision < 1
    || !CLIENT_ID_RE.test(String(record.clientId || ''))
    || !OPERATOR_ID_RE.test(String(record.operatorId || ''))
    || !COMPANY_OPERATOR_ROLES.includes(record.role)
    || !Number.isInteger(record.sessionHours)
    || record.sessionHours < 1
    || record.sessionHours > MAX_OPERATOR_SESSION_HOURS
    || !SHA256_RE.test(String(record.planHash || ''))
    || !normalizeRoleScope(record.role, record.scope).ok) return false
  const issuedAt = canonicalIsoTime(record.issuedAt)
  const expiresAt = canonicalIsoTime(record.expiresAt)
  return Number.isFinite(issuedAt)
    && Number.isFinite(expiresAt)
    && expiresAt > issuedAt
    && safeEqual(record.planHash, signInCodePlanHash(record))
}

function validOperatorSessionRecord(record, tokenDigest) {
  if (!isRecord(record)
    || record.version !== 1
    || record.kind !== 'agent_company_operator_session'
    || !['active', 'revoked'].includes(record.status)
    || !Number.isInteger(record.revision)
    || record.revision < 1
    || !SHA256_RE.test(String(record.tokenDigest || ''))
    || record.tokenDigest !== tokenDigest
    || record.sessionId !== `company-session:${tokenDigest.slice(0, 40)}`
    || !CLIENT_ID_RE.test(String(record.clientId || ''))
    || !OPERATOR_ID_RE.test(String(record.operatorId || ''))
    || !COMPANY_OPERATOR_ROLES.includes(record.role)
    || !SHA256_RE.test(String(record.planHash || ''))
    || !normalizeRoleScope(record.role, record.scope).ok) return false
  const issuedAt = canonicalIsoTime(record.issuedAt)
  const expiresAt = canonicalIsoTime(record.expiresAt)
  return Number.isFinite(issuedAt)
    && Number.isFinite(expiresAt)
    && expiresAt > issuedAt
    && expiresAt - issuedAt <= MAX_OPERATOR_SESSION_HOURS * 3_600_000
    && safeEqual(record.planHash, operatorSessionPlanHash(record))
}

function headerValue(headers, name) {
  if (!isRecord(headers)) return ''
  const direct = headers[name]
  if (direct !== undefined) return String(Array.isArray(direct) ? direct[0] : direct)
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase())
  const value = match ? headers[match] : ''
  return String(Array.isArray(value) ? value[0] : value || '')
}

function publicSession(record) {
  return {
    mode: 'session',
    clientId: record.clientId,
    operatorId: record.operatorId,
    role: record.role,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    allowedActions: companyRoleActions(record.role),
    ...(record.scope ? { scope: { ...record.scope } } : {}),
  }
}

function storedRecordDigest(entry, prefix) {
  if (!isRecord(entry)) return null
  const key = String(entry.key || '')
  if (!key.startsWith(prefix)) return null
  const digest = key.slice(prefix.length)
  return SHA256_RE.test(digest) ? digest : null
}

function publicPendingCode(record, digest) {
  return {
    accessId: `company-code:${digest.slice(0, 40)}`,
    accessType: 'code',
    status: 'pending',
    clientId: record.clientId,
    operatorId: record.operatorId,
    role: record.role,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    sessionHours: record.sessionHours,
    ...(record.scope ? { scope: { ...record.scope } } : {}),
  }
}

function publicActiveSession(record) {
  return {
    accessId: record.sessionId,
    accessType: 'session',
    status: 'active',
    clientId: record.clientId,
    operatorId: record.operatorId,
    role: record.role,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    ...(record.scope ? { scope: { ...record.scope } } : {}),
  }
}

async function readStoredRecord(key, options = {}) {
  const read = options.getRecord || getCachedResponse
  try {
    return { ok: true, record: await read(key) }
  } catch {
    return failure('company_session_store_unavailable')
  }
}

async function saveStoredRecord(key, record, options = {}) {
  const save = options.putRecord || putCachedResponse
  try {
    return Boolean(await save(key, record))
  } catch {
    return false
  }
}

async function listStoredRecords(query, options = {}) {
  const list = options.listRecords || listCachedResponseRecords
  try {
    const result = await list(query)
    if (!isRecord(result) || !Array.isArray(result.records)) {
      return failure('company_access_store_unavailable')
    }
    if (options.requireDurableList !== false && result.durable !== true) {
      return failure('company_access_store_unavailable')
    }
    return { ok: true, records: result.records }
  } catch {
    return failure('company_access_store_unavailable')
  }
}

async function transitionStoredRecord(key, expected, record, options = {}) {
  const transition = options.transitionRecord || transitionCachedResponse
  try {
    const result = await transition(key, expected, record)
    return isRecord(result) ? result : { updated: false, durable: false, reason: 'store_unavailable' }
  } catch {
    return { updated: false, durable: false, reason: 'store_unavailable' }
  }
}

async function reserveDurableActivity(activity, options = {}) {
  const reserve = options.claimActivity || claimActivity
  try {
    return await reserve(activity)
  } catch {
    return { fresh: false, durable: false, reason: 'claim_store_unavailable' }
  }
}

async function releaseActivity(id, options = {}) {
  const release = options.releaseActivityClaim || releaseActivityClaim
  try { return await release(id) } catch { return false }
}

export function companyRoleActions(role) {
  if (role === 'owner' || role === 'operator') return ['*']
  return ROLE_ACTIONS[role] ? [...ROLE_ACTIONS[role]].sort() : []
}

export function companyRoleAllows(role, action) {
  if (role === 'owner' || role === 'operator') return true
  return Boolean(ROLE_ACTIONS[role]?.has(String(action || '')))
}

export function companySessionTokenFromHeaders(headers = {}) {
  const authorization = headerValue(headers, 'authorization').trim()
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim()
    if (SESSION_TOKEN_RE.test(token)) return token
  }
  const cookie = headerValue(headers, 'cookie')
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    const name = part.slice(0, separator).trim()
    if (name !== COMPANY_SESSION_COOKIE) continue
    try {
      const token = decodeURIComponent(part.slice(separator + 1).trim())
      return SESSION_TOKEN_RE.test(token) ? token : ''
    } catch {
      return ''
    }
  }
  return ''
}

export function companyRequestHasIntent(headers = {}) {
  return headerValue(headers, COMPANY_REQUEST_HEADER).trim() === '1'
}

export function buildCompanySessionCookie(token, maxAgeSeconds, options = {}) {
  if (!SESSION_TOKEN_RE.test(String(token || ''))) throw new Error('invalid_company_session_token')
  const maxAge = Number(maxAgeSeconds)
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > MAX_OPERATOR_SESSION_HOURS * 3600) {
    throw new Error('invalid_company_session_max_age')
  }
  const now = nowDate(options)
  if (!now) throw new Error('invalid_company_session_clock')
  const expires = new Date(now.getTime() + maxAge * 1000).toUTCString()
  return `${COMPANY_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Expires=${expires}; HttpOnly; Secure; SameSite=Strict; Priority=High`
}

export function clearCompanySessionCookie() {
  return `${COMPANY_SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict; Priority=High`
}

export async function issueCompanyOperatorCode(input, options = {}) {
  const fields = onlyFields(input, ISSUE_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, CLIENT_ID_RE, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const operatorId = normalizeId(input.operatorId, OPERATOR_ID_RE, 'company_operator_invalid_id')
  if (isRecord(operatorId)) return operatorId
  const role = String(input.role || '').trim().toLowerCase()
  if (!COMPANY_OPERATOR_ROLES.includes(role)) return failure('company_operator_invalid_role')
  const scoped = normalizeRoleScope(role, input.scope)
  if (!scoped.ok) return scoped
  const scope = scoped.scope
  const expiresInMinutes = boundedInteger(
    input.expiresInMinutes,
    DEFAULT_SIGN_IN_CODE_MINUTES,
    5,
    MAX_SIGN_IN_CODE_MINUTES,
    'company_sign_in_code_invalid_expiry',
  )
  if (isRecord(expiresInMinutes)) return expiresInMinutes
  const sessionHours = boundedInteger(
    input.sessionHours,
    DEFAULT_OPERATOR_SESSION_HOURS,
    1,
    MAX_OPERATOR_SESSION_HOURS,
    'company_session_invalid_expiry',
  )
  if (isRecord(sessionHours)) return sessionHours
  const now = nowDate(options)
  if (!now) return failure('company_auth_clock_invalid')
  const code = generateCode(options)
  if (!code) return failure('company_auth_random_unavailable')
  const compactCode = normalizeCode(code)
  const codeDigest = sha256(compactCode)
  const issuedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60_000).toISOString()
  const planHash = signInCodePlanHash({ clientId, operatorId, role, issuedAt, expiresAt, sessionHours, scope })
  const claimId = `company-sign-in-code:${codeDigest.slice(0, 40)}`
  const record = {
    version: 1,
    kind: 'agent_company_sign_in_code',
    status: 'active',
    revision: 1,
    planHash,
    clientId,
    operatorId,
    role,
    issuedAt,
    expiresAt,
    sessionHours,
    ...(scope ? { scope } : {}),
  }
  const claim = await reserveDurableActivity({
    id: claimId,
    kind: 'agent_company_sign_in_code',
    summary: `One-time ${role} access issued for ${operatorId}`,
    ref: clientId,
  }, options)
  if (!claim?.fresh || (options.requireDurableClaim !== false && !claim.durable)) {
    if (claim?.fresh) await releaseActivity(claimId, options)
    return failure('company_sign_in_code_store_unavailable', { status: 'blocked' })
  }
  const stored = await saveStoredRecord(inviteKey(codeDigest), record, options)
  if (!stored) {
    await releaseActivity(claimId, options)
    return failure('company_sign_in_code_store_unavailable', { status: 'blocked' })
  }
  return {
    ok: true,
    mode: 'company_sign_in_code_issue',
    oneTime: true,
    code,
    clientId,
    operatorId,
    role,
    issuedAt,
    expiresAt,
    sessionHours,
    ...(scope ? { scope: { ...scope } } : {}),
  }
}

export async function listCompanyAccess(input, options = {}) {
  const fields = onlyFields(input, ACCESS_LIST_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, CLIENT_ID_RE, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const now = nowDate(options)
  if (!now) return failure('company_auth_clock_invalid')
  const query = {
    clientId,
    status: 'active',
    expiresAfter: now.toISOString(),
    limit: MAX_ACTIVE_ACCESS_RECORDS + 1,
  }
  const codeRecords = await listStoredRecords({ ...query, prefix: INVITE_KEY_PREFIX }, options)
  if (!codeRecords.ok) return codeRecords
  const sessionRecords = await listStoredRecords({ ...query, prefix: SESSION_KEY_PREFIX }, options)
  if (!sessionRecords.ok) return sessionRecords
  if (codeRecords.records.length > MAX_ACTIVE_ACCESS_RECORDS
    || sessionRecords.records.length > MAX_ACTIVE_ACCESS_RECORDS) {
    return failure('company_access_limit_exceeded', { status: 'blocked' })
  }

  const codes = []
  for (const entry of codeRecords.records) {
    const digest = storedRecordDigest(entry, INVITE_KEY_PREFIX)
    const record = entry?.payload
    if (!digest
      || !validSignInCodeRecord(record)
      || record.status !== 'active'
      || record.clientId !== clientId
      || new Date(record.expiresAt).getTime() <= now.getTime()) {
      return failure('company_access_record_invalid', { status: 'blocked' })
    }
    codes.push(publicPendingCode(record, digest))
  }

  const sessions = []
  for (const entry of sessionRecords.records) {
    const digest = storedRecordDigest(entry, SESSION_KEY_PREFIX)
    const record = entry?.payload
    if (!digest
      || !validOperatorSessionRecord(record, digest)
      || record.status !== 'active'
      || record.clientId !== clientId
      || new Date(record.expiresAt).getTime() <= now.getTime()) {
      return failure('company_access_record_invalid', { status: 'blocked' })
    }
    sessions.push(publicActiveSession(record))
  }

  const newestFirst = (left, right) => String(right.issuedAt).localeCompare(String(left.issuedAt))
  codes.sort(newestFirst)
  sessions.sort(newestFirst)
  return {
    ok: true,
    mode: 'company_access_list',
    complete: true,
    clientId,
    sessions,
    codes,
    counts: { sessions: sessions.length, codes: codes.length },
  }
}

async function revokeStoredSession(record, options = {}) {
  if (!isRecord(record) || record.status !== 'active') return { updated: false, durable: true }
  const now = nowDate(options)
  const next = {
    ...record,
    status: 'revoked',
    revision: record.revision + 1,
    revokedAt: now?.toISOString() || record.expiresAt,
  }
  return transitionStoredRecord(sessionKey(record.tokenDigest), {
    status: record.status,
    planHash: record.planHash,
    revision: record.revision,
  }, next, options)
}

async function revokeStoredInvite(record, digest, options = {}) {
  if (!isRecord(record) || record.status !== 'active') return { updated: false, durable: true }
  const now = nowDate(options)
  const next = {
    ...record,
    status: 'revoked',
    revision: record.revision + 1,
    revokedAt: now?.toISOString() || record.expiresAt,
  }
  return transitionStoredRecord(inviteKey(digest), {
    status: record.status,
    planHash: record.planHash,
    revision: record.revision,
  }, next, options)
}

export async function exchangeCompanyOperatorCode(input, options = {}) {
  const fields = onlyFields(input, EXCHANGE_FIELDS)
  if (!fields.ok) return fields
  const compactCode = normalizeCode(input.code)
  if (!compactCode) return failure('company_sign_in_code_invalid')
  const codeDigest = sha256(compactCode)
  const readInvite = await readStoredRecord(inviteKey(codeDigest), options)
  if (!readInvite.ok) return readInvite
  const invite = readInvite.record
  if (!validSignInCodeRecord(invite)) {
    return failure('company_sign_in_code_invalid')
  }
  if (invite.status !== 'active') return failure('company_sign_in_code_consumed')
  const now = nowDate(options)
  if (!now) return failure('company_auth_clock_invalid')
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return failure('company_sign_in_code_expired')
  const tokenBytes = secureRandomBytes(32, options)
  if (!tokenBytes) return failure('company_auth_random_unavailable')
  const sessionToken = tokenBytes.toString('base64url')
  if (!SESSION_TOKEN_RE.test(sessionToken)) return failure('company_auth_random_unavailable')
  const tokenDigest = sha256(sessionToken)
  const sessionId = `company-session:${tokenDigest.slice(0, 40)}`
  const issuedAt = now.toISOString()
  const maxAgeSeconds = Number(invite.sessionHours) * 3600
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString()
  const planHash = operatorSessionPlanHash({
    tokenDigest,
    clientId: invite.clientId,
    operatorId: invite.operatorId,
    role: invite.role,
    issuedAt,
    expiresAt,
    scope: invite.scope,
  })
  const session = {
    version: 1,
    kind: 'agent_company_operator_session',
    status: 'active',
    revision: 1,
    planHash,
    sessionId,
    tokenDigest,
    clientId: invite.clientId,
    operatorId: invite.operatorId,
    role: invite.role,
    issuedAt,
    expiresAt,
    ...(invite.scope ? { scope: { ...invite.scope } } : {}),
  }
  const claim = await reserveDurableActivity({
    id: sessionId,
    kind: 'agent_company_operator_session',
    summary: `${invite.role} session opened for ${invite.operatorId}`,
    ref: invite.clientId,
  }, options)
  if (!claim?.fresh || (options.requireDurableClaim !== false && !claim.durable)) {
    if (claim?.fresh) await releaseActivity(sessionId, options)
    return failure('company_session_store_unavailable', { status: 'blocked' })
  }
  const sessionStored = await saveStoredRecord(sessionKey(tokenDigest), session, options)
  if (!sessionStored) {
    await releaseActivity(sessionId, options)
    return failure('company_session_store_unavailable', { status: 'blocked' })
  }
  const consumed = {
    ...invite,
    status: 'consumed',
    revision: invite.revision + 1,
    consumedAt: issuedAt,
    sessionId,
  }
  const transitioned = await transitionStoredRecord(inviteKey(codeDigest), {
    status: invite.status,
    planHash: invite.planHash,
    revision: invite.revision,
  }, consumed, options)
  if (!transitioned.updated || !transitioned.durable) {
    await revokeStoredSession(session, options)
    return failure(
      transitioned.reason === 'store_unavailable'
        ? 'company_session_store_unavailable'
        : 'company_sign_in_code_consumed',
      { status: transitioned.reason === 'store_unavailable' ? 'blocked' : 'conflict' },
    )
  }
  return {
    ok: true,
    mode: 'company_operator_session_exchange',
    sessionToken,
    maxAgeSeconds,
    session: publicSession(session),
  }
}

export async function getCompanyOperatorSession(input, options = {}) {
  const fields = onlyFields(input, SESSION_FIELDS)
  if (!fields.ok) return fields
  const token = String(input.token || '').trim()
  if (!SESSION_TOKEN_RE.test(token)) return failure('company_session_invalid')
  const read = await readStoredRecord(sessionKey(sha256(token)), options)
  if (!read.ok) return read
  const session = read.record
  const tokenDigest = sha256(token)
  if (!validOperatorSessionRecord(session, tokenDigest) || session.status !== 'active') {
    return failure('company_session_invalid')
  }
  const now = nowDate(options)
  if (!now) return failure('company_auth_clock_invalid')
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return failure('company_session_expired')
  return { ok: true, mode: 'company_operator_session_get', session: publicSession(session) }
}

export async function revokeCompanyOperatorSession(input, options = {}) {
  const fields = onlyFields(input, SESSION_FIELDS)
  if (!fields.ok) return fields
  const token = String(input.token || '').trim()
  if (!SESSION_TOKEN_RE.test(token)) return { ok: true, mode: 'company_operator_session_revoke', replayed: true }
  const read = await readStoredRecord(sessionKey(sha256(token)), options)
  if (!read.ok) return read
  const session = read.record
  const tokenDigest = sha256(token)
  if (!validOperatorSessionRecord(session, tokenDigest)) {
    return { ok: true, mode: 'company_operator_session_revoke', replayed: true }
  }
  if (session.status === 'revoked') {
    return { ok: true, mode: 'company_operator_session_revoke', replayed: true }
  }
  const transitioned = await revokeStoredSession(session, options)
  if (!transitioned.updated) {
    return failure('company_session_store_unavailable', { status: 'blocked' })
  }
  return { ok: true, mode: 'company_operator_session_revoke', replayed: false }
}

export async function revokeCompanyAccess(input, options = {}) {
  const fields = onlyFields(input, ACCESS_REVOKE_FIELDS)
  if (!fields.ok) return fields
  const clientId = normalizeId(input.clientId, CLIENT_ID_RE, 'company_invalid_client_id')
  if (isRecord(clientId)) return clientId
  const accessType = String(input.accessType || '').trim().toLowerCase()
  if (!ACCESS_TYPES.has(accessType)) return failure('company_access_invalid_type')
  const accessId = String(input.accessId || '').trim()
  const accessPattern = accessType === 'code' ? CODE_ACCESS_ID_RE : SESSION_ACCESS_ID_RE
  if (!accessPattern.test(accessId)) return failure('company_access_invalid_id')
  const shortDigest = accessId.slice(accessId.indexOf(':') + 1)
  const keyPrefix = accessType === 'code' ? INVITE_KEY_PREFIX : SESSION_KEY_PREFIX
  const listed = await listStoredRecords({
    prefix: `${keyPrefix}${shortDigest}`,
    clientId,
    limit: 2,
  }, options)
  if (!listed.ok) return listed
  if (listed.records.length === 0) {
    return { ok: true, mode: 'company_access_revoke', accessType, accessId, replayed: true }
  }
  if (listed.records.length !== 1) {
    return failure('company_access_record_invalid', { status: 'blocked' })
  }
  const entry = listed.records[0]
  const digest = storedRecordDigest(entry, keyPrefix)
  const record = entry?.payload
  const expectedAccessId = accessType === 'code'
    ? `company-code:${String(digest || '').slice(0, 40)}`
    : record?.sessionId
  const valid = accessType === 'code'
    ? validSignInCodeRecord(record)
    : validOperatorSessionRecord(record, digest)
  if (!digest || !valid || record.clientId !== clientId || expectedAccessId !== accessId) {
    return failure('company_access_record_invalid', { status: 'blocked' })
  }
  if (record.status === 'revoked') {
    return { ok: true, mode: 'company_access_revoke', accessType, accessId, replayed: true }
  }
  if (accessType === 'code' && record.status !== 'active') {
    return failure('company_access_conflict', { status: 'conflict' })
  }

  const transitioned = accessType === 'code'
    ? await revokeStoredInvite(record, digest, options)
    : await revokeStoredSession(record, options)
  if (transitioned.updated && transitioned.durable) {
    return { ok: true, mode: 'company_access_revoke', accessType, accessId, replayed: false }
  }
  if (!transitioned.durable) {
    return failure('company_access_store_unavailable', { status: 'blocked' })
  }

  const reread = await readStoredRecord(accessType === 'code' ? inviteKey(digest) : sessionKey(digest), options)
  if (!reread.ok) return failure('company_access_store_unavailable', { status: 'blocked' })
  const current = reread.record
  const currentValid = accessType === 'code'
    ? validSignInCodeRecord(current)
    : validOperatorSessionRecord(current, digest)
  if (currentValid && current.clientId === clientId && current.status === 'revoked') {
    return { ok: true, mode: 'company_access_revoke', accessType, accessId, replayed: true }
  }
  return failure('company_access_conflict', { status: 'conflict' })
}

export async function authorizeCompanyRequest(request = {}, options = {}) {
  const env = options.env || process.env
  const providedKey = headerValue(request.headers, 'x-ops-key').trim()
  if (providedKey) {
    const opsKey = usableOpsKey(options.opsKey ?? env.SUPERMEGA_OPS_KEY)
    if (!opsKey) return failure('ops_key_not_configured')
    if (!safeEqual(providedKey, opsKey)) return failure('unauthorized')
    const configuredClientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim() || null
    return {
      ok: true,
      auth: {
        mode: 'owner',
        clientId: configuredClientId,
        operatorId: 'owner',
        role: 'owner',
        issuedAt: null,
        expiresAt: null,
        allowedActions: ['*'],
      },
    }
  }
  const token = companySessionTokenFromHeaders(request.headers)
  if (!token) return failure('unauthorized')
  const method = String(request.method || '').trim().toUpperCase()
  if (method && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !companyRequestHasIntent(request.headers)) {
    return failure('company_request_intent_required')
  }
  const session = await getCompanyOperatorSession({ token }, options)
  return session.ok ? { ok: true, auth: session.session } : session
}

export default {
  authorizeCompanyRequest,
  buildCompanySessionCookie,
  clearCompanySessionCookie,
  companyRequestHasIntent,
  companyRoleActions,
  companyRoleAllows,
  companySessionTokenFromHeaders,
  exchangeCompanyOperatorCode,
  getCompanyOperatorSession,
  issueCompanyOperatorCode,
  listCompanyAccess,
  revokeCompanyAccess,
  revokeCompanyOperatorSession,
}
