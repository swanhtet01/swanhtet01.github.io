// Ops-gated workcell activation API.
// GET: readiness/catalog. POST: run one fixed workcell; owner delivery is explicit.

import crypto from 'node:crypto'
import { notify } from '../alert.mjs'
import { createActionDraft, workcellActionDraft } from '../approval-actions.mjs'
import { formatWorkcellNotification, runWorkcell } from '../workcell-run.mjs'
import { listWorkcells, resolveWorkcellConfig, scheduledWorkcellSlugs } from '../workcells.mjs'

function constantTimeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest()
  const right = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(left, right)
}

export async function handleWorkcells(request = {}, options = {}) {
  const env = options.env || process.env
  const opsKey = String(options.opsKey ?? env.SUPERMEGA_OPS_KEY ?? '').trim()
  if (!opsKey) return { status: 503, json: { ok: false, reason: 'ops_key_not_configured' } }
  if (!constantTimeEqual(String(request.headers?.['x-ops-key'] || ''), opsKey)) {
    return { status: 401, json: { ok: false, reason: 'unauthorized' } }
  }

  const method = String(request.method || 'GET').toUpperCase()
  if (method === 'GET') {
    const config = resolveWorkcellConfig(env, options.now || new Date())
    return {
      status: 200,
      json: {
        ok: true,
        isolation: 'one_client_per_deployment',
        client: { name: config.clientName, timeZone: config.timeZone, currency: config.currency },
        schedule: {
          path: '/api/brief',
          cadence: 'daily',
          utc: '01:30',
          configuredSlugs: scheduledWorkcellSlugs(env),
        },
        workcells: listWorkcells({ env, now: options.now, availableTools: options.availableTools }),
      },
    }
  }
  if (method !== 'POST') return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {}
  const slug = String(body.slug || '').trim().slice(0, 60)
  if (!slug) return { status: 400, json: { ok: false, reason: 'missing_slug' } }
  const config = resolveWorkcellConfig(env, options.now || new Date())
  const run = options.runWorkcell || runWorkcell
  const result = await run(slug, {
    env,
    now: options.now,
    availableTools: options.availableTools,
    runTool: options.runTool,
    complete: options.complete,
    clientId: body.clientId ? String(body.clientId).slice(0, 80) : undefined,
  })
  if (!result.ok) {
    const status = result.reason === 'workcell_not_found' ? 404
      : result.reason === 'workcell_not_ready' ? 409
        : 502
    return { status, json: result }
  }

  let delivery = { requested: false, sent: false }
  if (body.deliver === true) {
    const send = options.notify || notify
    const sent = await send(formatWorkcellNotification(result))
    delivery = { requested: true, sent: Boolean(sent) }
  }

  let approvalQueue = { requested: false, ok: false }
  if (body.queueAction === true) {
    const draft = workcellActionDraft(result, config)
    if (!draft) {
      approvalQueue = { requested: true, ok: false, reason: 'workcell_action_draft_not_available' }
    } else {
      const create = options.createActionDraft || createActionDraft
      const created = await create(draft)
      approvalQueue = created.ok
        ? { requested: true, ok: true, approval: created.approval }
        : { requested: true, ok: false, reason: created.reason || 'approval_store_write_failed' }
    }
  }
  return {
    status: 200,
    json: {
      ok: true,
      slug: result.slug,
      name: result.name,
      localDate: result.localDate,
      timeZone: result.timeZone,
      sources: result.sources,
      output: result.output,
      delivery,
      approvalQueue,
    },
  }
}

export default async function handler(req, res) {
  const result = await handleWorkcells({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
