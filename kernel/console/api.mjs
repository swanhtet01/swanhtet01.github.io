// SUPERMEGA console — API handlers (host-agnostic). One handle() the dev server and a
// Vercel function both call. Passcode-gated (x-ops-key). See ../../PLATFORM.md.

import store from '../store.mjs'
import { generateDeal } from './deal.mjs'
import { onDealSaved, onProjectShipped } from './graduation.mjs'
import connectors from '../connectors/index.mjs'

const OPS_KEY = (process.env.SUPERMEGA_OPS_KEY || '').trim()
const PROJECT_STATUSES = ['scoping', 'deposit', 'building', 'live', 'care']
const DEAL_STATUSES = ['draft', 'approved', 'sent']
// USD anchors per offer (mirrors /offers/). Deposit = 50%. care-plan is monthly (MRR).
const OFFER_USD = { 'tool-week': 600, dashboard: 1800, 'ai-agent': 2500, 'design-ship': 6000, build: 1800 }
const priceOf = (offer) => OFFER_USD[offer] || OFFER_USD.build
const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)

const ok = (json) => ({ status: 200, json })
const bad = (status, reason) => ({ status, json: { ok: false, reason } })
const log = (kind, summary, ref) => store.logActivity({ kind, summary, ref }).catch(() => {})

/** @param {{method:string, path:string, query?:object, body?:object, headers?:object}} req */
export async function handle({ method, path, query = {}, body = {}, headers = {} }) {
  if (OPS_KEY && String(headers['x-ops-key'] || '') !== OPS_KEY) return bad(401, 'unauthorized')
  const seg = path.replace(/^\/api\//, '').replace(/\/+$/, '').split('/')

  try {
    // ---- STATE (header badges) ----
    if (method === 'GET' && seg[0] === 'state') {
      try {
        const [leads, projects] = await Promise.all([store.listLeads(), store.listProjects()])
        const byStatus = projects.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {})
        return ok({ ok: true, mode: store.mode, aiConfigured: aiConfigured(), totals: { leads: leads.length, projects: projects.length }, projects: byStatus, dbStatus: 'ok' })
      } catch (e) {
        return ok({ ok: true, mode: store.mode, aiConfigured: aiConfigured(), totals: { leads: 0, projects: 0 }, projects: {}, dbStatus: 'error', dbError: String(e.message).slice(0, 140) })
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
      if (method === 'GET' && !seg[1]) {
        try {
          const [leads, converted] = await Promise.all([store.listLeads(), store.convertedLeadIds()])
          const set = new Set(converted)
          return ok({ ok: true, mode: store.mode, leads: leads.map((l) => ({ ...l, converted: set.has(l.id) })) })
        } catch (e) { return ok({ ok: true, mode: store.mode, leads: [], dbStatus: 'error', dbError: String(e.message).slice(0, 140) }) }
      }
      if (method === 'POST' && !seg[1]) {
        try {
          const lead = await store.insertLead({ source: 'manual', name: String(body.name || '').slice(0, 200), company: String(body.company || '').slice(0, 200), contact: String(body.contact || '').slice(0, 200), package: String(body.package || '').slice(0, 80), message: String(body.message || '').slice(0, 4000) })
          return ok({ ok: true, lead })
        } catch (e) { if (String(e.message) === 'leads_from_site') return bad(400, 'leads_from_site'); throw e }
      }
      if (method === 'PATCH' && seg[1] && !seg[2]) {
        const patch = {}
        if (body.stage) patch.stage = String(body.stage).slice(0, 40)
        if (body.contact != null) patch.contact = String(body.contact).slice(0, 200)
        if (body.company != null) patch.company = String(body.company).slice(0, 200)
        if (!Object.keys(patch).length) return bad(400, 'no_patchable_fields')
        const lead = await store.updateLead(seg[1], patch)
        if (!lead) return bad(404, 'lead_not_found')
        if (patch.stage) log('pipeline', `Lead stage → ${patch.stage}`, seg[1])
        return ok({ ok: true, lead })
      }
      if (method === 'POST' && seg[1] && !seg[2] && query.action === 'convert') {
        const lead = await store.getLead(seg[1])
        if (!lead) return bad(404, 'lead_not_found')
        const client = await store.createClient({ name: lead.company || lead.name || 'New client', contacts: [{ name: lead.name, channel: 'contact', handle: lead.contact }] })
        const project = await store.createProject({ client_id: client.id, lead_id: lead.id, offer: lead.package || body.offer || 'build', status: 'scoping' })
        await store.updateLead(seg[1], { stage: 'won' }).catch(() => {})
        log('won', `Won ${lead.company || lead.name} → ${project.offer} project`, project.id)
        return ok({ ok: true, client, project })
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
            .catch(() => {})
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
        const deal = await store.saveDeal({ lead_id: body.lead_id || null, project_id: body.project_id || null, packet: body.packet, status: 'draft' })
        log('deal', `Deal saved: ${String(body.packet.headline || '').slice(0, 60)}`, deal.id)
        // Auto-graduation flywheel: each module signature in the packet bumps its repeat counter (best-effort).
        onDealSaved(body.packet, deal.id).catch(() => {})
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
        const modulesHtml = (p.modules || []).map((m) => `<li><strong>${m.name}</strong> — ${m.why}</li>`).join('')
        const html = [
          '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6">',
          p.outreach_en ? `<p>${p.outreach_en.replace(/\n/g, '<br>')}</p>` : '',
          modulesHtml ? `<p><strong>What we'd build for you:</strong></p><ul>${modulesHtml}</ul>` : '',
          p.pricing?.build_fee_mmk ? `<p><strong>Build fee:</strong> ${p.pricing.build_fee_mmk}${p.pricing.pro_mrr_mmk ? ` &middot; Care: ${p.pricing.pro_mrr_mmk}/mo` : ''}</p>` : '',
          p.first_proof ? `<p><strong>First result you'd see:</strong> ${p.first_proof}</p>` : '',
          '<p style="margin-top:24px">— Swan Htet, SuperMega<br><a href="https://supermega.dev">supermega.dev</a></p>',
          '</div>',
        ].filter(Boolean).join('\n')
        const text = p.outreach_en || p.headline || ''
        const sent = await resend.send({ to, subject, html, text })
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
    return bad(500, String(err.message || 'server_error').slice(0, 160))
  }
}

export default { handle }
