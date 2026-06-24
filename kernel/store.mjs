// SUPERMEGA kernel — data spine access. Three modes, picked from env:
//  - 'supabase' : Supabase REST (PostgREST) with the service_role key. Reachable everywhere, no DB password.
//  - 'postgres' : direct Postgres via `pg` (Neon/Vercel) when a connection string is present.
//  - 'memory'   : in-process maps, for dev with no credentials.
// Reads real `supermega_leads`; pipeline lives in additive `supermega_console_*` tables. See ../PLATFORM.md.

import { randomUUID } from 'node:crypto'

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

const PG_ENV = ['POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL', 'SUPERMEGA_DATABASE_URL', 'DATABASE_URL']
function connString() {
  for (const n of PG_ENV) { const v = String(process.env[n] || '').trim(); if (/^postgres(?:ql)?:\/\//i.test(v)) return v }
  return ''
}
const CONN = connString()
export const mode = SUPABASE_URL && SUPABASE_KEY ? 'supabase' : CONN ? 'postgres' : 'memory'

// ---------- Supabase REST ----------
async function rest(method, pathAndQuery, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`supabase_${res.status}: ${t.slice(0, 140)}`) }
  if (res.status === 204) return null
  return res.json()
}

// ---------- Postgres (pg), lazily required so memory/supabase modes don't need the dep ----------
let pool
async function pg() {
  if (!pool) {
    const pgmod = (await import('pg')).default
    let ssl = { rejectUnauthorized: false }
    try { const u = new URL(CONN); if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.searchParams.get('sslmode') === 'disable') ssl = false } catch { /* keep ssl */ }
    pool = new pgmod.Pool({ connectionString: CONN, ssl, max: 3, idleTimeoutMillis: 10_000 })
  }
  return pool
}
async function q(sql, params = []) { return (await (await pg()).query(sql, params)).rows || [] }
let tablesReady
async function ensurePgTables() {
  if (!tablesReady) tablesReady = q(`
    create table if not exists supermega_console_clients (id text primary key, name text not null, contacts jsonb default '[]'::jsonb, channels jsonb default '{}'::jsonb, notes text, created_at timestamptz default now());
    create table if not exists supermega_console_projects (id text primary key, client_id text, lead_id text, offer text, scope_summary text, price_mmk bigint, deposit_status text default 'unpaid', deposit_method text, status text default 'scoping', live_url text, created_at timestamptz default now());
    create table if not exists supermega_console_deals (id text primary key, lead_id text, project_id text, packet jsonb, status text default 'draft', created_at timestamptz default now());
    create table if not exists supermega_console_activity (id text primary key, at timestamptz default now(), kind text, summary text, ref text);
    create table if not exists supermega_graduation (id text primary key, category text, client_name text, project_id text, note text, created_at timestamptz default now());
  `).then(() => true)
  return tablesReady
}

// ---------- in-memory fallback ----------
const mem = { lead: new Map(), client: new Map(), project: new Map(), deal: new Map(), activity: new Map(), graduation: new Map() }
const memSort = (rows) => rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

// ---------- leads (real supermega_leads) ----------
const LEAD_COLS = 'lead_id,source,name,email,company,requested_package,goal,lead_score,lead_stage,submitted_at,created_at'
function mapLead(r) {
  return { id: r.lead_id, lead_id: r.lead_id, source: r.source || 'website', name: r.name || '', company: r.company || '', contact: r.email || '', package: r.requested_package || '', message: r.goal || '', score: Number(r.lead_score) || 0, stage: r.lead_stage || '', created_at: r.submitted_at || r.created_at || null }
}
export async function listLeads(limit = 150) {
  if (mode === 'supabase') return (await rest('GET', `supermega_leads?select=${LEAD_COLS}&order=submitted_at.desc.nullslast,created_at.desc&limit=${limit}`)).map(mapLead)
  if (mode === 'postgres') return (await q(`select ${LEAD_COLS} from public.supermega_leads order by submitted_at desc nulls last, created_at desc limit $1`, [limit])).map(mapLead)
  return memSort([...mem.lead.values()])
}
export async function getLead(id) {
  if (mode === 'supabase') { const r = await rest('GET', `supermega_leads?lead_id=eq.${encodeURIComponent(id)}&limit=1`); return r[0] ? mapLead(r[0]) : null }
  if (mode === 'postgres') { const r = await q('select * from public.supermega_leads where lead_id=$1 limit 1', [id]); return r[0] ? mapLead(r[0]) : null }
  return mem.lead.get(id) || null
}
export async function updateLead(id, patch) {
  const allowed = { lead_stage: 'lead_stage', stage: 'lead_stage' }
  const cols = {}
  for (const [k, col] of Object.entries(allowed)) if (patch[k] != null) cols[col] = String(patch[k]).slice(0, 30)
  if (!Object.keys(cols).length) return getLead(id)
  if (mode === 'supabase') { const r = await rest('PATCH', `supermega_leads?lead_id=eq.${encodeURIComponent(id)}`, cols); return r[0] ? mapLead(r[0]) : null }
  if (mode === 'postgres') { const keys = Object.keys(cols); const set = keys.map((k, i) => `${k}=$${i+2}`).join(','); const r = await q(`update public.supermega_leads set ${set} where lead_id=$1 returning ${LEAD_COLS}`, [id, ...keys.map(k => cols[k])]); return r[0] ? mapLead(r[0]) : null }
  const cur = mem.lead.get(id); if (!cur) return null; const next = { ...cur, ...(cols.lead_stage ? { stage: cols.lead_stage } : {}) }; mem.lead.set(id, next); return next
}
export async function insertLead(l) {
  const row = {
    lead_id: String(l.id || l.lead_id || randomUUID()).slice(0, 80),
    source: String(l.source || 'manual').slice(0, 60),
    name: String(l.name || '').slice(0, 200),
    email: String(l.contact || l.email || '').slice(0, 200).toLowerCase(),
    company: String(l.company || '').slice(0, 200),
    requested_package: String(l.package || '').slice(0, 80),
    goal: String(l.message || '').slice(0, 4000),
    lead_score: Number(l.score || 0),
    lead_stage: String(l.stage || 'new').slice(0, 30),
    submitted_at: l.created_at || new Date().toISOString(),
  }
  if (mode === 'supabase') {
    // Upsert — autopilot pushes the same lead nightly; merge so enriched email + latest stage win
    const res = await fetch(`${SUPABASE_URL}/rest/v1/supermega_leads?on_conflict=lead_id`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(row),
    })
    if (!res.ok && res.status !== 409) { const t = await res.text().catch(() => ''); throw new Error(`supabase_${res.status}: ${t.slice(0, 140)}`) }
    const result = res.status === 204 ? [] : await res.json().catch(() => [])
    return result[0] ? mapLead(result[0]) : mapLead({ ...row, id: row.lead_id, created_at: row.submitted_at })
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const r = await q(
      `insert into public.supermega_leads (lead_id,source,name,email,company,requested_package,goal,lead_score,lead_stage,submitted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (lead_id) do nothing returning ${LEAD_COLS}`,
      [row.lead_id, row.source, row.name, row.email, row.company, row.requested_package, row.goal, row.lead_score, row.lead_stage, row.submitted_at]
    )
    return r[0] ? mapLead(r[0]) : mapLead({ ...row, id: row.lead_id, created_at: row.submitted_at })
  }
  const rec = { ...row, id: row.lead_id, created_at: new Date().toISOString(), status: 'new' }
  mem.lead.set(rec.lead_id, mapLead(rec))
  return mapLead(rec)
}

// ---------- pipeline: clients + projects ----------
export async function listProjects() {
  if (mode === 'supabase') return rest('GET', 'supermega_console_projects?order=created_at.desc')
  if (mode === 'postgres') { await ensurePgTables(); return q('select * from supermega_console_projects order by created_at desc') }
  return memSort([...mem.project.values()])
}
export async function createClient(c) {
  const row = { id: randomUUID(), name: c.name || 'New client', contacts: c.contacts || [], channels: c.channels || {}, notes: c.notes || '' }
  if (mode === 'supabase') return (await rest('POST', 'supermega_console_clients', row))[0]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_console_clients (id,name,contacts,channels,notes) values ($1,$2,$3,$4,$5) returning *', [row.id, row.name, JSON.stringify(row.contacts), JSON.stringify(row.channels), row.notes]))[0] }
  const rec = { ...row, created_at: new Date().toISOString() }; mem.client.set(rec.id, rec); return rec
}
export async function createProject(p) {
  const row = { id: randomUUID(), client_id: p.client_id || null, lead_id: p.lead_id || null, offer: p.offer || 'build', scope_summary: p.scope_summary || '', status: p.status || 'scoping', deposit_status: p.deposit_status || 'unpaid' }
  if (mode === 'supabase') return (await rest('POST', 'supermega_console_projects', row))[0]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_console_projects (id,client_id,lead_id,offer,scope_summary,status,deposit_status) values ($1,$2,$3,$4,$5,$6,$7) returning *', [row.id, row.client_id, row.lead_id, row.offer, row.scope_summary, row.status, row.deposit_status]))[0] }
  const rec = { ...row, created_at: new Date().toISOString() }; mem.project.set(rec.id, rec); return rec
}
export async function updateProject(id, patch) {
  if (mode === 'supabase') { const r = await rest('PATCH', `supermega_console_projects?id=eq.${encodeURIComponent(id)}`, patch); return r[0] || null }
  if (mode === 'postgres') {
    await ensurePgTables()
    const keys = Object.keys(patch); if (!keys.length) return (await q('select * from supermega_console_projects where id=$1', [id]))[0] || null
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    return (await q(`update supermega_console_projects set ${set} where id=$1 returning *`, [id, ...keys.map((k) => patch[k])]))[0] || null
  }
  const cur = mem.project.get(id); if (!cur) return null; const next = { ...cur, ...patch }; mem.project.set(id, next); return next
}
export async function convertedLeadIds() {
  if (mode === 'supabase') return [...new Set((await rest('GET', 'supermega_console_projects?select=lead_id&lead_id=not.is.null')).map((r) => r.lead_id))]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('select distinct lead_id from supermega_console_projects where lead_id is not null')).map((r) => r.lead_id) }
  return [...mem.project.values()].map((p) => p.lead_id).filter(Boolean)
}

// ---------- deals (saved deal packets; also the outreach source) ----------
export async function saveDeal(d) {
  const row = { id: randomUUID(), lead_id: d.lead_id || null, project_id: d.project_id || null, packet: d.packet || {}, status: d.status || 'draft' }
  if (mode === 'supabase') return (await rest('POST', 'supermega_console_deals', row))[0]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_console_deals (id,lead_id,project_id,packet,status) values ($1,$2,$3,$4,$5) returning *', [row.id, row.lead_id, row.project_id, JSON.stringify(row.packet), row.status]))[0] }
  const rec = { ...row, created_at: new Date().toISOString() }; mem.deal.set(rec.id, rec); return rec
}
export async function listDeals(filter = {}) {
  if (mode === 'supabase') { const f = Object.entries(filter).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&'); return rest('GET', `supermega_console_deals?order=created_at.desc${f ? '&' + f : ''}`) }
  if (mode === 'postgres') { await ensurePgTables(); const keys = Object.keys(filter); const where = keys.length ? 'where ' + keys.map((k, i) => `${k}=$${i + 1}`).join(' and ') : ''; return q(`select * from supermega_console_deals ${where} order by created_at desc`, keys.map((k) => filter[k])) }
  let rows = [...mem.deal.values()]; for (const [k, v] of Object.entries(filter)) rows = rows.filter((r) => r[k] === v); return memSort(rows)
}
export async function updateDeal(id, patch) {
  if (mode === 'supabase') return (await rest('PATCH', `supermega_console_deals?id=eq.${encodeURIComponent(id)}`, patch))[0] || null
  if (mode === 'postgres') { await ensurePgTables(); const keys = Object.keys(patch); const set = keys.map((k, i) => `${k}=$${i + 2}`).join(', '); return (await q(`update supermega_console_deals set ${set} where id=$1 returning *`, [id, ...keys.map((k) => patch[k])]))[0] || null }
  const cur = mem.deal.get(id); if (!cur) return null; const next = { ...cur, ...patch }; mem.deal.set(id, next); return next
}
// ---------- activity log (best-effort; never breaks the main action) ----------
export async function logActivity(a) {
  const row = { id: randomUUID(), kind: a.kind || '', summary: String(a.summary || '').slice(0, 300), ref: a.ref || null }
  try {
    if (mode === 'supabase') return (await rest('POST', 'supermega_console_activity', row))[0]
    if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_console_activity (id,kind,summary,ref) values ($1,$2,$3,$4) returning *', [row.id, row.kind, row.summary, row.ref]))[0] }
    const rec = { ...row, at: new Date().toISOString() }; mem.activity.set(rec.id, rec); return rec
  } catch { return null }
}
export async function listActivity(limit = 30) {
  if (mode === 'supabase') return rest('GET', `supermega_console_activity?order=at.desc&limit=${limit}`)
  if (mode === 'postgres') { await ensurePgTables(); return q('select * from supermega_console_activity order by at desc limit $1', [limit]) }
  return [...mem.activity.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit)
}

// ---------- graduation tracker ----------
export async function insertGraduation(g) {
  const row = { id: randomUUID(), category: String(g.category || '').slice(0, 80), client_name: String(g.client_name || '').slice(0, 200), project_id: g.project_id || null, note: String(g.note || '').slice(0, 400) }
  if (mode === 'supabase') return (await rest('POST', 'supermega_graduation', row))[0]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_graduation (id,category,client_name,project_id,note) values ($1,$2,$3,$4,$5) returning *', [row.id, row.category, row.client_name, row.project_id, row.note]))[0] }
  const rec = { ...row, created_at: new Date().toISOString() }; mem.graduation.set(rec.id, rec); return rec
}
export async function listGraduations() {
  if (mode === 'supabase') return rest('GET', 'supermega_graduation?order=created_at.desc')
  if (mode === 'postgres') { await ensurePgTables(); return q('select * from supermega_graduation order by created_at desc') }
  return memSort([...mem.graduation.values()])
}

export default { mode, listLeads, getLead, updateLead, insertLead, listProjects, createClient, createProject, updateProject, convertedLeadIds, saveDeal, listDeals, updateDeal, logActivity, listActivity, insertGraduation, listGraduations }
