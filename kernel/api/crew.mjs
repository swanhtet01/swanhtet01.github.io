// SUPERMEGA crews API — makes the Task Catalog consumable over HTTP.
//   GET  /api/crew              → list the catalog (public product metadata: slug, roles, tiers, returns)
//   POST /api/crew { slug, intake, clientId? } → run a crew (ops-gated — running costs tokens)
//
// Running goes through runCrew(), so every model call is cost-capped + plan-tiered by the gateway, the
// output_contract is enforced, and the executor has NO send/write/pay capability (draft-only). This is
// the endpoint the console/demo/apps call to actually USE a forged crew. Mirrors api/operator.mjs auth.
import crypto from 'node:crypto'
import { listCrews } from '../crew-runner.mjs'
import { runCrew } from '../crew-run.mjs'

const OPS_KEY = (process.env.SUPERMEGA_OPS_KEY || '').trim()
function constantTimeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

// Public catalog view — product metadata only (crew defs carry no secrets).
function summary(c) {
  return {
    slug: c.slug,
    name: c.name,
    description: c.description,
    plan: c.plan || 'all',
    requires_account_access: Boolean(c.requires_account_access),
    accepts: (c.intake && c.intake.accepts) || [],
    roles: (c.roles || []).map((r) => ({ id: r.id, title: r.title, tier: r.tier })),
    returns: (c.output_contract && c.output_contract.fields) || [],
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  // GET → the catalog. Public: it's the list of products, not sensitive.
  if (req.method === 'GET') {
    let crews = []
    try { crews = await listCrews() } catch (e) { res.status(500).json({ ok: false, reason: 'catalog_error', detail: String((e && e.message) || '').slice(0, 120) }); return }
    res.status(200).json({ ok: true, count: crews.length, crews: crews.map(summary) })
    return
  }

  if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method_not_allowed' }); return }

  // POST runs a crew → costs tokens → ops-gated (same posture as api/operator.mjs).
  if (!OPS_KEY) { res.status(503).json({ ok: false, reason: 'ops_key_not_configured' }); return }
  if (!constantTimeEqual(String(req.headers['x-ops-key'] || ''), OPS_KEY)) { res.status(401).json({ ok: false, reason: 'unauthorized' }); return }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const slug = String(body.slug || '').trim().slice(0, 60)
  if (!slug) { res.status(400).json({ ok: false, reason: 'missing_slug' }); return }

  const out = await runCrew(slug, body.intake, {
    clientId: body.clientId ? String(body.clientId).slice(0, 80) : undefined,
  })
  res.status(out.ok ? 200 : 400).json(out)
}
