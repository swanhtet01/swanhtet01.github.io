// Connector: marketing — Meta Ads. Read ad-campaign data from the Meta (Facebook) Marketing API
// via the Graph API (zero-dependency, native fetch). Myanmar retail runs almost entirely on
// Facebook/Instagram ads, so this lets a DeskPOS / demo-funnel operator see the campaigns behind
// their store's traffic (name, status, objective) straight from the ad account they already own.
//
// category 'marketing' · configured = META_ADS_ACCESS_TOKEN + META_ADS_ACCOUNT_ID present.
//
// Quick setup (Meta Marketing API):
//   1. Create a Meta app at https://developers.facebook.com and add the Marketing API product.
//   2. Generate a long-lived access token with ads_read (System User token recommended for servers).
//   3. Find your ad account id in Ads Manager — it is the numeric id with an "act_" prefix
//      (e.g. act_1234567890). Set the WHOLE value (including act_) as META_ADS_ACCOUNT_ID.
//   4. Set META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID.
//
// Auth model: the access token rides as an `access_token` query param on every Graph API call.
//
// Env:
//   META_ADS_ACCESS_TOKEN  (required)  Meta Marketing API access token (ads_read scope)
//   META_ADS_ACCOUNT_ID    (required)  ad account id with the "act_" prefix (e.g. act_1234567890)
//
// Capabilities:
//   listCampaigns() — GET /v21.0/<account_id>/campaigns?fields=name,status,objective (list campaigns).

import { register } from './registry.mjs'

// Fixed, documented Graph API host. We do NOT read the base from env — there is no per-tenant host
// here, so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://graph.facebook.com'
const API_HOST = 'graph.facebook.com'
const API_VERSION = 'v21.0'

const accessToken = () => String(process.env.META_ADS_ACCESS_TOKEN || '').trim()
const accountId = () => String(process.env.META_ADS_ACCOUNT_ID || '').trim()

// configured — both env vars present. The host is a hardcoded constant (never derived from a user
// value), so there is no SSRF surface to validate here beyond the presence of the credentials.
const configured = () => Boolean(accessToken() && accountId())

/**
 * apiUrl — build a Graph API URL for the given path segment on the fixed host, with the access
 * token appended as a query param. The URL is built from the hardcoded API_BASE and then
 * re-validated with new URL() (SSRF-safe: only the documented Graph host is ever contacted, never a
 * value derived from env), mirroring the reference connectors.
 *
 * @param {string} pathSegment  e.g. 'act_123/campaigns'
 * @param {Record<string,string>} [query]  extra query params (access_token is added automatically)
 * @returns {string} absolute https URL on the Graph API host
 */
function apiUrl(pathSegment, query = {}) {
  const params = new URLSearchParams({ ...query, access_token: accessToken() })
  const url = `${API_BASE}/${API_VERSION}/${pathSegment}?${params.toString()}`
  // Defensive: confirm we're only ever hitting the documented Graph host over https.
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== API_HOST) {
    throw new Error('meta_ads_bad_host')
  }
  return url
}

/**
 * listCampaigns — list the campaigns in the configured ad account.
 *
 * GET /v21.0/<account_id>/campaigns?fields=name,status,objective returns a `data` array of
 * campaigns, each with its name, delivery status, and objective. Read-only and account-scoped.
 *
 * @returns {Promise<{ ok:boolean, campaigns?:object[], reason?:string, status?:number }>}
 */
export async function listCampaigns() {
  if (!configured()) return { ok: false, reason: 'marketing-meta-ads_not_configured' }
  try {
    const url = apiUrl(`${encodeURIComponent(accountId())}/campaigns`, {
      fields: 'name,status,objective',
    })
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `meta_ads_${String(reason)}`.slice(0, 200) }
    }
    const campaigns = Array.isArray(data?.data) ? data.data : []
    return { ok: true, status: res.status, campaigns }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'meta_ads_error').slice(0, 200) }
  }
}

export const marketingMetaAds = {
  key: 'marketing-meta-ads',
  name: 'Meta Ads',
  category: 'marketing',
  docs: 'kernel/connectors/marketing-meta-ads.mjs',
  configured,
  /**
   * health — GET the campaigns edge (limited to 1 row). A 200 with no `error` means the access
   * token and ad account id are valid and the token can read this account's ads.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID' }
    try {
      const url = apiUrl(`${encodeURIComponent(accountId())}/campaigns`, {
        fields: 'name',
        limit: '1',
      })
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const reason = data?.error?.message || `http_${res.status}`
        return { ok: false, detail: `meta_ads_${res.status}: ${String(reason)}`.slice(0, 160) }
      }
      const count = Array.isArray(data?.data) ? data.data.length : 0
      return { ok: true, detail: `account=${accountId()} campaigns_readable (${count})`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'meta_ads_error').slice(0, 160) }
    }
  },
  listCampaigns,
}

register(marketingMetaAds)
export default marketingMetaAds
