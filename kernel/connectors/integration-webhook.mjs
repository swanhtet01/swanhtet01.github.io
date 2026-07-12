// Connector: integration — generic outbound webhook. Push any structured event to any HTTP
// endpoint with optional HMAC-SHA256 signing. Works as an escape hatch: n8n, Make, Zapier,
// internal APIs, ERP systems, or any customer system that accepts JSON over HTTP.
//
// category 'integration' · always configured (no required env vars — endpoint is per-call).
//
// Env (optional):
//   WEBHOOK_HMAC_SECRET   default HMAC signing secret if caller doesn't pass one
//   WEBHOOK_DEFAULT_URL   fallback endpoint if not passed per-call
//
// Capabilities:
//   send(url, payload, opts)  -> { ok, status, body }
//   health()                  -> { ok, detail }

import crypto from 'node:crypto'
import { register } from './registry.mjs'

/**
 * send — POST a JSON payload to any URL with optional HMAC-SHA256 signature.
 * @param {string}  url                    target endpoint
 * @param {object}  payload                any JSON-serialisable object
 * @param {object}  [opts]
 * @param {string}  [opts.secret]          HMAC-SHA256 signing secret (falls back to WEBHOOK_HMAC_SECRET)
 * @param {string}  [opts.signatureHeader] header name for the signature (default: X-Supermega-Signature)
 * @param {object}  [opts.extraHeaders]    additional request headers
 * @param {number}  [opts.timeoutMs=8000]  request timeout
 * @returns {Promise<{ ok:boolean, status:number, body:string }>}
 */
export async function send(url, payload, { secret, signatureHeader = 'X-Supermega-Signature', extraHeaders = {}, timeoutMs = 8000 } = {}) {
  const target = (typeof url === 'string' && url) || process.env.WEBHOOK_DEFAULT_URL
  // Reject anything that isn't a real http(s) URL BEFORE fetch (a non-string/garbage url makes
  // fetch throw a raw TypeError, which would crash an orchestration instead of degrading).
  if (!target || typeof target !== 'string') return { ok: false, reason: 'webhook_no_url' }
  let parsed
  try { parsed = new URL(target) } catch { return { ok: false, reason: 'webhook_bad_url' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'webhook_bad_scheme' }
  let body
  try { body = JSON.stringify(payload ?? {}) } catch { return { ok: false, reason: 'webhook_unserializable_payload' } }
  const sigSecret = secret || process.env.WEBHOOK_HMAC_SECRET || ''
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'supermega-kernel/1.0',
    ...(extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {}),
  }
  if (sigSecret) {
    const sig = crypto.createHmac('sha256', sigSecret).update(body).digest('hex')
    headers[signatureHeader] = 'sha256=' + sig
  }
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const resBody = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, reason: `webhook_${res.status}: ${resBody.slice(0, 200)}` }
    return { ok: true, status: res.status, body: resBody.slice(0, 500) }
  } catch (e) {
    // Network error / timeout / abort must degrade to {ok:false}, never throw out of the connector.
    return { ok: false, reason: String((e && e.message) || 'webhook_error').slice(0, 200) }
  }
}

export const integrationWebhook = {
  key: 'integration-webhook',
  name: 'Generic Webhook',
  category: 'integration',
  docs: 'kernel/connectors/integration-webhook.mjs',
  configured: () => true, // no required env vars — endpoint is passed per-call
  async health() {
    // No dedicated endpoint to probe — report config status.
    const hasDefault = !!process.env.WEBHOOK_DEFAULT_URL
    const hasSigning = !!process.env.WEBHOOK_HMAC_SECRET
    return {
      ok: true,
      detail: `ready (default url: ${hasDefault ? 'set' : 'not set'}, hmac: ${hasSigning ? 'configured' : 'unsigned'})`,
    }
  },
  send,
}

register(integrationWebhook)
export default integrationWebhook
