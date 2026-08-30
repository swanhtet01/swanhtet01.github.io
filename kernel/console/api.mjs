// SUPERMEGA console — API handlers (host-agnostic). One handle() the dev server and a
// Vercel function both call. Passcode-gated (x-ops-key). See ../../PLATFORM.md.

import { usableOpsKey } from '../ops-key.mjs'
import store from '../store.mjs'
import { generateDeal, normalizeDealPacket } from './deal.mjs'
import { onDealSaved, onProjectShipped } from './graduation.mjs'
import connectors from '../connectors/index.mjs'
import { captureError } from '../alert.mjs'
import { companyDailyBudgetCap, currentDailyBudgetWindow, providerChain } from '../gateway.mjs'
import { listLeadsForReview, markLeadReviewed } from './leads-review.mjs'
import crypto from 'node:crypto'

// One implementation of the floor for every owner surface — see kernel/ops-key.mjs. A key
// below it reads as absent here, so the existing missing-key branch refuses everything and
// the console behaves identically to crew, approvals, operator and the workcell endpoints.
const OPS_KEY = usableOpsKey(process.env.SUPERMEGA_OPS_KEY)
// A rejected request is worth recording — a credential-stuffing run against the console
// currently leaves no trace at all. But the log write happens BEFORE authentication, so
// writing one row per failure would hand an unauthenticated caller a way to flood the
// activity table. Collapse bursts to one row per window; sustained volume control belongs
// at the WAF, not here.
const AUTH_FAILURE_LOG_INTERVAL_MS = 60_000
let lastAuthFailureLoggedAt = 0
let authFailureCount = 0
// Next count that forces an entry: 1, then 10, 100, 1000 …
let nextAuthFailureThreshold = 1
// Constant-time, length-safe equality (hash both to fixed-width digests so timingSafeEqual
// never throws on unequal lengths and no length is leaked via timing).
function constantTimeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}
const PROJECT_STATUSES = ['scoping', 'deposit', 'building', 'live', 'care']
const DEAL_STATUSES = ['draft', 'approved', 'sent']
// USD anchors per offer (mirrors /offers/). Deposit = 50%. care-plan is monthly (MRR).
// care-plan = 79 (Care-Lite/mo) is required by mrrUsd below — without it OFFER_USD['care-plan']
// is undefined → mrrUsd NaN. The public console PRICE table MUST mirror these exactly so the
// displayed deposit equals the Stripe charge for the same offer.
const OFFER_USD = { 'tool-week': 600, dashboard: 1800, 'ai-agent': 2500, 'design-ship': 6000, build: 1800, 'care-plan': 79 }
const priceOf = (offer) => OFFER_USD[offer] || OFFER_USD.build
const aiConfigured = () => providerChain().length > 0

function leadConversionRecordId(kind, leadId) {
  const digest = crypto.createHash('sha256')
    .update(`supermega.lead-conversion-${kind}.v1:${leadId}`)
    .digest('hex')
  return `lead-${kind}-${digest.slice(0, 40)}`
}

async function createOrReadConversionRecord(read, create, failureCode) {
  const existing = await read()
  if (existing) return existing
  try {
    const created = await create()
    if (created) return created
  } catch (error) {
    const recovered = await read().catch(() => null)
    if (recovered) return recovered
    throw error
  }
  const recovered = await read()
  if (recovered) return recovered
  throw new Error(failureCode)
}

function operatorAiBudgetStatus(usage, window, capUnits) {
  const contract = 'supermega.company-ai-budget-status.v1'
  const unavailable = {
    contract,
    window,
    unit: 'bulk_equivalent_tokens',
    available: false,
    readiness: 'unavailable',
    durableStoreReady: false,
    capUnits,
    reservedUnits: null,
    remainingUnits: null,
    utilizationPercent: null,
    attempts: null,
    states: { inFlight: null, consumed: null, failed: null },
  }
  if (usage?.available !== true) return unavailable
  const metric = (value) => value !== null && value !== undefined && value !== ''
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null
  const reservedUnits = metric(usage.reservedUnits)
  const attempts = metric(usage.attempts)
  const inFlight = metric(usage.inFlight)
  const consumed = metric(usage.consumed)
  const failed = metric(usage.failed)
  if ([reservedUnits, attempts, inFlight, consumed, failed].includes(null)
    || inFlight + consumed + failed !== attempts) return unavailable
  const durableStoreReady = usage.durable === true
  return {
    contract,
    window,
    unit: 'bulk_equivalent_tokens',
    available: true,
    readiness: durableStoreReady ? 'durable' : 'ephemeral',
    durableStoreReady,
    capUnits,
    reservedUnits,
    remainingUnits: Math.max(0, capUnits - reservedUnits),
    utilizationPercent: Number(((reservedUnits / capUnits) * 100).toFixed(1)),
    attempts,
    states: { inFlight, consumed, failed },
  }
}

const ok = (json) => ({ status: 200, json })
const bad = (status, reason) => ({ status, json: { ok: false, reason } })
const safeMetaValue = (value, limit = 120) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value).slice(0, limit)
}
const safePath = (value) => String(value || '').split('?')[0].slice(0, 120)
const recordConsoleError = (context, detail, meta = {}) => captureError(context, detail, Object.fromEntries(
  Object.entries(meta)
    .map(([key, value]) => [key, safeMetaValue(value)])
    .filter(([, value]) => value !== null),
)).catch(() => {})
const log = (kind, summary, ref) => store.logActivity({ kind, summary, ref })
  .then((entry) => entry || recordConsoleError('console.activity_log_failed', 'activity_log_not_recorded', { kind, ref }))
  .catch((error) => recordConsoleError('console.activity_log_failed', error, { kind, ref }))

// Packet fields are generated text seeded from public contact-form input and can contain
// characters that are markup in HTML. Interpolating them raw does not just risk injection
// — it routinely mangles ordinary content, e.g. a Burmese business name containing '&' or
// an MMK range written with '<'. Escape before any deliberate markup is added.
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

// Records a rejected console request. Never logs the supplied key or any part of it —
// only that a rejection happened, where, and how many were folded into this entry.
function recordAuthFailure(method, path) {
  authFailureCount += 1
  const now = Date.now()
  // Log on the first failure, then at each power of ten, and otherwise at most once per
  // window. A time window alone silently loses a burst that STOPS inside it: 500 attempts
  // in thirty seconds logged the first and discarded the other 499, so the entry meant to
  // reveal credential stuffing under-reported it 500-fold. The count thresholds guarantee a
  // burst is always visible while the number of writes grows logarithmically rather than
  // with the attack — 500 attempts produce three entries, not five hundred.
  const hitThreshold = authFailureCount >= nextAuthFailureThreshold
  const windowElapsed = now - lastAuthFailureLoggedAt >= AUTH_FAILURE_LOG_INTERVAL_MS
  if (!hitThreshold && !windowElapsed) return
  if (hitThreshold) nextAuthFailureThreshold *= 10
  lastAuthFailureLoggedAt = now
  const route = String(path || '').slice(0, 120)
  // The running total is reported, not a delta, so a reader never has to add up entries.
  // It is per process: serverless fan-out means several instances each count their own,
  // which errs toward more entries rather than fewer.
  const summary = authFailureCount > 1
    ? `Rejected ${authFailureCount} console requests on this instance (latest ${method} ${route})`
    : `Rejected console request ${method} ${route}`
  log('console.auth_rejected', summary, route)
}

/** @param {{method:string, path:string, query?:object, body?:object, headers?:object}} req */
export async function handle({ method, path, query = {}, body = {}, headers = {} }) {
  // Fail CLOSED: a missing/blank ops key must DENY all requests — never authenticate everyone.
  // usableOpsKey has already reduced a below-floor key to '', so this one branch covers both
  // "never set" and "too short" with a single reason that discloses nothing.
  if (!OPS_KEY) return bad(503, 'ops_key_not_configured')
  if (!constantTimeEqual(String(headers['x-ops-key'] || ''), OPS_KEY)) {
    recordAuthFailure(method, path)
    return bad(401, 'unauthorized')
  }
  const seg = path.replace(/^\/api\//, '').replace(/\/+$/, '').split('/')

  try {
    // ---- STATE (header badges) ----
    if (method === 'GET' && seg[0] === 'state') {
      const budgetWindow = currentDailyBudgetWindow()
      const budgetCapUnits = companyDailyBudgetCap()
      const budgetUsagePromise = Promise.resolve()
        .then(() => store.getAiBudgetUsage(budgetWindow))
        .catch(() => ({ available: false, durable: false, window: budgetWindow }))
      try {
        const [leads, projects, budgetUsage] = await Promise.all([store.listLeads(), store.listProjects(), budgetUsagePromise])
        const byStatus = projects.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {})
        return ok({ ok: true, mode: store.mode, aiConfigured: aiConfigured(), aiBudget: operatorAiBudgetStatus(budgetUsage, budgetWindow, budgetCapUnits), totals: { leads: leads.length, projects: projects.length }, projects: byStatus, dbStatus: 'ok' })
      } catch (e) {
        const budgetUsage = await budgetUsagePromise
        return ok({ ok: true, mode: store.mode, aiConfigured: aiConfigured(), aiBudget: operatorAiBudgetStatus(budgetUsage, budgetWindow, budgetCapUnits), totals: { leads: 0, projects: 0 }, projects: {}, dbStatus: 'error', dbError: String(e.message).slice(0, 140) })
      }
    }

    // ---- DASHBOARD (the money/funnel overview) ----
    if (method === 'GET' && seg[0] === 'dashboard') {
      try {
        const [leads, projects, deals, activity, grad] = await Promise.all([store.listLeads(), store.listProjects(), store.listDeals(), store.listActivity(12), store.listGraduation(100)])
        const byStage = {}; for (const l of leads) byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
        const byStatus = {}; for (const p of projects) byStatus[p.status] = (byStatus[p.status] || 0) + 1
        const pipelineUsd = projects.filter((p) => p.offer !== 'care-plan').reduce((s, p) => s + priceOf(p.offer), 0)
        const paid = projects.filter((p) => p.deposit_status === 'paid')
        const depositUsd = paid.reduce((s, p) => s + Math.round(priceOf(p.offer) * 0.5), 0)
        const mrrUsd = projects.filter((p) => p.offer === 'care-plan' && (p.status === 'live' || p.status === 'care')).length * OFFER_USD['care-plan']
        const gradReady = (grad || []).filter((r) => r.productized || (Number(r.count) || 0) >= 3)
        return ok({ ok: true, dbStatus: 'ok', leads: { total: leads.length, byStage }, projects: { total: projects.length, byStatus, pipelineUsd, live: byStatus.live || 0, care: byStatus.care || 0 }, deposits: { count: paid.length, usd: depositUsd }, mrrUsd, deals: deals.length, activity, graduation: { tracked: (grad || []).length, ready: gradReady.length, top: (grad || []).slice(0, 5).map((r) => ({ signature: r.signature, label: r.label, count: Number(r.count) || 0, productized: Boolean(r.productized) })) } })
      } catch (e) {
        return ok({ ok: true, dbStatus: 'error', dbError: String(e.message).slice(0, 140), leads: { total: 0, byStage: {} }, projects: { total: 0, byStatus: {}, pipelineUsd: 0, live: 0, care: 0 }, deposits: { count: 0, usd: 0 }, mrrUsd: 0, deals: 0, activity: [], graduation: { tracked: 0, ready: 0, top: [] } })
      }
    }

    // ---- LEADS ----
    if (seg[0] === 'leads') {
      // Founder review surface. Fail-closed: without a durable leads source this returns 503
      // `leads_source_not_configured` (never a silent empty list). Read + record only.
      if (method === 'GET' && seg[1] === 'review' && !seg[2]) {
        const limit = query.limit != null && String(query.limit).trim() !== '' ? Number(query.limit) : 50
        // Smoke-test submissions share this table with customers; they stay hidden unless asked for.
        const includeSynthetic = String(query.includeSynthetic ?? '').trim() === '1'
        const result = await listLeadsForReview({ limit, includeSynthetic })
        if (!result.ok) return { status: result.reason === 'leads_source_not_configured' ? 503 : 400, json: result }
        return ok(result)
      }
      if (method === 'POST' && seg[1] && seg[1] !== 'review' && seg[2] === 'review' && !seg[3]) {
        const result = await markLeadReviewed({
          leadId: seg[1],
          reviewedBy: body.reviewedBy != null ? String(body.reviewedBy).slice(0, 80) : undefined,
        })
        if (!result.ok) {
          const status = result.reason === 'leads_source_not_configured' ? 503
            : result.reason === 'lead_not_found' ? 404
            : result.reason === 'lead_review_store_unavailable' ? 503
            : 400
          return { status, json: result }
        }
        if (!result.replayed) log('review', 'Lead marked reviewed', seg[1])
        return ok(result)
      }
      if (method === 'GET' && !seg[1]) {
        try {
          const [leads, converted] = await Promise.all([store.listLeads(), store.convertedLeadIds()])
          const set = new Set(converted)
          return ok({ ok: true, mode: store.mode, leads: leads.map((l) => ({ ...l, converted: set.has(l.id) })) })
        } catch (e) { return ok({ ok: true, mode: store.mode, leads: [], dbStatus: 'error', dbError: String(e.message).slice(0, 140) }) }
      }
      if (method === 'POST' && !seg[1]) {
        const lead = await store.insertLead({
          id:      String(body.id || '').slice(0, 80) || undefined,
          source:  String(body.source || 'manual').slice(0, 40),
          name:    String(body.name || '').slice(0, 200),
          company: String(body.company || '').slice(0, 200),
          contact: String(body.contact || '').slice(0, 200),
          package: String(body.package || '').slice(0, 80),
          message: String(body.message || '').slice(0, 4000),
          score:   body.score != null ? Number(body.score) : undefined,
          stage:   body.stage ? String(body.stage).slice(0, 40) : undefined,
          created_at: body.created_at ? String(body.created_at) : undefined,
        })
        return ok({ ok: true, lead })
      }
      if (method === 'PATCH' && seg[1] && !seg[2]) {
        // store.updateLead maps: stage→lead_stage, score→lead_score only.
        // Sending any other field produces an empty dbPatch and returns null.
        const patch = {}
        if (body.stage) patch.stage = String(body.stage).slice(0, 40)
        if (body.score != null) patch.score = Number(body.score) || 0
        if (!Object.keys(patch).length) return bad(400, 'no_patchable_fields')
        const lead = await store.updateLead(seg[1], patch)
        if (!lead) return bad(404, 'lead_not_found')
        if (patch.stage) log('pipeline', `Lead stage → ${patch.stage}`, seg[1])
        return ok({ ok: true, lead })
      }
      if (method === 'POST' && seg[1] && !seg[2] && query.action === 'convert') {
        const lead = await store.getLead(seg[1])
        if (!lead) return bad(404, 'lead_not_found')
        const clientId = leadConversionRecordId('client', lead.id)
        const projectId = leadConversionRecordId('project', lead.id)
        const deterministicClient = await store.getClient(clientId)
        const matchingProjects = (await store.listProjects()).filter((project) => project.lead_id === lead.id)
        if (matchingProjects.length > 1) return bad(409, 'lead_conversion_ambiguous')
        let project = matchingProjects[0] || null
        if (project && ((project.id === projectId && project.client_id !== clientId)
          || (deterministicClient && project.client_id !== clientId))) {
          return bad(409, 'lead_conversion_ambiguous')
        }
        let client = project?.client_id ? await store.getClient(project.client_id) : deterministicClient
        if (project && !client) return bad(409, 'lead_conversion_client_missing')
        if (!project) {
          if (!client) {
            client = await createOrReadConversionRecord(
              () => store.getClient(clientId),
              () => store.createClient({ id: clientId, name: lead.company || lead.name || 'New client', contacts: [{ name: lead.name, channel: 'contact', handle: lead.contact }] }),
              'lead_conversion_client_create_failed',
            )
          }
          project = await createOrReadConversionRecord(
            () => store.getProject(projectId),
            () => store.createProject({ id: projectId, client_id: client.id, lead_id: lead.id, offer: lead.package || body.offer || 'build', status: 'scoping' }),
            'lead_conversion_project_create_failed',
          )
          if (project.lead_id !== lead.id || project.client_id !== client.id) return bad(409, 'lead_conversion_ambiguous')
        }
        if (lead.stage === 'won') return ok({ ok: true, client, project, lead, replayed: true })
        const wonTransition = await store.markLeadWon(seg[1]).catch(async (error) => {
          await recordConsoleError('console.lead_convert_won_stage_failed', error, { leadId: lead.id, clientId: client.id, projectId: project.id })
          return null
        })
        if (!wonTransition) {
          await recordConsoleError('console.lead_convert_partial_project', 'lead_won_stage_not_recorded', { leadId: lead.id, clientId: client.id, projectId: project.id })
          return bad(500, 'lead_won_stage_update_failed')
        }
        if (wonTransition.changed) log('won', `Won ${lead.company || lead.name} → ${project.offer} project`, project.id)
        return ok({ ok: true, client, project, lead: wonTransition.lead, replayed: !wonTransition.changed })
      }
    }

    // ---- PROJECTS ----
    if (seg[0] === 'projects') {
      if (method === 'GET' && !seg[1]) return ok({ ok: true, projects: await store.listProjects() })
      if (method === 'PATCH' && seg[1]) {
        const patch = {}
        if (body.status && PROJECT_STATUSES.includes(body.status)) patch.status = body.status
        if (body.deposit_status) patch.deposit_status = String(body.deposit_status).slice(0, 20)
        if (body.deposit_method) patch.deposit_method = String(body.deposit_method).slice(0, 20)
        if (body.scope_summary != null) patch.scope_summary = String(body.scope_summary).slice(0, 4000)
        if (body.live_url != null) patch.live_url = String(body.live_url).slice(0, 400)
        if (body.price_mmk != null) patch.price_mmk = Number(body.price_mmk) || null
        const project = await store.updateProject(seg[1], patch)
        if (!project) return bad(404, 'project_not_found')
        if (patch.status) log('project', `Project → ${patch.status}`, project.id)
        if (patch.deposit_status === 'paid') log('deposit', `Deposit marked paid (${project.deposit_method || 'KBZPay/MMQR'})`, project.id)
        // Auto-graduation flywheel: a shipped project records its modules + bumps their repeat counters (best-effort).
        if (patch.status === 'live') {
          store.listDeals({ project_id: project.id })
            .then(async (ds) => {
              let modules = ds?.[0]?.packet?.modules
              if (!modules?.length && project.lead_id) { const byLead = await store.listDeals({ lead_id: project.lead_id }); modules = byLead?.[0]?.packet?.modules }
              if (modules?.length) await onProjectShipped(project.id, modules, project.id)
            })
            .catch((error) => recordConsoleError('console.project_shipped_graduation_failed', error, { projectId: project.id }))
        }
        return ok({ ok: true, project })
      }
    }

    // ---- RUN A DEAL (gateway → Anthropic; never sends anything) ----
    if (method === 'POST' && seg[0] === 'deal') {
      const result = await generateDeal({ name: body.name, company: body.company, workflow: body.workflow, contact: body.contact })
      if (!result.ok) return bad(result.reason === 'ai_not_configured' ? 503 : 502, result.reason)
      return ok({ ok: true, packet: result.packet })
    }

    // ---- DEALS (save a generated packet; list; outreach status) ----
    if (seg[0] === 'deals') {
      if (method === 'GET' && !seg[1]) {
        const filter = {}
        if (query.lead_id) filter.lead_id = query.lead_id
        if (query.status) filter.status = query.status
        return ok({ ok: true, deals: await store.listDeals(filter) })
      }
      if (method === 'POST' && !seg[1]) {
        if (!body.packet) return bad(400, 'no_packet')
        const normalized = normalizeDealPacket(body.packet)
        if (!normalized.ok) return bad(400, normalized.reason)
        const deal = await store.saveDeal({ lead_id: body.lead_id || null, project_id: body.project_id || null, packet: normalized.packet, status: 'draft' })
        log('deal', `Deal saved: ${String(normalized.packet.headline || '').slice(0, 60)}`, deal.id)
        // Auto-graduation flywheel: each module signature in the packet bumps its repeat counter (best-effort).
        onDealSaved(normalized.packet, deal.id)
          .catch((error) => recordConsoleError('console.deal_graduation_failed', error, { dealId: deal.id }))
        return ok({ ok: true, deal })
      }
      if (method === 'PATCH' && seg[1] && !seg[2]) {
        const patch = {}
        if (body.status && DEAL_STATUSES.includes(body.status)) patch.status = body.status
        const deal = await store.updateDeal(seg[1], patch)
        if (!deal) return bad(404, 'deal_not_found')
        if (patch.status === 'sent') log('outreach', `Outreach marked sent`, deal.id)
        if (patch.status === 'approved') log('outreach', `Outreach approved`, deal.id)
        return ok({ ok: true, deal })
      }
      // POST /api/deals/:id?action=send — fires the approved outreach email via Resend.
      // Gate: deal.status must be 'approved' — enforces draft→approve→send discipline.
      // Uses query.action (not a 3rd path segment) because Vercel's [[...path]] only matches 1 segment.
      if (method === 'POST' && seg[1] && !seg[2] && query.action === 'send') {
        const rows = await store.listDeals({ id: seg[1] })
        const deal = rows[0] || null
        if (!deal) return bad(404, 'deal_not_found')
        if (deal.status !== 'approved') return bad(400, 'deal_not_approved')
        const resend = connectors.get('messaging-resend')
        if (!resend || !resend.configured()) return bad(503, 'resend_not_configured')
        // Resolve recipient: explicit body.to or lead contact if it contains '@'.
        let to = String(body.to || '').trim()
        if (!to && deal.lead_id) {
          const lead = await store.getLead(deal.lead_id)
          const contact = String(lead?.contact || '')
          if (contact.includes('@')) to = contact
        }
        if (!to) return bad(400, 'no_recipient_email')
        const p = deal.packet || {}
        const subject = p.headline ? `Proposal: ${String(p.headline).slice(0, 160)}` : 'A custom software proposal from SuperMega'
        const modulesHtml = (p.modules || []).map((m) => `<li><strong>${escapeHtml(m.name)}</strong> — ${escapeHtml(m.why)}</li>`).join('')
        const html = [
          '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6">',
          // Escaped first, so only these <br> are markup — anything markup-shaped in the
          // author's text stays visible text.
          p.outreach_en ? `<p>${escapeHtml(p.outreach_en).replace(/\n/g, '<br>')}</p>` : '',
          modulesHtml ? `<p><strong>What we'd build for you:</strong></p><ul>${modulesHtml}</ul>` : '',
          p.pricing?.build_fee_mmk ? `<p><strong>Build fee:</strong> ${escapeHtml(p.pricing.build_fee_mmk)}${p.pricing.pro_mrr_mmk ? ` &middot; Care: ${escapeHtml(p.pricing.pro_mrr_mmk)}/mo` : ''}</p>` : '',
          p.first_proof ? `<p><strong>First result you'd see:</strong> ${escapeHtml(p.first_proof)}</p>` : '',
          '<p style="margin-top:24px">— Swan Htet, SuperMega<br><a href="https://supermega.dev">supermega.dev</a></p>',
          '</div>',
        ].filter(Boolean).join('\n')
        const text = p.outreach_en || p.headline || ''
        const sent = await resend.send({ to, subject, html, text })
        // resend.send() returns { ok:false, reason } on failure — it does NOT throw. Do NOT mark the
        // deal 'sent' or log success unless the email actually went out. The whole console is built on
        // the draft→approve→SEND integrity guarantee; a silent "sent" on a failed send breaks it.
        if (!sent || !sent.ok) return bad(502, sent?.reason || 'email_send_failed')
        const updated = await store.updateDeal(seg[1], { status: 'sent' })
        log('outreach', `Email sent to ${to.slice(0, 80)}: "${String(p.headline || '').slice(0, 60)}"`, deal.id)
        return ok({ ok: true, email_id: sent.id, to, deal: updated })
      }
    }

    // ---- STRIPE PAYMENT LINK — create a Checkout session for a project deposit.
    // POST /api/projects/:id?action=pay  { currency? }
    // Gate: project must exist. Stripe connector must be configured.
    // Returns { ok, url, session_id } — CEO shares the URL with the client.
    if (method === 'POST' && seg[0] === 'projects' && seg[1] && !seg[2] && query.action === 'pay') {
      const project = (await store.listProjects()).find((p) => p.id === seg[1])
      if (!project) return bad(404, 'project_not_found')
      const stripe = connectors.get('payment-stripe')
      if (!stripe || !stripe.configured()) return bad(503, 'stripe_not_configured')
      const usd = priceOf(project.offer)
      const deposit = Math.round(usd * 0.5) // 50% deposit
      const currency = String(body.currency || 'usd').toLowerCase()
      const result = await stripe.createCheckout({ amount: deposit, currency, ref: project.id, description: `SuperMega deposit — ${project.offer || 'build'} (50%)` })
      // createCheckout returns { ok:false, reason } on bad-amount / API error — it does NOT throw.
      // Don't log "checkout created" or hand back an undefined URL when the session wasn't created.
      if (!result || !result.ok) return bad(502, result?.reason || 'stripe_checkout_failed')
      log('payment', `Stripe checkout created: $${deposit} for project ${project.offer}`, project.id)
      return ok({ ok: true, url: result.url, session_id: result.id, amount_usd: deposit, ref: project.id })
    }

    // ---- CLIENTS ----
    if (method === 'GET' && seg[0] === 'clients') return ok({ ok: true, clients: await store.listClients() })

    // ---- ACTIVITY LOG ----
    if (method === 'GET' && seg[0] === 'activity') return ok({ ok: true, activity: await store.listActivity(Number(query.limit) || 40) })

    // ---- GRADUATION TRACKER (auto-flywheel: which requests have repeated → which are productize-ready) ----
    if (method === 'GET' && seg[0] === 'graduation') {
      const rows = await store.listGraduation(Number(query.limit) || 100)
      const ready = rows.filter((r) => r.productized || (Number(r.count) || 0) >= 3)
      return ok({ ok: true, threshold: 3, ready: ready.length, graduation: rows })
    }

    // ---- INTEGRATIONS (connector framework health; same passcode gate as everything above) ----
    if (method === 'GET' && seg[0] === 'integrations') {
      const report = await connectors.healthAll()
      // Reshape each flat probe result into the shape the Connectors panel UI expects:
      // { key, name, category, configured, health: { ok, detail } }
      const shaped = report.connectors.map(({ ok: cOk, detail, ...rest }) => ({
        ...rest,
        health: { ok: cOk, detail: detail || (cOk ? 'ok' : 'unhealthy') },
      }))
      return ok({ mode: store.mode, ok: report.ok, counts: report.counts, byCategory: report.byCategory, connectors: shaped })
    }

    // ---- AUTOPILOT (batch deal generation for un-dealt leads) ----
    if (method === 'POST' && seg[0] === 'autopilot') {
      if (!aiConfigured()) return bad(503, 'ai_not_configured')
      const [leads, deals] = await Promise.all([store.listLeads(), store.listDeals()])
      const dealtLeads = new Set(deals.map((d) => d.lead_id).filter(Boolean))
      const pending = leads.filter((l) => !dealtLeads.has(l.id) && (!l.stage || l.stage === 'new' || l.stage === 'qualified')).slice(0, 5)
      if (!pending.length) return ok({ ok: true, ran: 0, message: 'No pending leads to process.' })
      const results = []
      for (const lead of pending) {
        const result = await generateDeal({ name: lead.name, company: lead.company, workflow: lead.package, contact: lead.contact })
        if (result.ok) {
          const deal = await store.saveDeal({ lead_id: lead.id, packet: result.packet, status: 'draft' })
          log('autopilot', `Autopilot: deal generated for ${lead.company || lead.name}`, deal.id)
          results.push({ lead_id: lead.id, company: lead.company || lead.name, deal_id: deal.id, ok: true })
        } else {
          results.push({ lead_id: lead.id, company: lead.company || lead.name, ok: false, reason: result.reason })
        }
      }
      return ok({ ok: true, ran: results.length, results })
    }

    return bad(404, 'not_found')
  } catch (err) {
    await recordConsoleError('console.api_unhandled_error', err, { method, path: safePath(path) })
    return bad(500, String(err.message || 'server_error').slice(0, 160))
  }
}

export default { handle }
