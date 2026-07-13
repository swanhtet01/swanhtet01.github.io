import { createHash } from 'node:crypto'

const ALLOWED_SOURCES = new Set(['line', 'viber', 'manual'])
const MAX_ITEMS = 25
const MAX_TEXT_LENGTH = 2_000
const MAX_WINDOW_MS = 168 * 60 * 60 * 1_000
const MAX_EVIDENCE_AGE_MS = 366 * 24 * 60 * 60 * 1_000
const CONTROL_CHARACTER_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

function text(value, max = 200) {
  try { return String(value ?? '').trim().slice(0, max) } catch { return '' }
}

function exactText(value, max, reason, { multiline = false } = {}) {
  let candidate
  try { candidate = String(value ?? '').replace(/\r\n?/g, '\n').trim() } catch { throw new Error(reason) }
  if (!candidate || candidate.length > max || CONTROL_CHARACTER_RE.test(candidate)) throw new Error(reason)
  if (!multiline && /[\n\t]/.test(candidate)) throw new Error(reason)
  return candidate
}

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function configuredUrl(env) {
  const enabled = text(env?.WORKCELL_OWNER_EVIDENCE_ENABLED, 10).toLowerCase() === 'true'
  const rawUrl = text(env?.SUPABASE_URL, 500).replace(/\/$/, '')
  const key = text(env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY, 20_000)
  if (!enabled || !rawUrl || !key) return null
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') return null
    const suffix = '.supabase.co'
    const projectRef = parsed.hostname.endsWith(suffix) ? parsed.hostname.slice(0, -suffix.length) : ''
    if (!/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/.test(projectRef) || projectRef.includes('.')) return null
    return { baseUrl: parsed.origin, key }
  } catch {
    return null
  }
}

export function ownerEvidenceConfigured(env = process.env) {
  return Boolean(configuredUrl(env))
}

function canonicalAt(value, now) {
  const atMs = Date.parse(String(value || ''))
  const nowMs = now instanceof Date && Number.isFinite(now.getTime()) ? now.getTime() : Date.now()
  if (!Number.isFinite(atMs) || atMs > nowMs + 5 * 60 * 1_000 || atMs < nowMs - MAX_EVIDENCE_AGE_MS) {
    throw new Error('owner_evidence_invalid_time')
  }
  return new Date(atMs).toISOString()
}

function assertKeys(value, allowed, reason) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(reason)
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error(reason)
}

export function normalizeOwnerEvidence(input, options = {}) {
  assertKeys(input, new Set(['source', 'reviewedBy', 'items']), 'owner_evidence_invalid_payload')
  const source = text(input.source, 20).toLowerCase()
  if (!ALLOWED_SOURCES.has(source)) throw new Error('owner_evidence_invalid_source')
  const reviewedBy = exactText(input.reviewedBy, 80, 'owner_evidence_reviewer_required')
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_ITEMS) {
    throw new Error('owner_evidence_items_1_to_25_required')
  }
  const now = options.now || new Date()
  const items = input.items.map((item) => {
    assertKeys(item, new Set(['at', 'text', 'sourceRef']), 'owner_evidence_invalid_item')
    const at = canonicalAt(item.at, now)
    const body = exactText(item.text, MAX_TEXT_LENGTH, 'owner_evidence_invalid_text', { multiline: true })
    const sourceRef = item.sourceRef == null || item.sourceRef === ''
      ? ''
      : exactText(item.sourceRef, 120, 'owner_evidence_invalid_source_ref')
    const fingerprint = stableHash([source, at, body, sourceRef])
    return {
      id: `owner-evidence-${fingerprint.slice(0, 40)}`,
      source,
      sourceRef,
      at,
      text: body,
      fingerprint,
    }
  })
  if (new Set(items.map((item) => item.fingerprint)).size !== items.length) {
    throw new Error('owner_evidence_duplicate_item')
  }
  const payloadHash = stableHash({ source, reviewedBy, items: items.map(({ at, text: body, sourceRef, fingerprint }) => ({ at, text: body, sourceRef, fingerprint })) })
  return { source, reviewedBy, items, payloadHash }
}

export function ownerEvidenceConfirmation(payloadHash) {
  if (!/^[a-f0-9]{64}$/.test(String(payloadHash || ''))) throw new Error('owner_evidence_invalid_payload_hash')
  return `STORE ${String(payloadHash).slice(0, 12).toUpperCase()}`
}

export function previewOwnerEvidence(input, options = {}) {
  const normalized = normalizeOwnerEvidence(input, options)
  return {
    ...normalized,
    confirmation: ownerEvidenceConfirmation(normalized.payloadHash),
  }
}

function requestHeaders(key, prefer) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  }
}

export async function storeOwnerEvidence(input, options = {}) {
  const env = options.env || process.env
  const config = configuredUrl(env)
  if (!config) return { ok: false, reason: 'owner_evidence_not_configured' }
  let normalized
  try {
    normalized = normalizeOwnerEvidence({ source: input?.source, reviewedBy: input?.reviewedBy, items: input?.items }, options)
  } catch (error) {
    return { ok: false, reason: text(error?.message, 160) || 'owner_evidence_invalid_payload' }
  }
  if (String(input?.payloadHash || '') !== normalized.payloadHash) {
    return { ok: false, reason: 'owner_evidence_payload_changed' }
  }
  if (String(input?.confirmation || '') !== ownerEvidenceConfirmation(normalized.payloadHash)) {
    return { ok: false, reason: 'owner_evidence_confirmation_required' }
  }

  const reviewedAt = (options.now || new Date()).toISOString()
  const rows = normalized.items.map((item) => ({
    id: item.id,
    source: item.source,
    source_ref: item.sourceRef || null,
    occurred_at: item.at,
    text: item.text,
    reviewed_by: normalized.reviewedBy,
    reviewed_at: reviewedAt,
    fingerprint: item.fingerprint,
  }))
  const fetchImpl = options.fetch || globalThis.fetch
  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/supermega_owner_evidence?on_conflict=fingerprint`, {
      method: 'POST',
      headers: requestHeaders(config.key, 'resolution=ignore-duplicates,return=representation'),
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return { ok: false, reason: response.status === 404 ? 'owner_evidence_schema_missing' : 'owner_evidence_store_failed' }
    const inserted = await response.json().catch(() => [])
    const storedFingerprints = new Set((Array.isArray(inserted) ? inserted : []).map((row) => text(row?.fingerprint, 64)))
    return {
      ok: true,
      payloadHash: normalized.payloadHash,
      stored: storedFingerprints.size,
      duplicates: normalized.items.length - storedFingerprints.size,
      evidence: normalized.items.map((item) => ({
        id: item.id,
        source: item.source,
        at: item.at,
        fingerprint: item.fingerprint,
        stored: storedFingerprints.has(item.fingerprint),
      })),
    }
  } catch {
    return { ok: false, reason: 'owner_evidence_store_failed' }
  }
}

export async function readOwnerEvidence(input = {}, options = {}) {
  const env = options.env || process.env
  const config = configuredUrl(env)
  if (!config) return { ok: false, reason: 'owner_evidence_not_configured' }
  const startMs = Date.parse(String(input.startDate || ''))
  const endMs = Date.parse(String(input.endDate || ''))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > MAX_WINDOW_MS) {
    return { ok: false, reason: 'owner_evidence_invalid_window' }
  }
  const limit = Math.max(1, Math.min(100, Number.parseInt(String(input.limit), 10) || 100))
  const query = new URLSearchParams({
    select: 'id,source,source_ref,occurred_at,text,reviewed_at,fingerprint',
    order: 'occurred_at.asc,id.asc',
    limit: String(limit),
  })
  query.append('occurred_at', `gte.${new Date(startMs).toISOString()}`)
  query.append('occurred_at', `lte.${new Date(endMs).toISOString()}`)
  const fetchImpl = options.fetch || globalThis.fetch
  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/supermega_owner_evidence?${query}`, {
      method: 'GET',
      headers: requestHeaders(config.key),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return { ok: false, reason: response.status === 404 ? 'owner_evidence_schema_missing' : 'owner_evidence_read_failed' }
    const rows = await response.json().catch(() => [])
    const bounded = Array.isArray(rows) ? rows.slice(0, limit) : []
    return {
      ok: true,
      updates: bounded.map((row) => ({
        evidenceId: text(row?.id, 80) || null,
        source: text(row?.source, 20).toLowerCase(),
        sourceRef: text(row?.source_ref, 120) || null,
        at: text(row?.occurred_at, 40) || null,
        text: text(row?.text, MAX_TEXT_LENGTH),
        reviewedAt: text(row?.reviewed_at, 40) || null,
        fingerprint: /^[a-f0-9]{64}$/.test(String(row?.fingerprint || '')) ? row.fingerprint : null,
      })).filter((row) => ALLOWED_SOURCES.has(row.source) && row.at && row.text),
      fetched: bounded.length,
      truncated: bounded.length === limit,
    }
  } catch {
    return { ok: false, reason: 'owner_evidence_read_failed' }
  }
}

export default {
  ownerEvidenceConfigured,
  normalizeOwnerEvidence,
  ownerEvidenceConfirmation,
  previewOwnerEvidence,
  storeOwnerEvidence,
  readOwnerEvidence,
}
