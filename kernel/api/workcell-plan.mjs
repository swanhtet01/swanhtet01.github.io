// Ops-gated, no-mutation client activation planner.
// It validates one client manifest and returns only names/checklists; secret values are never read.

import crypto from 'node:crypto'

import { buildProvisionPlan, validateClientManifest } from '../workcell-provision.mjs'

function constantTimeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest()
  const right = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(left, right)
}

export async function handleWorkcellPlan(request = {}, options = {}) {
  const env = options.env || process.env
  const opsKey = String(options.opsKey ?? env.SUPERMEGA_OPS_KEY ?? '').trim()
  if (!opsKey) return { status: 503, json: { ok: false, reason: 'ops_key_not_configured' } }
  if (!constantTimeEqual(String(request.headers?.['x-ops-key'] || ''), opsKey)) {
    return { status: 401, json: { ok: false, reason: 'unauthorized' } }
  }
  if (String(request.method || '').toUpperCase() !== 'POST') {
    return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }
  }

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body
    : {}
  try {
    const manifest = validateClientManifest(body.manifest)
    const plan = buildProvisionPlan(manifest, {
      scope: body.scope,
      env: {},
      randomBytes: options.randomBytes,
    })
    return {
      status: 200,
      json: {
        ok: true,
        mode: 'plan',
        mutation: false,
        secretValuesAccepted: false,
        manifest,
        plan,
      },
    }
  } catch (error) {
    return {
      status: 400,
      json: { ok: false, reason: String(error?.message || 'workcell_plan_invalid').slice(0, 200) },
    }
  }
}

export default async function handler(req, res) {
  const result = await handleWorkcellPlan({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
