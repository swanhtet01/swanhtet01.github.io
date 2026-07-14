import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  authorizeCompanyRequest,
  buildCompanySessionCookie,
  clearCompanySessionCookie,
  COMPANY_REQUEST_HEADER,
  COMPANY_SESSION_COOKIE,
  companyRoleActions,
  companyRoleAllows,
  exchangeCompanyOperatorCode,
  getCompanyOperatorSession,
  issueCompanyOperatorCode,
  listCompanyAccess,
  revokeCompanyAccess,
  revokeCompanyOperatorSession,
} from './agent-company-operator-auth.mjs'

const START = '2026-07-14T09:00:00.000Z'

function harness() {
  const cache = new Map()
  const claims = new Map()
  const released = []
  let randomSeed = 3
  let now = START
  const options = {
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, randomSeed++),
    claimActivity: async (activity) => {
      if (claims.has(activity.id)) return { fresh: false, durable: true }
      claims.set(activity.id, structuredClone(activity))
      return { fresh: true, durable: true }
    },
    releaseActivityClaim: async (id) => {
      released.push(id)
      return claims.delete(id)
    },
    putRecord: async (key, record) => {
      cache.set(key, structuredClone(record))
      return true
    },
    getRecord: async (key) => structuredClone(cache.get(key) || null),
    listRecords: async ({ prefix, clientId = '', status = '', expiresAfter = '', limit = 200 }) => {
      let records = [...cache.entries()]
        .map(([key, payload]) => ({ key, payload: structuredClone(payload) }))
        .filter((record) => record.key.startsWith(prefix))
      if (clientId) records = records.filter((record) => record.payload.clientId === clientId)
      if (status) records = records.filter((record) => record.payload.status === status)
      if (expiresAfter) records = records.filter((record) => record.payload.expiresAt > expiresAfter)
      return { durable: true, records: records.slice(0, limit) }
    },
    transitionRecord: async (key, expected, next) => {
      const current = cache.get(key)
      if (!current
        || current.status !== expected.status
        || current.planHash !== expected.planHash
        || current.revision !== expected.revision) {
        return { updated: false, durable: true, reason: 'transition_conflict' }
      }
      cache.set(key, structuredClone(next))
      return { updated: true, durable: true }
    },
  }
  return {
    cache,
    claims,
    options,
    released,
    setNow: (value) => { now = value },
  }
}

const issueInput = (patch = {}) => ({
  clientId: 'client-acme',
  operatorId: 'ops.alice',
  role: 'operator',
  expiresInMinutes: 15,
  sessionHours: 8,
  ...patch,
})

test('owner issuance stores only a durable one-time code fingerprint', async () => {
  const state = harness()
  const issued = await issueCompanyOperatorCode(issueInput(), state.options)
  assert.equal(issued.ok, true)
  assert.match(issued.code, /^SM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
  assert.equal(issued.oneTime, true)
  assert.equal(issued.role, 'operator')
  assert.equal(state.cache.size, 1)
  assert.equal(state.claims.size, 1)
  const persisted = JSON.stringify([...state.cache.entries(), ...state.claims.entries()])
  assert.equal(persisted.includes(issued.code), false)
  assert.equal(persisted.includes(issued.code.replaceAll('-', '').slice(2)), false)
  assert.equal((await issueCompanyOperatorCode(issueInput({ role: 'owner' }), state.options)).reason, 'company_operator_invalid_role')
  assert.equal((await issueCompanyOperatorCode(issueInput({ expiresInMinutes: 61 }), state.options)).reason, 'company_sign_in_code_invalid_expiry')
  assert.equal((await issueCompanyOperatorCode({ ...issueInput(), secret: 'no' }, state.options)).reason, 'company_auth_unknown_field')
})

test('code exchange creates one durable HttpOnly session and rejects replay', async () => {
  const state = harness()
  const issued = await issueCompanyOperatorCode(issueInput({ role: 'reviewer' }), state.options)
  const exchanged = await exchangeCompanyOperatorCode({ code: issued.code }, state.options)
  assert.equal(exchanged.ok, true)
  assert.equal(exchanged.session.role, 'reviewer')
  assert.equal(exchanged.session.clientId, 'client-acme')
  assert.equal(exchanged.maxAgeSeconds, 8 * 3600)
  assert.match(exchanged.sessionToken, /^[A-Za-z0-9_-]{43}$/)
  const persisted = JSON.stringify([...state.cache.entries()])
  assert.equal(persisted.includes(exchanged.sessionToken), false)
  assert.equal((await exchangeCompanyOperatorCode({ code: issued.code }, state.options)).reason, 'company_sign_in_code_consumed')

  const found = await getCompanyOperatorSession({ token: exchanged.sessionToken }, state.options)
  assert.equal(found.ok, true)
  assert.equal(found.session.operatorId, 'ops.alice')
  assert.deepEqual(found.session.allowedActions, companyRoleActions('reviewer'))

  const cookie = buildCompanySessionCookie(exchanged.sessionToken, exchanged.maxAgeSeconds, state.options)
  assert.match(cookie, new RegExp(`^${COMPANY_SESSION_COOKIE}=`))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Strict/)
  assert.match(cookie, /Path=\//)
  assert.doesNotMatch(clearCompanySessionCookie(), /[A-Za-z0-9_-]{43}/)
})

test('tenant session authorization is cookie-bound, role-scoped, expiring, and revocable', async () => {
  const state = harness()
  const issued = await issueCompanyOperatorCode(issueInput({ role: 'viewer', sessionHours: 1 }), state.options)
  const exchanged = await exchangeCompanyOperatorCode({ code: issued.code }, state.options)
  const cookie = buildCompanySessionCookie(exchanged.sessionToken, exchanged.maxAgeSeconds, state.options).split(';')[0]
  const authorized = await authorizeCompanyRequest({ method: 'GET', headers: { cookie } }, state.options)
  assert.equal(authorized.ok, true)
  assert.equal(authorized.auth.clientId, 'client-acme')
  assert.equal(authorized.auth.role, 'viewer')
  assert.equal(companyRoleAllows('viewer', 'work-order-get'), true)
  assert.equal(companyRoleAllows('viewer', 'work-order-run'), false)
  assert.equal(companyRoleAllows('reviewer', 'work-order-evaluate'), true)
  assert.equal(companyRoleAllows('reviewer', 'work-order-run'), false)
  assert.equal(companyRoleAllows('operator', 'work-order-run'), true)
  assert.equal((await authorizeCompanyRequest({ method: 'POST', headers: { cookie } }, state.options)).reason, 'company_request_intent_required')
  assert.equal((await authorizeCompanyRequest({
    method: 'POST',
    headers: { cookie, [COMPANY_REQUEST_HEADER]: '1' },
  }, state.options)).ok, true)

  const revoked = await revokeCompanyOperatorSession({ token: exchanged.sessionToken }, state.options)
  assert.equal(revoked.ok, true)
  assert.equal((await getCompanyOperatorSession({ token: exchanged.sessionToken }, state.options)).reason, 'company_session_invalid')
  assert.equal((await revokeCompanyOperatorSession({ token: exchanged.sessionToken }, state.options)).replayed, true)

  const second = await issueCompanyOperatorCode(issueInput({ operatorId: 'ops.bob', sessionHours: 1 }), state.options)
  const secondSession = await exchangeCompanyOperatorCode({ code: second.code }, state.options)
  state.setNow('2026-07-14T10:00:01.000Z')
  assert.equal((await getCompanyOperatorSession({ token: secondSession.sessionToken }, state.options)).reason, 'company_session_expired')
})

test('owner access inventory is tenant-bound, complete, and redacts every credential and integrity field', async () => {
  const state = harness()
  const pending = await issueCompanyOperatorCode(issueInput({ operatorId: 'ops.pending', role: 'viewer' }), state.options)
  const sessionCode = await issueCompanyOperatorCode(issueInput({ operatorId: 'ops.active', role: 'reviewer' }), state.options)
  const exchanged = await exchangeCompanyOperatorCode({ code: sessionCode.code }, state.options)
  const otherTenant = await issueCompanyOperatorCode(issueInput({ clientId: 'client-other', operatorId: 'ops.other' }), state.options)

  const listed = await listCompanyAccess({ clientId: 'client-acme' }, state.options)
  assert.equal(listed.ok, true)
  assert.equal(listed.complete, true)
  assert.deepEqual(listed.counts, { sessions: 1, codes: 1 })
  assert.deepEqual(listed.sessions.map((entry) => [entry.operatorId, entry.role, entry.status]), [
    ['ops.active', 'reviewer', 'active'],
  ])
  assert.deepEqual(listed.codes.map((entry) => [entry.operatorId, entry.role, entry.status]), [
    ['ops.pending', 'viewer', 'pending'],
  ])
  assert.match(listed.sessions[0].accessId, /^company-session:[a-f0-9]{40}$/)
  assert.match(listed.codes[0].accessId, /^company-code:[a-f0-9]{40}$/)
  const serialized = JSON.stringify(listed)
  for (const secret of [pending.code, sessionCode.code, otherTenant.code, exchanged.sessionToken]) {
    assert.equal(serialized.includes(secret), false)
  }
  assert.doesNotMatch(serialized, /tokenDigest|codeDigest|planHash|sessionToken/)
  assert.equal((await listCompanyAccess({ clientId: 'client-other' }, state.options)).counts.codes, 1)
})

test('owner can revoke one pending code or session without crossing tenants, including a concurrent replay', async () => {
  const state = harness()
  const pending = await issueCompanyOperatorCode(issueInput({ operatorId: 'ops.pending' }), state.options)
  const sessionCode = await issueCompanyOperatorCode(issueInput({ operatorId: 'ops.active' }), state.options)
  const exchanged = await exchangeCompanyOperatorCode({ code: sessionCode.code }, state.options)
  const listed = await listCompanyAccess({ clientId: 'client-acme' }, state.options)
  const codeAccess = listed.codes[0]
  const sessionAccess = listed.sessions[0]

  const wrongTenant = await revokeCompanyAccess({
    clientId: 'client-other',
    accessType: 'session',
    accessId: sessionAccess.accessId,
  }, state.options)
  assert.equal(wrongTenant.ok, true)
  assert.equal(wrongTenant.replayed, true)
  assert.equal((await getCompanyOperatorSession({ token: exchanged.sessionToken }, state.options)).ok, true)

  const revokedCode = await revokeCompanyAccess({
    clientId: 'client-acme',
    accessType: 'code',
    accessId: codeAccess.accessId,
  }, state.options)
  assert.equal(revokedCode.ok, true)
  assert.equal(revokedCode.replayed, false)
  assert.equal((await exchangeCompanyOperatorCode({ code: pending.code }, state.options)).reason, 'company_sign_in_code_consumed')

  const revokedSession = await revokeCompanyAccess({
    clientId: 'client-acme',
    accessType: 'session',
    accessId: sessionAccess.accessId,
  }, state.options)
  assert.equal(revokedSession.ok, true)
  assert.equal(revokedSession.replayed, false)
  assert.equal((await getCompanyOperatorSession({ token: exchanged.sessionToken }, state.options)).reason, 'company_session_invalid')
  assert.equal((await revokeCompanyAccess({
    clientId: 'client-acme',
    accessType: 'session',
    accessId: sessionAccess.accessId,
  }, state.options)).replayed, true)

  const raceState = harness()
  await issueCompanyOperatorCode(issueInput({ operatorId: 'ops.race' }), raceState.options)
  const raceAccess = (await listCompanyAccess({ clientId: 'client-acme' }, raceState.options)).codes[0]
  const raceOptions = {
    ...raceState.options,
    transitionRecord: async (key, expected, next) => {
      const current = raceState.cache.get(key)
      raceState.cache.set(key, { ...current, status: 'revoked', revision: current.revision + 1, revokedAt: next.revokedAt })
      return { updated: false, durable: true, reason: 'transition_conflict' }
    },
  }
  const race = await revokeCompanyAccess({
    clientId: 'client-acme',
    accessType: 'code',
    accessId: raceAccess.accessId,
  }, raceOptions)
  assert.equal(race.ok, true)
  assert.equal(race.replayed, true)
})

test('owner access inventory fails closed on non-durable or integrity-invalid records', async () => {
  const state = harness()
  await issueCompanyOperatorCode(issueInput(), state.options)
  assert.equal((await listCompanyAccess({ clientId: 'client-acme' }, {
    ...state.options,
    listRecords: async () => ({ durable: false, records: [] }),
  })).reason, 'company_access_store_unavailable')

  const persisted = [...state.cache.values()][0]
  persisted.role = 'viewer'
  const corrupted = await listCompanyAccess({ clientId: 'client-acme' }, state.options)
  assert.equal(corrupted.reason, 'company_access_record_invalid')
  assert.equal((await revokeCompanyAccess({
    clientId: 'client-acme',
    accessType: 'session',
    accessId: 'bad',
  }, state.options)).reason, 'company_access_invalid_id')
})

test('owner key remains a separate bootstrap path and never falls through to a session', async () => {
  const state = harness()
  const owner = await authorizeCompanyRequest({ headers: { 'x-ops-key': 'owner-secret' } }, {
    ...state.options,
    opsKey: 'owner-secret',
    clientId: 'client-acme',
  })
  assert.equal(owner.ok, true)
  assert.deepEqual(owner.auth, {
    mode: 'owner',
    clientId: 'client-acme',
    operatorId: 'owner',
    role: 'owner',
    issuedAt: null,
    expiresAt: null,
    allowedActions: ['*'],
  })
  assert.equal((await authorizeCompanyRequest({ headers: { 'x-ops-key': 'wrong' } }, {
    ...state.options,
    opsKey: 'owner-secret',
  })).reason, 'unauthorized')
  assert.equal((await authorizeCompanyRequest({ headers: {} }, state.options)).reason, 'unauthorized')
})

test('stored tenant, role, and expiry metadata is integrity-checked before use', async () => {
  const inviteState = harness()
  const invite = await issueCompanyOperatorCode(issueInput({ role: 'viewer' }), inviteState.options)
  const inviteRecord = [...inviteState.cache.values()].find((record) => record.kind === 'agent_company_sign_in_code')
  inviteRecord.role = 'operator'
  assert.equal((await exchangeCompanyOperatorCode({ code: invite.code }, inviteState.options)).reason, 'company_sign_in_code_invalid')

  const sessionState = harness()
  const issued = await issueCompanyOperatorCode(issueInput({ role: 'reviewer' }), sessionState.options)
  const exchanged = await exchangeCompanyOperatorCode({ code: issued.code }, sessionState.options)
  const sessionRecord = [...sessionState.cache.values()].find((record) => record.kind === 'agent_company_operator_session')
  sessionRecord.clientId = 'client-other'
  assert.equal((await getCompanyOperatorSession({ token: exchanged.sessionToken }, sessionState.options)).reason, 'company_session_invalid')
})

test('issuance and exchange fail closed without durable claims or storage', async () => {
  const weakState = harness()
  const weakClaim = {
    ...weakState.options,
    claimActivity: async () => ({ fresh: true, durable: false }),
  }
  assert.equal((await issueCompanyOperatorCode(issueInput(), weakClaim)).reason, 'company_sign_in_code_store_unavailable')

  const state = harness()
  const issued = await issueCompanyOperatorCode(issueInput(), state.options)
  const sessionClaimFailure = {
    ...state.options,
    claimActivity: async (activity) => activity.kind === 'agent_company_operator_session'
      ? { fresh: false, durable: false }
      : state.options.claimActivity(activity),
  }
  assert.equal((await exchangeCompanyOperatorCode({ code: issued.code }, sessionClaimFailure)).reason, 'company_session_store_unavailable')
  assert.equal((await exchangeCompanyOperatorCode({ code: 'not-a-code' }, state.options)).reason, 'company_sign_in_code_invalid')
})
