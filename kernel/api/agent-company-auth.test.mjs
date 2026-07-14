import assert from 'node:assert/strict'
import { test } from 'node:test'

import { COMPANY_REQUEST_HEADER, COMPANY_SESSION_COOKIE } from '../agent-company-operator-auth.mjs'
import { handleAgentCompanyAuth } from './agent-company-auth.mjs'

const KEY = 'owner-secret'
const TOKEN = 'a'.repeat(43)
const ownerRequest = (body) => ({
  method: 'POST',
  headers: { 'x-ops-key': KEY },
  body,
})

test('only the owner key can issue a bounded operator code', async () => {
  const calls = []
  const issueCompanyOperatorCode = async (body) => {
    calls.push(body)
    return {
      ok: true,
      mode: 'company_sign_in_code_issue',
      oneTime: true,
      code: 'SM-1234-5678-9ABC',
      clientId: body.clientId,
      operatorId: body.operatorId,
      role: body.role,
      expiresAt: '2026-07-14T09:15:00.000Z',
      sessionHours: 8,
    }
  }
  const body = {
    action: 'issue-code',
    clientId: 'client-acme',
    operatorId: 'ops.alice',
    role: 'operator',
  }
  assert.equal((await handleAgentCompanyAuth({ ...ownerRequest(body), headers: {} }, { opsKey: KEY })).status, 401)
  const sessionAttempt = await handleAgentCompanyAuth({ ...ownerRequest(body), headers: {} }, {
    authorizeCompanyRequest: async () => ({
      ok: true,
      auth: { mode: 'session', clientId: 'client-acme', operatorId: 'ops.alice', role: 'operator' },
    }),
  })
  assert.equal(sessionAttempt.status, 403)
  const issued = await handleAgentCompanyAuth(ownerRequest(body), { opsKey: KEY, issueCompanyOperatorCode })
  assert.equal(issued.status, 200)
  assert.equal(issued.json.code, 'SM-1234-5678-9ABC')
  assert.deepEqual(calls, [{ clientId: 'client-acme', operatorId: 'ops.alice', role: 'operator' }])
})

test('only owner bootstrap access can list and revoke redacted tenant access', async () => {
  const calls = []
  const listCompanyAccess = async (body) => {
    calls.push(['list', body])
    return {
      ok: true,
      mode: 'company_access_list',
      complete: true,
      clientId: body.clientId,
      sessions: [{ accessId: `company-session:${'a'.repeat(40)}`, operatorId: 'ops.alice', role: 'operator' }],
      codes: [],
      counts: { sessions: 1, codes: 0 },
    }
  }
  const revokeCompanyAccess = async (body) => {
    calls.push(['revoke', body])
    return { ok: true, mode: 'company_access_revoke', ...body, replayed: false }
  }
  const listed = await handleAgentCompanyAuth(ownerRequest({
    action: 'list-access',
    clientId: 'client-acme',
  }), { opsKey: KEY, listCompanyAccess })
  assert.equal(listed.status, 200)
  assert.equal(listed.json.counts.sessions, 1)
  assert.doesNotMatch(JSON.stringify(listed.json), /sessionToken|tokenDigest|planHash|oneTimeCode/)

  const revoked = await handleAgentCompanyAuth(ownerRequest({
    action: 'revoke-access',
    clientId: 'client-acme',
    accessType: 'session',
    accessId: `company-session:${'a'.repeat(40)}`,
  }), { opsKey: KEY, revokeCompanyAccess })
  assert.equal(revoked.status, 200)
  assert.deepEqual(calls, [
    ['list', { clientId: 'client-acme' }],
    ['revoke', { clientId: 'client-acme', accessType: 'session', accessId: `company-session:${'a'.repeat(40)}` }],
  ])

  const sessionAttempt = await handleAgentCompanyAuth({
    method: 'POST',
    headers: { [COMPANY_REQUEST_HEADER]: '1' },
    body: { action: 'list-access', clientId: 'client-acme' },
  }, {
    authorizeCompanyRequest: async () => ({
      ok: true,
      auth: { mode: 'session', clientId: 'client-acme', operatorId: 'ops.alice', role: 'operator' },
    }),
  })
  assert.equal(sessionAttempt.status, 403)
  assert.equal(sessionAttempt.json.reason, 'owner_access_required')
})

test('code exchange returns only an HttpOnly cookie and public session metadata', async () => {
  const result = await handleAgentCompanyAuth({
    method: 'POST',
    headers: { [COMPANY_REQUEST_HEADER]: '1' },
    body: { action: 'exchange-code', code: 'SM-1234-5678-9ABC' },
  }, {
    now: () => '2026-07-14T09:00:00.000Z',
    exchangeCompanyOperatorCode: async () => ({
      ok: true,
      sessionToken: TOKEN,
      maxAgeSeconds: 3600,
      session: {
        mode: 'session',
        clientId: 'client-acme',
        operatorId: 'ops.alice',
        role: 'operator',
        issuedAt: '2026-07-14T09:00:00.000Z',
        expiresAt: '2026-07-14T10:00:00.000Z',
        allowedActions: ['*'],
      },
    }),
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.authenticated, true)
  assert.equal(JSON.stringify(result.json).includes(TOKEN), false)
  assert.match(result.cookie, new RegExp(`^${COMPANY_SESSION_COOKIE}=${TOKEN}`))
  assert.match(result.cookie, /HttpOnly/)
  assert.match(result.cookie, /SameSite=Strict/)

  const failed = await handleAgentCompanyAuth({
    method: 'POST',
    headers: { [COMPANY_REQUEST_HEADER]: '1' },
    body: { action: 'exchange-code', code: 'used' },
  }, {
    exchangeCompanyOperatorCode: async () => ({ ok: false, reason: 'company_sign_in_code_consumed' }),
  })
  assert.equal(failed.status, 401)
  assert.deepEqual(failed.json, { ok: false, reason: 'sign_in_failed' })
})

test('session read and sign-out are metadata-only and clear the cookie', async () => {
  const auth = {
    mode: 'session',
    clientId: 'client-acme',
    operatorId: 'ops.alice',
    role: 'reviewer',
    expiresAt: '2026-07-14T10:00:00.000Z',
  }
  const current = await handleAgentCompanyAuth({ method: 'GET', headers: { cookie: `${COMPANY_SESSION_COOKIE}=${TOKEN}` } }, {
    authorizeCompanyRequest: async () => ({ ok: true, auth }),
  })
  assert.deepEqual(current, { status: 200, json: { ok: true, authenticated: true, auth } })

  const signedOutRead = await handleAgentCompanyAuth({ method: 'GET', headers: {} }, {
    authorizeCompanyRequest: async () => ({ ok: false, reason: 'unauthorized' }),
  })
  assert.deepEqual(signedOutRead, {
    status: 200,
    json: { ok: true, authenticated: false, auth: null },
  })

  const staleSession = await handleAgentCompanyAuth({
    method: 'GET',
    headers: { cookie: `${COMPANY_SESSION_COOKIE}=${TOKEN}` },
  }, {
    authorizeCompanyRequest: async () => ({ ok: false, reason: 'company_session_expired' }),
  })
  assert.equal(staleSession.status, 200)
  assert.equal(staleSession.json.authenticated, false)
  assert.match(staleSession.cookie, /Max-Age=0/)

  const wrongOwner = await handleAgentCompanyAuth({ method: 'GET', headers: { 'x-ops-key': 'wrong' } }, {
    authorizeCompanyRequest: async () => ({ ok: false, reason: 'unauthorized' }),
  })
  assert.equal(wrongOwner.status, 401)

  const revoked = []
  const signedOut = await handleAgentCompanyAuth({
    method: 'DELETE',
    headers: { cookie: `${COMPANY_SESSION_COOKIE}=${TOKEN}`, [COMPANY_REQUEST_HEADER]: '1' },
  }, {
    revokeCompanyOperatorSession: async (input) => { revoked.push(input); return { ok: true } },
  })
  assert.equal(signedOut.status, 200)
  assert.deepEqual(revoked, [{ token: TOKEN }])
  assert.match(signedOut.cookie, /Max-Age=0/)
  assert.equal((await handleAgentCompanyAuth({ method: 'DELETE', headers: {} })).status, 403)
  assert.equal((await handleAgentCompanyAuth({ method: 'PATCH' })).status, 405)
})

test('isolated deployments refuse owner-issued codes for another tenant', async () => {
  const result = await handleAgentCompanyAuth(ownerRequest({
    action: 'issue-code',
    clientId: 'client-other',
    operatorId: 'ops.alice',
    role: 'viewer',
  }), {
    opsKey: KEY,
    clientId: 'client-acme',
    issueCompanyOperatorCode: async () => ({ ok: true }),
  })
  assert.equal(result.status, 403)
  assert.equal(result.json.reason, 'company_client_mismatch')
})
