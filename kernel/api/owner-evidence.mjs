import crypto from 'node:crypto'

import {
  ownerEvidenceConfigured,
  previewOwnerEvidence,
  readOwnerEvidence,
  storeOwnerEvidence,
} from '../owner-evidence.mjs'

function constantTimeEqual(leftValue, rightValue) {
  const left = crypto.createHash('sha256').update(String(leftValue)).digest()
  const right = crypto.createHash('sha256').update(String(rightValue)).digest()
  return crypto.timingSafeEqual(left, right)
}

function bodyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function evidenceInput(body) {
  return { source: body.source, reviewedBy: body.reviewedBy, items: body.items }
}

export async function handleOwnerEvidence(request = {}, options = {}) {
  const env = options.env || process.env
  const opsKey = String(options.opsKey ?? env.SUPERMEGA_OPS_KEY ?? '').trim()
  if (!opsKey) return { status: 503, json: { ok: false, reason: 'ops_key_not_configured' } }
  if (!constantTimeEqual(String(request.headers?.['x-ops-key'] || ''), opsKey)) {
    return { status: 401, json: { ok: false, reason: 'unauthorized' } }
  }

  const configured = (options.configured || ownerEvidenceConfigured)(env)
  const method = String(request.method || 'GET').toUpperCase()
  if (method === 'GET') {
    if (!configured) return { status: 200, json: { ok: true, configured: false, windowHours: 168, count: 0, evidence: [] } }
    const now = options.now || new Date()
    const read = options.read || readOwnerEvidence
    const result = await read({
      startDate: new Date(now.getTime() - 168 * 60 * 60 * 1_000).toISOString(),
      endDate: now.toISOString(),
      limit: 25,
    }, { env, now, fetch: options.fetch })
    if (!result.ok) return { status: 503, json: { ok: false, configured: true, reason: result.reason } }
    return {
      status: 200,
      json: {
        ok: true,
        configured: true,
        windowHours: 168,
        count: result.updates.length,
        evidence: result.updates.map((item) => ({
          id: item.evidenceId,
          source: item.source,
          at: item.at,
          reviewedAt: item.reviewedAt,
          fingerprint: item.fingerprint,
        })),
      },
    }
  }
  if (method !== 'POST') return { status: 405, json: { ok: false, reason: 'method_not_allowed' } }
  if (!configured) return { status: 503, json: { ok: false, configured: false, reason: 'owner_evidence_not_configured' } }

  const body = bodyObject(request.body)
  const allowedKeys = new Set(['command', 'source', 'reviewedBy', 'items', 'payloadHash', 'confirmation'])
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return { status: 400, json: { ok: false, reason: 'owner_evidence_invalid_payload' } }
  }
  const command = String(body.command || '').trim().toLowerCase()
  if (!['preview', 'store'].includes(command)) return { status: 400, json: { ok: false, reason: 'owner_evidence_invalid_command' } }
  let preview
  try {
    preview = (options.preview || previewOwnerEvidence)(evidenceInput(body), { now: options.now })
  } catch (error) {
    return { status: 400, json: { ok: false, reason: String(error?.message || 'owner_evidence_invalid_payload').slice(0, 160) } }
  }
  if (command === 'preview') {
    return {
      status: 200,
      json: {
        ok: true,
        configured: true,
        mutation: false,
        payloadHash: preview.payloadHash,
        confirmation: preview.confirmation,
        source: preview.source,
        reviewedBy: preview.reviewedBy,
        items: preview.items.map((item) => ({ at: item.at, text: item.text, sourceRef: item.sourceRef, fingerprint: item.fingerprint })),
      },
    }
  }

  const store = options.store || storeOwnerEvidence
  const result = await store({
    ...evidenceInput(body),
    payloadHash: body.payloadHash,
    confirmation: body.confirmation,
  }, { env, now: options.now, fetch: options.fetch })
  if (!result.ok) {
    const status = ['owner_evidence_payload_changed', 'owner_evidence_confirmation_required'].includes(result.reason) ? 409 : 503
    return { status, json: { ok: false, configured: true, reason: result.reason } }
  }
  return {
    status: 200,
    json: {
      ok: true,
      configured: true,
      mutation: true,
      payloadHash: result.payloadHash,
      stored: result.stored,
      duplicates: result.duplicates,
      evidence: result.evidence,
    },
  }
}

export default async function handler(req, res) {
  const result = await handleOwnerEvidence({ method: req.method, headers: req.headers, body: req.body })
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.json)
}
