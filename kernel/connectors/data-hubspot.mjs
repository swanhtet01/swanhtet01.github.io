// Connector: data — HubSpot.
// Read and write contacts and deals in HubSpot CRM. Many SMBs in SE Asia run their
// sales pipeline in HubSpot's free CRM — contacts, deals, and stages. This connector
// lets SuperMega agents pull those records into workflows and push new ones back.
//
// category 'data' · configured = HUBSPOT_ACCESS_TOKEN present.
//
// Quick setup:
//   1. In HubSpot: Settings → Integrations → Private Apps → Create a private app.
//   2. Grant CRM scopes (crm.objects.contacts.read/write, crm.objects.deals.read/write).
//   3. Copy the access token (starts with pat-…).
//   4. Set it as HUBSPOT_ACCESS_TOKEN.
//
// Env:
//   HUBSPOT_ACCESS_TOKEN  (required)  private app token (pat-…)
//
// Capabilities:
//   listContacts(opts)        -> { ok, contacts }
//   createContact(properties) -> { ok, contact }
//   listDeals(opts)           -> { ok, deals }
//   createDeal(properties)    -> { ok, deal }
//   health()                  -> { ok, detail }

import { register } from './registry.mjs'

const BASE = 'https://api.hubapi.com'
const accessToken = () => String(process.env.HUBSPOT_ACCESS_TOKEN || '').trim()
const configured = () => Boolean(accessToken())

function headers() {
  return {
    Authorization: `Bearer ${accessToken()}`,
    'Content-Type': 'application/json',
  }
}

async function hsFetch(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
      signal: AbortSignal.timeout(options.timeout || 10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `hubspot_${res.status}: ${data?.message || ''}`.slice(0, 200) }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'hubspot_error').slice(0, 200) }
  }
}

/**
 * listContacts — fetch contacts from the CRM.
 * @param {object} [opts]
 * @param {number}  [opts.limit]  max contacts to return (default 20)
 * @returns {Promise<{ ok:boolean, contacts:Array }>}
 */
export async function listContacts({ limit = 20 } = {}) {
  if (!configured()) return { ok: false, reason: 'hubspot_not_configured' }
  const r = await hsFetch(`/crm/v3/objects/contacts?limit=${encodeURIComponent(limit)}`, { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, contacts: r.data?.results || [] }
}

/**
 * createContact — create a new contact in the CRM.
 * @param {object} properties  key-value pairs matching HubSpot contact property names
 *                             (e.g. { email, firstname, lastname })
 */
export async function createContact(properties) {
  if (!configured()) return { ok: false, reason: 'hubspot_not_configured' }
  const r = await hsFetch('/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  })
  if (!r.ok) return r
  return { ok: true, contact: r.data }
}

/**
 * listDeals — fetch deals from the CRM pipeline.
 * @param {object} [opts]
 * @param {number}  [opts.limit]  max deals to return (default 20)
 * @returns {Promise<{ ok:boolean, deals:Array }>}
 */
export async function listDeals({ limit = 20 } = {}) {
  if (!configured()) return { ok: false, reason: 'hubspot_not_configured' }
  const r = await hsFetch(`/crm/v3/objects/deals?limit=${encodeURIComponent(limit)}`, { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, deals: r.data?.results || [] }
}

/**
 * createDeal — create a new deal in the CRM.
 * @param {object} properties  key-value pairs matching HubSpot deal property names
 *                             (e.g. { dealname, amount, dealstage, pipeline })
 */
export async function createDeal(properties) {
  if (!configured()) return { ok: false, reason: 'hubspot_not_configured' }
  const r = await hsFetch('/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  })
  if (!r.ok) return r
  return { ok: true, deal: r.data }
}

export const dataHubspot = {
  key: 'data-hubspot',
  name: 'HubSpot',
  category: 'data',
  docs: 'kernel/connectors/data-hubspot.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing HUBSPOT_ACCESS_TOKEN' }
    const r = await hsFetch('/crm/v3/objects/contacts?limit=1', { method: 'GET' })
    return r.ok
      ? { ok: true, detail: 'auth ok' }
      : { ok: false, detail: r.reason }
  },
  listContacts,
  createContact,
  listDeals,
  createDeal,
}

register(dataHubspot)
export default dataHubspot
