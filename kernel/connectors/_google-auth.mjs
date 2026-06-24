// Shared Google service-account auth for the data connectors (Sheets / Gmail / Calendar).
// Zero-dependency: signs a JWT with node:crypto (RS256 via the service-account private key),
// exchanges it for an OAuth2 access token at Google's token endpoint, and caches the token until
// just before it expires. No googleapis SDK — matches the kernel's fetch-only, dep-free style.
//
// Credentials (either form works; JSON wins if both are set):
//   GOOGLE_SERVICE_ACCOUNT_JSON   — the full service-account JSON (as a string), OR base64 of it.
//   GOOGLE_APPLICATION_CREDENTIALS — a filesystem path to that JSON (read lazily, only if needed).
//
// Optional:
//   GOOGLE_WORKSPACE_SUBJECT — a user email to impersonate via domain-wide delegation (Gmail/
//                              Calendar acting "as" a real mailbox). Omit for service-account-only.
//
// Public surface:
//   readServiceAccount()         -> { client_email, private_key, ... } | null   (no throw)
//   credsConfigured()            -> boolean                                       (cheap, no I/O)
//   getAccessToken(scopes, opts) -> Promise<string>                              (cached access token)
//   resetTokenCache()            -> void                                          (mostly for tests)

import crypto from 'node:crypto'
import { createRequire } from 'node:module'

// CommonJS require shim for the optional service-account file read (ESM has no global require).
const require = createRequire(import.meta.url)

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ---- credential loading -----------------------------------------------------

let _saCache // memoize the parsed service account so we don't re-read/parse every call
let _saSource // remembers what we parsed (so a changed env in dev invalidates the cache)

function rawCredEnv() {
  return String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()
}

/** True when *some* Google service-account credential env is present. Cheap — no parse, no file I/O. */
export function credsConfigured() {
  return Boolean(rawCredEnv() || String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim())
}

/** Parse the inline JSON env, tolerating base64-wrapped values. Returns the object or null. */
function parseInlineJson(raw) {
  if (!raw) return null
  // Accept either literal JSON or base64-of-JSON (handy for single-line env vars).
  let text = raw
  if (!text.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8')
      if (decoded.trim().startsWith('{')) text = decoded
    } catch { /* fall through to JSON.parse on the raw value */ }
  }
  try { return JSON.parse(text) } catch { return null }
}

/**
 * readServiceAccount — load + validate the service-account credential. Never throws; returns null
 * when not configured or malformed (so configured()/health() can report cleanly).
 * Prefers GOOGLE_SERVICE_ACCOUNT_JSON; falls back to reading GOOGLE_APPLICATION_CREDENTIALS file.
 * @returns {{ client_email:string, private_key:string, token_uri?:string }|null}
 */
export function readServiceAccount() {
  const inline = rawCredEnv()
  const path = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
  const source = inline ? `inline:${inline.length}` : path ? `file:${path}` : ''
  if (!source) { _saCache = undefined; _saSource = undefined; return null }
  if (_saCache !== undefined && _saSource === source) return _saCache

  let sa = null
  if (inline) {
    sa = parseInlineJson(inline)
  } else if (path) {
    // Lazy, synchronous read — only when the inline env is absent. Kept out of the hot path.
    try {
      const fs = require('node:fs')
      sa = parseInlineJson(fs.readFileSync(path, 'utf8'))
    } catch { sa = null }
  }

  // Validate the two fields we actually need to sign a JWT.
  if (!sa || typeof sa !== 'object' || !sa.client_email || !sa.private_key) sa = null
  _saCache = sa
  _saSource = source
  return sa
}

// ---- JWT signing + token exchange ------------------------------------------

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Build + RS256-sign the assertion JWT Google's token endpoint expects. */
function signAssertion(sa, scopes, subject) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: Array.isArray(scopes) ? scopes.join(' ') : String(scopes || ''),
    aud: sa.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }
  if (subject) claim.sub = subject // domain-wide delegation: act as this user
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(sa.private_key) // PKCS#8 PEM from the service-account JSON
  return `${signingInput}.${b64url(signature)}`
}

// Cache access tokens keyed by (scopes + subject). Each entry: { token, exp (epoch sec) }.
const _tokenCache = new Map()

/** resetTokenCache — drop cached tokens (e.g. after rotating creds in a long-lived process). */
export function resetTokenCache() {
  _tokenCache.clear()
  _saCache = undefined
  _saSource = undefined
}

/**
 * getAccessToken — return a cached OAuth2 access token for the given scopes, minting a new one via
 * the signed-JWT grant when the cache is cold or near expiry. Throws on misconfiguration / Google
 * errors so callers can surface a clear health detail.
 * @param {string|string[]} scopes  one or more Google OAuth scopes
 * @param {object} [o]
 * @param {string} [o.subject]  user email to impersonate (domain-wide delegation)
 * @returns {Promise<string>} access token
 */
export async function getAccessToken(scopes, { subject } = {}) {
  const sa = readServiceAccount()
  if (!sa) throw new Error('google_creds_missing_or_invalid')
  const sub = subject || String(process.env.GOOGLE_WORKSPACE_SUBJECT || '').trim() || undefined
  const scopeStr = Array.isArray(scopes) ? scopes.join(' ') : String(scopes || '')
  const cacheKey = `${sub || ''}::${scopeStr}`

  const cached = _tokenCache.get(cacheKey)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token // 60s safety margin

  const assertion = signAssertion(sa, scopes, sub)
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })
  const res = await fetch(sa.token_uri || TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    throw new Error(`google_token_${res.status}: ${json.error || ''} ${json.error_description || ''}`.trim().slice(0, 200))
  }
  _tokenCache.set(cacheKey, { token: json.access_token, exp: now + (Number(json.expires_in) || 3600) })
  return json.access_token
}

export default { readServiceAccount, credsConfigured, getAccessToken, resetTokenCache }
