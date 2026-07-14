// Owner-issued, one-time sign-in codes for tenant-bound Agent Company operators.

import {
  authorizeCompanyRequest,
  buildCompanySessionCookie,
  clearCompanySessionCookie,
  companyRequestHasIntent,
  companySessionTokenFromHeaders,
  exchangeCompanyOperatorCode,
  issueCompanyOperatorCode,
  revokeCompanyOperatorSession,
} from '../agent-company-operator-auth.mjs'

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function requestHeader(headers, name) {
  if (!isRecord(headers)) return ''
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase())
  const value = key ? headers[key] : ''
  return String(Array.isArray(value) ? value[0] : value || '').trim()
}

function statusFor(result) {
  if (result.ok) return 200
  if ([
    'company_session_store_unavailable',
    'company_sign_in_code_store_unavailable',
    'company_auth_random_unavailable',
    'company_auth_clock_invalid',
    'ops_key_not_configured',
  ].includes(result.reason)) return 503
  if (['unauthorized', 'company_session_invalid', 'company_session_expired', 'sign_in_failed'].includes(result.reason)) return 401
  if (result.reason === 'company_request_intent_required') return 403
  if (result.status === 'conflict') return 409
  return 400
}

function signInFailure(result) {
  if (result.ok) return result
  if ([
    'company_session_store_unavailable',
    'company_sign_in_code_store_unavailable',
    'company_auth_random_unavailable',
    'company_auth_clock_invalid',
  ].includes(result.reason)) {
    return result
  }
  return { ok: false, reason: 'sign_in_failed' }
}

export async function handleAgentCompanyAuth(request = {}, options = {}) {
  const method = String(request.method || '').toUpperCase()
  const authorize = options.authorizeCompanyRequest || authorizeCompanyRequest

  if (method === 'GET') {
    const authorized = await authorize(request, options)
    const ownerKeyProvided = Boolean(requestHeader(request.headers, 'x-ops-key'))
    const signedOut = !ownerKeyProvided && ['unauthorized', 'company_session_invalid', 'company_session_expired'].includes(authorized.reason)
    if (signedOut) {
      return {
        status: 200,
        json: { ok: true, authenticated: false, auth: null },
        ...(companySessionTokenFromHeaders(request.headers) ? { cookie: clearCompanySessionCookie() } : {}),
      }
    }
    return authorized.ok
      ? { status: 200, json: { ok: true, authenticated: true, auth: authorized.auth } }
      : { status: statusFor(authorized), json: { ok: false, reason: authorized.reason } }
  }

  if (method === 'DELETE') {
    if (!companyRequestHasIntent(request.headers)) {
      return { status: 403, json: { ok: false, reason: 'company_request_intent_required' } }
    }
    const token = companySessionTokenFromHeaders(request.headers)
    const revoke = options.revokeCompanyOperatorSession || revokeCompanyOperatorSession
    if (token) await revoke({ token }, options)
    return {
      status: 200,
      json: { ok: true, signedOut: true },
      cookie: clearCompanySessionCookie(),
    }
  }

  if (method !== 'POST') {
    return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }
  }
  const body = isRecord(request.body) ? { ...request.body } : {}
  const action = String(body.action || '').trim()
  delete body.action

  if (action === 'issue-code') {
    const authorized = await authorize(request, options)
    if (!authorized.ok) {
      return { status: statusFor(authorized), json: { ok: false, reason: authorized.reason } }
    }
    if (authorized.auth.mode !== 'owner') {
      return { status: 403, json: { ok: false, reason: 'owner_access_required' } }
    }
    const env = options.env || process.env
    const configuredClientId = String(options.clientId ?? env.SUPERMEGA_CLIENT_ID ?? '').trim()
    if (configuredClientId && String(body.clientId || '').trim() !== configuredClientId) {
      return { status: 403, json: { ok: false, reason: 'company_client_mismatch' } }
    }
    const issue = options.issueCompanyOperatorCode || issueCompanyOperatorCode
    const result = await issue(body, options)
    return { status: statusFor(result), json: result }
  }

  if (action === 'exchange-code') {
    if (!companyRequestHasIntent(request.headers)) {
      return { status: 403, json: { ok: false, reason: 'company_request_intent_required' } }
    }
    const exchange = options.exchangeCompanyOperatorCode || exchangeCompanyOperatorCode
    const result = signInFailure(await exchange(body, options))
    if (!result.ok) return { status: statusFor(result), json: result }
    let cookie
    try { cookie = buildCompanySessionCookie(result.sessionToken, result.maxAgeSeconds, options) }
    catch { return { status: 503, json: { ok: false, reason: 'company_session_cookie_unavailable' } } }
    return {
      status: 200,
      json: {
        ok: true,
        authenticated: true,
        session: result.session,
      },
      cookie,
    }
  }

  return { status: 400, json: { ok: false, reason: 'company_auth_invalid_action' } }
}

export default async function handler(req, res) {
  const result = await handleAgentCompanyAuth({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Vary', 'Cookie')
  if (result.cookie) res.setHeader('Set-Cookie', result.cookie)
  res.status(result.status).json(result.json)
}
