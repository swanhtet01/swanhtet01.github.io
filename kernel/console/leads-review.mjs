// SUPERMEGA console — founder lead review (read + record only).
// Lists real `supermega_leads` rows through the existing store read path and records the owner's
// mark-reviewed decision as a versioned control record (record_type 'lead_review', see
// supabase/control-records-migration.sql). This module NEVER contacts a lead: no sends, no
// outbound drafts, no lead mutation — the only write is the review control record.
// Fail-closed: without a durable leads source (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or a
// Postgres connection string) every call returns `leads_source_not_configured` instead of
// silently pretending the funnel is empty.
import { createHash } from 'node:crypto'
import defaultStore from '../store.mjs'

export const LEADS_REVIEW_TENANT = 'supermega-hq'
export const LEAD_REVIEW_RECORD_PREFIX = 'console-lead-review-record:'
// Either pair/one of these makes the leads source durable. The public /contact/ function writes
// supermega_leads with the SAME two Supabase variables in the public-site Vercel project — the
// kernel deployment must point at the SAME Supabase project for the founder to see those leads.
export const LEADS_SOURCE_REQUIRED_ENV = Object.freeze(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
export const LEADS_SOURCE_ALTERNATE_ENV = Object.freeze(['POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL', 'SUPERMEGA_DATABASE_URL', 'DATABASE_URL'])

const LEAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const REVIEWER_RE = /^[A-Za-z0-9][A-Za-z0-9 ._:@-]{0,79}$/
const MAX_LIST_LIMIT = 200
const REVIEW_RECORD_SCAN_LIMIT = 250

// Smoke tests submit through the same public /contact/ function as customers, so the leads table
// mixes both. Classify ONLY on RFC 2606 reserved names, which can never belong to a real business.
// The bias is deliberate: showing a test row costs the founder a second, hiding a real prospect
// costs a customer — so anything not provably synthetic counts as real.
const RESERVED_LEAD_DOMAINS = Object.freeze(['example.com', 'example.org', 'example.net', 'example.edu'])
const RESERVED_LEAD_SUFFIXES = Object.freeze(['.example', '.test', '.invalid', '.localhost'])

export function isSyntheticLead(lead) {
  const email = String(lead?.contact || lead?.email || '').trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1)
  if (!domain) return false
  if (RESERVED_LEAD_DOMAINS.includes(domain)) return true
  return RESERVED_LEAD_SUFFIXES.some((suffix) => domain.endsWith(suffix))
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

export const leadReviewRecordKey = (leadId) => `${LEAD_REVIEW_RECORD_PREFIX}${leadId}`

// The leads source is configured only when the store runs against a durable database. Memory mode
// means the kernel deployment has no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (or Postgres URL) —
// real contact-form leads exist somewhere this deployment cannot see, so fail closed.
export function leadsSourceConfigured(store = defaultStore) {
  return store.mode === 'supabase' || store.mode === 'postgres'
}

function sourceNotConfigured() {
  return {
    ok: false,
    reason: 'leads_source_not_configured',
    requiredEnv: [...LEADS_SOURCE_REQUIRED_ENV],
    alternateEnv: [...LEADS_SOURCE_ALTERNATE_ENV],
  }
}

function publicReview(payload) {
  return {
    leadId: payload.leadId,
    reviewedBy: payload.reviewedBy,
    reviewedAt: payload.reviewedAt,
    reviewHash: payload.reviewHash,
  }
}

function leadSnapshotHash(lead) {
  return sha256(stableJson({
    id: String(lead.id || ''),
    name: String(lead.name || ''),
    company: String(lead.company || ''),
    contact: String(lead.contact || ''),
    stage: String(lead.stage || ''),
    created_at: String(lead.created_at || ''),
  }))
}

export async function listLeadsForReview({ limit = 50, includeSynthetic = false } = {}, store = defaultStore) {
  const bounded = Number(limit)
  if (!Number.isInteger(bounded) || bounded < 1 || bounded > MAX_LIST_LIMIT) {
    return { ok: false, reason: 'invalid_leads_review_query' }
  }
  if (typeof includeSynthetic !== 'boolean') return { ok: false, reason: 'invalid_leads_review_query' }
  if (!leadsSourceConfigured(store)) return sourceNotConfigured()
  // Real leads are not necessarily the newest rows — a burst of smoke tests can push genuine
  // prospects out of a small window. When filtering, scan the widest allowed page and narrow
  // afterwards, so a real lead is never lost behind test traffic.
  const scanLimit = includeSynthetic ? bounded : MAX_LIST_LIMIT
  const [leads, converted, reviews] = await Promise.all([
    store.listLeads(scanLimit),
    store.convertedLeadIds().catch(() => []),
    store.listControlRecords({
      prefix: LEAD_REVIEW_RECORD_PREFIX,
      clientId: LEADS_REVIEW_TENANT,
      status: 'reviewed',
      limit: REVIEW_RECORD_SCAN_LIMIT,
    }),
  ])
  const reviewByLead = new Map()
  for (const record of reviews?.records || []) {
    const payload = record?.payload
    if (payload && payload.status === 'reviewed' && typeof payload.leadId === 'string') {
      reviewByLead.set(payload.leadId, payload)
    }
  }
  const convertedSet = new Set(converted)
  const classified = leads.map((lead) => {
    const review = reviewByLead.get(lead.id)
    return {
      ...lead,
      synthetic: isSyntheticLead(lead),
      converted: convertedSet.has(lead.id),
      reviewed: Boolean(review),
      ...(review ? { review: publicReview(review) } : {}),
    }
  })
  const kept = includeSynthetic ? classified : classified.filter((lead) => !lead.synthetic)
  return {
    ok: true,
    mode: store.mode,
    source: 'configured',
    scanned: leads.length,
    syntheticHidden: includeSynthetic ? 0 : classified.length - kept.length,
    // The scan window is finite; say so rather than implying the funnel is this small.
    scanTruncated: leads.length >= scanLimit,
    leads: kept.slice(0, bounded),
  }
}

// Records the founder's review decision. Idempotent: marking an already-reviewed lead replays the
// stored record. The control record is the ONLY side effect — no message leaves the platform.
export async function markLeadReviewed({ leadId, reviewedBy = 'owner-console' } = {}, store = defaultStore, now = () => new Date().toISOString()) {
  const id = String(leadId || '').trim()
  const reviewer = String(reviewedBy || '').trim()
  if (!LEAD_ID_RE.test(id)) return { ok: false, reason: 'invalid_lead_id' }
  if (!REVIEWER_RE.test(reviewer)) return { ok: false, reason: 'invalid_reviewer' }
  if (!leadsSourceConfigured(store)) return sourceNotConfigured()

  const recordKey = leadReviewRecordKey(id)
  const existing = await store.getControlRecord(recordKey)
  if (existing) {
    if (existing.status === 'reviewed' && existing.leadId === id && existing.clientId === LEADS_REVIEW_TENANT) {
      return { ok: true, replayed: true, review: publicReview(existing) }
    }
    return { ok: false, reason: 'lead_review_conflict' }
  }

  const lead = await store.getLead(id)
  if (!lead) return { ok: false, reason: 'lead_not_found' }

  const reviewedAt = String(now())
  const reviewInput = {
    leadId: id,
    clientId: LEADS_REVIEW_TENANT,
    stage: String(lead.stage || ''),
    leadHash: leadSnapshotHash(lead),
    reviewedBy: reviewer,
    reviewedAt,
  }
  const reviewHash = sha256(stableJson(reviewInput))
  const payload = { version: 1, status: 'reviewed', ...reviewInput, reviewHash }
  let stored = false
  try { stored = Boolean(await store.putControlRecord(recordKey, payload)) } catch { stored = false }
  if (!stored) return { ok: false, reason: 'lead_review_store_unavailable' }
  return { ok: true, replayed: false, review: publicReview(payload) }
}

export default { LEADS_REVIEW_TENANT, LEAD_REVIEW_RECORD_PREFIX, LEADS_SOURCE_REQUIRED_ENV, leadReviewRecordKey, leadsSourceConfigured, isSyntheticLead, listLeadsForReview, markLeadReviewed }
