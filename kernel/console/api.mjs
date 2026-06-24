// SUPERMEGA console — API handlers (host-agnostic). One handle() the dev server and a
// Vercel function both call. Passcode-gated (x-ops-key). See ../../PLATFORM.md.

import store from '../store.mjs'
import { generateDeal } from './deal.mjs'

const OPS_KEY = (process.env.SUPERMEGA_OPS_KEY || '').trim()
const PROJECT_STATUSES = ['scoping', 'deposit', 'building', 'live', 'care']
const DEAL_STATUSES = ['draft', 'approved', 'sent']
// USD anchors per offer (mirrors /offers/). Deposit = 50%. care-plan is monthly (MRR).
const OFFER_USD = { 'tool-week': 600, dashboard: 1500, 'ai-agent': 2500, 'design-ship': 6000, 'care-plan': 300, build: 2000 }
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
        const [leads, projects, deals, activity] = await Promise.all([store.listLeads(), store.listProjects(), store.listDeals(), store.listActivity(12)])
        const byStage = {}; for (const l of leads) byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
        const byStatus = {}; for (const p of projects) byStatus[p.status] = (byStatus[p.status] || 0) + 1
        const pipelineUsd = projects.filter((p) => p.offer !== 'care-plan').reduce((s, p) => s + priceOf(p.offer), 0)
        const paid = projects.filter((p) => p.deposit_status === 'paid')
        const depositUsd = paid.reduce((s, p) => s + Math.round(priceOf(p.offer) * 0.5), 0)
        const mrrUsd = projects.filter((p) => p.offer === 'care-plan' && (p.status === 'live' || p.status === 'care')).length * OFFER_USD['care-plan']
        return ok({ ok: true, dbStatus: 'ok', leads: { total: leads.length, byStage }, projects: { total: projects.length, byStatus, pipelineUsd, live: byStatus.live || 0, care: byStatus.care || 0 }, deposits: { count: paid.length, usd: depositUsd }, mrrUsd, deals: deals.length, activity })
      } catch (e) {
        return ok({ ok: true, dbStatus: 'error', dbError: String(e.message).slice(0, 140), leads: { total: 0, byStage: {} }, projects: { total: 0, byStatus: {}, pipelineUsd: 0, live: 0, care: 0 }, deposits: { count: 0, usd: 0 }, mrrUsd: 0, deals: 0, activity: [] })
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
        const lead = await store.insertLead({
          id: body.id || null,
          source: String(body.source || 'manual').slice(0, 60),
          name: String(body.name || '').slice(0, 200),
          company: String(body.company || '').slice(0, 200),
          contact: String(body.contact || '').slice(0, 200),
          package: String(body.package || '').slice(0, 80),
          message: String(body.message || '').slice(0, 4000),
          score: Number(body.score || 0),
          stage: String(body.stage || 'new').slice(0, 30),
          created_at: body.created_at || null,
        })
        if (String(body.source || '') === 'autopilot') log('autopilot', `Synced: ${lead.company || lead.name}`, lead.id)
        return ok({ ok: true, lead })
      }
      if (method === 'PATCH' && seg[1] && !seg[2]) {
        const patch = {}
        if (body.stage) patch.stage = String(body.stage).slice(0, 30)
        const lead = await store.updateLead(seg[1], patch)
        if (!lead) return bad(404, 'lead_not_found')
        if (patch.stage) log('lead', `Lead stage → ${patch.stage}`, lead.id)
        return ok({ ok: true, lead })
      }
      if (method === 'POST' && seg[1] && seg[2] === 'convert') {
        const lead = await store.getLead(seg[1])
        if (!lead) return bad(404, 'lead_not_found')
        const client = await store.createClient({ name: lead.company || lead.name || 'New client', contacts: [{ name: lead.name, channel: 'contact', handle: lead.contact }] })
        const project = await store.createProject({ client_id: client.id, lead_id: lead.id, offer: lead.package || body.offer || 'build', status: 'scoping' })
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
        return ok({ ok: true, deal })
      }
      if (method === 'PATCH' && seg[1]) {
        const patch = {}
        if (body.status && DEAL_STATUSES.includes(body.status)) patch.status = body.status
        const deal = await store.updateDeal(seg[1], patch)
        if (!deal) return bad(404, 'deal_not_found')
        if (patch.status === 'sent') {
          log('outreach', `Outreach marked sent`, deal.id)
          // Advance the lead stage to 'contacted' so the leads inbox reflects reality
          if (deal.lead_id) store.updateLead(deal.lead_id, { stage: 'contacted' }).catch(() => {})
        }
        if (patch.status === 'approved') log('outreach', `Outreach approved`, deal.id)
        return ok({ ok: true, deal })
      }
    }

    // ---- ACTIVITY LOG ----
    if (seg[0] === 'activity') {
      if (method === 'GET') return ok({ ok: true, activity: await store.listActivity(Number(query.limit) || 40) })
      if (method === 'POST') {
        const kind = String(body.kind || 'note').slice(0, 30)
        const summary = String(body.summary || '').slice(0, 300)
        if (!summary) return bad(400, 'summary_required')
        await log(kind, summary, body.ref || null)
        return ok({ ok: true })
      }
    }

    // ---- GRADUATION TRACKER (3rd repeat → product signal) ----
    if (seg[0] === 'graduation') {
      if (method === 'GET') {
        const rows = await store.listGraduations()
        const counts = {}
        for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1
        const grouped = Object.entries(counts)
          .map(([category, count]) => ({ category, count, flag: count >= 3, entries: rows.filter((r) => r.category === category) }))
          .sort((a, b) => b.count - a.count)
        return ok({ ok: true, grouped, total: rows.length })
      }
      if (method === 'POST') {
        if (!body.category) return bad(400, 'category_required')
        const row = await store.insertGraduation({ category: String(body.category).slice(0, 80), client_name: String(body.client_name || body.name || '').slice(0, 200), project_id: body.project_id || null, note: String(body.note || '').slice(0, 400) })
        log('graduation', `${row.category} → ${row.client_name || '?'}`, row.id)
        return ok({ ok: true, row })
      }
    }

    return bad(404, 'not_found')
  } catch (err) {
    return bad(500, String(err.message || 'server_error').slice(0, 160))
  }
}

export default { handle }
