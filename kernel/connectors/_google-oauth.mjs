// Google OAuth2 user-credential auth — uses client_id + client_secret + refresh_token.
// Complement to _google-auth.mjs (service account). This module supports Swan's personal
// Google Workspace account (swanhtet@supermega.dev) without needing a service account or
// domain-wide delegation. Run get-google-tokens.mjs once to obtain the refresh_token.
//
// Env:
//   GOOGLE_OAUTH_CLIENT_ID        (required) OAuth2 client id
//   GOOGLE_OAUTH_CLIENT_SECRET    (required) OAuth2 client secret
//   GOOGLE_OAUTH_REFRESH_TOKEN    (required) obtained via get-google-tokens.mjs
//
// Public surface (mirrors _google-auth.mjs):
//   oauthConfigured()                    -> boolean
//   getOAuthAccessToken(scopes)          -> Promise<string>   (cached, auto-refreshes)
//   resetOAuthTokenCache()               -> void

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

const getClientId = () => String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim()
const getClientSecret = () => String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim()
const getRefreshToken = () => String(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim()

/** True when all three OAuth2 env vars are present. Cheap — no I/O. */
export function oauthConfigured() {
  return Boolean(getClientId() && getClientSecret() && getRefreshToken())
}

// Access token cache keyed by scope string. Entry: { token, exp (epoch sec) }.
const _cache = new Map()

/** resetOAuthTokenCache — drop cached tokens (e.g. after rotating refresh_token). */
export function resetOAuthTokenCache() { _cache.clear() }

/**
 * getOAuthAccessToken — return a cached OAuth2 access token, minting a new one via
 * the refresh_token grant when the cache is cold or near expiry.
 * @param {string|string[]} scopes  one or more Google OAuth scopes (used as cache key only;
 *                                  the refresh_token was granted these scopes at consent time)
 * @returns {Promise<string>} bearer access token
 */
export async function getOAuthAccessToken(scopes) {
  if (!oauthConfigured()) throw new Error('google_oauth_not_configured')
  const scopeKey = (Array.isArray(scopes) ? scopes.join(' ') : String(scopes || '')).trim() || 'default'
  const cached = _cache.get(scopeKey)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token

  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: getRefreshToken(),
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    throw new Error(`google_oauth_token_${res.status}: ${json.error || ''} ${json.error_description || ''}`.trim().slice(0, 200))
  }
  _cache.set(scopeKey, { token: json.access_token, exp: now + (Number(json.expires_in) || 3600) })
  return json.access_token
}

export default { oauthConfigured, getOAuthAccessToken, resetOAuthTokenCache }
