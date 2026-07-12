// Connector: integration — Zapier. Fire outbound events into a Zapier "Catch Hook" trigger so an
// SMB can wire SUPERMEGA into 6000+ apps with no code (Google Sheets, Slack, Gmail, Airtable, etc.).
// Zero-dependency, native fetch. When SUPERMEGA emits a business event (new order, payment received,
// low stock, lead captured), send() POSTs it as JSON to the customer's Zap and Zapier fans it out to
// whatever downstream apps they connected — no bot hosting, no per-integration code on our side.
//
// category 'integration' · configured = ZAPIER_HOOK_URL present AND a valid https://hooks.zapier.com URL.
//
// Quick setup (Catch Hook — no API key needed):
//   1. In Zapier: create a Zap, choose "Webhooks by Zapier" as the trigger.
//   2. Trigger event: "Catch Hook". Continue (no "Pick off a Child Key" needed).
//   3. Zapier shows a "Custom Webhook URL" (looks like https://hooks.zapier.com/hooks/catch/<id>/<token>/).
//   4. Copy it and set it as ZAPIER_HOOK_URL. Add downstream action steps, then turn the Zap on.
//
// Env:
//   ZAPIER_HOOK_URL  (required)  Catch Hook "Custom Webhook URL" from the Zap's trigger step
//
// Capabilities:
//   send(payload) — POST an arbitrary JSON event to the hook; Zapier answers {status:'success'} on 2xx.
//
// NOTE: A Zapier catch hook is WRITE-ONLY — there is no documented GET liveness endpoint, and a
// blind POST would fire the customer's Zap as a side effect. So health() does NOT hit the network;
// it verifies the URL is a well-formed https://hooks.zapier.com hook and reports configured/liveness
// from that alone.

import { register } from './registry.mjs'

const hookUrl = () => String(process.env.ZAPIER_HOOK_URL || '').trim()

// configured — present AND a real Zapier catch-hook URL. We validate the host is EXACTLY
// hooks.zapier.com over https (not just "starts with https://") so a misconfigured/hostile
// ZAPIER_HOOK_URL can't turn send() into an SSRF primitive that POSTs against an arbitrary host.
const configured = () => {
  try {
    const raw = hookUrl()
    if (!raw || !raw.startsWith('https://')) return false
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    if (u.hostname.toLowerCase() !== 'hooks.zapier.com') return false
    return u.pathname.startsWith('/hooks/catch/')
  } catch {
    return false
  }
}

/**
 * send — POST a JSON event to the configured Zapier Catch Hook.
 *
 * Zapier returns HTTP 200 with a body like {"status":"success", ...} when the hook accepts the
 * payload; any 2xx is treated as ok. The payload is sent as-is (Zapier flattens it into fields the
 * Zap's action steps can map).
 *
 * @param {object} [payload]  arbitrary JSON event to hand to the Zap (e.g. { event, order_id, total }).
 * @returns {Promise<{ ok:boolean, status?:number, reason?:string }>}
 */
export async function send(payload = {}) {
  if (!configured()) return { ok: false, reason: 'zapier_not_configured' }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'zapier_invalid_payload' }

  try {
    const res = await fetch(hookUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const resText = await res.text().catch(() => '')
      return { ok: false, reason: `zapier_hook_${res.status}: ${resText.slice(0, 200)}` }
    }
    // Zapier answers {"status":"success", ...}; treat any 2xx as delivered.
    const data = await res.json().catch(() => null)
    if (data && data.status && data.status !== 'success') {
      return { ok: false, reason: `zapier_status_${String(data.status)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'zapier_error').slice(0, 200) }
  }
}

export const integrationZapier = {
  key: 'integration-zapier',
  name: 'Zapier',
  category: 'integration',
  docs: 'kernel/connectors/integration-zapier.mjs',
  configured,
  /**
   * health — Zapier catch hooks are WRITE-ONLY: there is no GET liveness endpoint, and a probe POST
   * would fire the customer's Zap as a side effect. So we don't touch the network — we report health
   * from configured() alone: a well-formed https://hooks.zapier.com/hooks/catch/... URL is "live".
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing/invalid ZAPIER_HOOK_URL' }
    return { ok: true, detail: 'hook configured (hooks.zapier.com)' }
  },
  send,
}

register(integrationZapier)
export default integrationZapier
