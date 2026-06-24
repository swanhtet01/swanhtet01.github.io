// SUPERMEGA console — Integrations health endpoint. GET returns registry.healthAll() so the CEO
// console can render an Integrations page (which connectors are configured + healthy, by category).
//
// Passcode-gated with the same x-ops-key the console uses (see ../console/api.mjs). Additive: this
// is a NEW Vercel function at /api/integrations — it does not touch the existing api/[[...path]].mjs.
//
// Shape returned (200):
//   { ok, mode, counts:{total,configured,healthy}, byCategory:{payment,messaging,data,ai}, connectors:[...] }

import connectors from '../connectors/index.mjs'
import store from '../store.mjs'

const OPS_KEY = (process.env.SUPERMEGA_OPS_KEY || '').trim()

/**
 * handleIntegrations — host-agnostic, same {method,path,query,body,headers} -> {status,json}
 * contract as console/api.mjs's handle(), so the dev server / a Vercel function can both call it.
 */
export async function handleIntegrations({ method = 'GET', headers = {} } = {}) {
  if (OPS_KEY && String(headers['x-ops-key'] || '') !== OPS_KEY) return { status: 401, json: { ok: false, reason: 'unauthorized' } }
  if (method !== 'GET') return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }
  try {
    const report = await connectors.healthAll()
    return { status: 200, json: { mode: store.mode, ...report } }
  } catch (e) {
    return { status: 500, json: { ok: false, reason: String(e.message || 'integrations_error').slice(0, 160) } }
  }
}

// Vercel function entrypoint (mirrors api/[[...path]].mjs).
export default async function handler(req, res) {
  const result = await handleIntegrations({ method: req.method, headers: req.headers })
  res.status(result.status).json(result.json)
}
