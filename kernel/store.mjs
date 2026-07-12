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
    create table if not exists supermega_console_clients (id text primary key, name text not null, plan text not null default 'free', contacts jsonb default '[]'::jsonb, channels jsonb default '{}'::jsonb, notes text, created_at timestamptz default now());
    alter table supermega_console_clients add column if not exists plan text not null default 'free';
    create table if not exists supermega_console_projects (id text primary key, client_id text, lead_id text, offer text, scope_summary text, price_mmk bigint, deposit_status text default 'unpaid', deposit_method text, status text default 'scoping', live_url text, created_at timestamptz default now());
    create table if not exists supermega_console_deals (id text primary key, lead_id text, project_id text, packet jsonb, status text default 'draft', created_at timestamptz default now());
    create table if not exists supermega_console_activity (id text primary key, at timestamptz default now(), kind text, summary text, ref text);
    create table if not exists supermega_token_ledger (tenant_id text not null, "window" text not null, in_tokens bigint default 0, out_tokens bigint default 0, calls bigint default 0, updated_at timestamptz default now(), primary key (tenant_id, "window"));
    create table if not exists supermega_ai_cache (cache_key text primary key, payload jsonb not null, created_at timestamptz default now());
    create table if not exists supermega_graduation (signature text primary key, label text, count int not null default 1, sources jsonb default '[]'::jsonb, modules jsonb default '[]'::jsonb, productized boolean not null default false, graduated_at timestamptz, updated_at timestamptz default now());
    create table if not exists supermega_build_modules (id text primary key, project_id text, signature text, modules jsonb default '[]'::jsonb, shipped_at timestamptz default now());
    create table if not exists supermega_payment_events (provider text not null, event_id text not null, project_ref text, amount_total bigint, currency text, at timestamptz default now(), primary key (provider, event_id));
  `).then(() => true)
  return tablesReady
}

// ---------- in-memory fallback ----------
const mem = { lead: new Map(), client: new Map(), project: new Map(), deal: new Map(), activity: new Map(), tokenLedger: new Map(), aiCache: new Map(), graduation: new Map(), buildModules: new Map(), paymentEvents: new Set() }
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
export async function insertLead(l) {
  // Maps logical field names → supermega_leads column names (shared with the website contact form table).
  const rec = {
    lead_id:           String(l.id || randomUUID()),
    source:            String(l.source || 'manual').slice(0, 40),
    name:              String(l.name || '').slice(0, 200),
    email:             String(l.contact || l.email || '').slice(0, 200),
    company:           String(l.company || '').slice(0, 200),
    requested_package: String(l.package || '').slice(0, 80),
    goal:              String(l.message || '').slice(0, 4000),
    lead_score:        Number(l.score) || 0,
    lead_stage:        String(l.stage || 'new').slice(0, 40),
    submitted_at:      l.created_at || new Date().toISOString(),
  }
  if (mode === 'supabase') {
    // Upsert on lead_id — cron may push the same lead multiple times; merge wins.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/supermega_leads`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rec),
    })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`supabase_${res.status}: ${t.slice(0, 140)}`) }
    const rows = await res.json().catch(() => [])
    return rows[0] ? mapLead(rows[0]) : mapLead(rec)
  }
  if (mode === 'postgres') {
    const r = await q(
      `insert into public.supermega_leads (lead_id,source,name,email,company,requested_package,goal,lead_score,lead_stage,submitted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (lead_id) do update
         set source=excluded.source, name=excluded.name, email=excluded.email,
             lead_score=excluded.lead_score, lead_stage=excluded.lead_stage
       returning ${LEAD_COLS}`,
      [rec.lead_id, rec.source, rec.name, rec.email, rec.company, rec.requested_package, rec.goal, rec.lead_score, rec.lead_stage, rec.submitted_at]
    )
    return r[0] ? mapLead(r[0]) : null
  }
  // memory mode
  const memRec = mapLead(rec)
  mem.lead.set(memRec.id, memRec)
  return memRec
}
export async function updateLead(id, patch) {
  // Maps the store's field names (stage, score) to the DB column names (lead_stage, lead_score)
  const colMap = { stage: 'lead_stage', score: 'lead_score' }
  const dbPatch = {}
  for (const [k, v] of Object.entries(patch)) if (colMap[k]) dbPatch[colMap[k]] = v
  if (!Object.keys(dbPatch).length) return null
  if (mode === 'supabase') { const r = await rest('PATCH', `supermega_leads?lead_id=eq.${encodeURIComponent(id)}`, dbPatch); return r?.[0] ? mapLead(r[0]) : null }
  if (mode === 'postgres') { const keys = Object.keys(dbPatch); const set = keys.map((k, i) => `${k}=$${i + 2}`).join(', '); const r = await q(`update public.supermega_leads set ${set} where lead_id=$1 returning ${LEAD_COLS}`, [id, ...keys.map((k) => dbPatch[k])]); return r[0] ? mapLead(r[0]) : null }
  const cur = mem.lead.get(id); if (!cur) return null; const next = { ...cur, ...patch }; mem.lead.set(id, next); return next
}

// ---------- pipeline: clients + projects ----------
export async function listProjects() {
  if (mode === 'supabase') return rest('GET', 'supermega_console_projects?order=created_at.desc')
  if (mode === 'postgres') { await ensurePgTables(); return q('select * from supermega_console_projects order by created_at desc') }
  return memSort([...mem.project.values()])
}
export async function createClient(c) {
  // plan gates the AI gateway tier/cap (gateway.mjs resolvePlan) — 'free' unless explicitly set.
  const row = { id: String(c.id || randomUUID()), name: c.name || 'New client', plan: String(c.plan || 'free').toLowerCase(), contacts: c.contacts || [], channels: c.channels || {}, notes: c.notes || '' }
  if (mode === 'supabase') {
    try { return (await rest('POST', 'supermega_console_clients', row))[0] }
    catch (e) {
      // Live table may predate the `plan` column (console-tables.sql migration not yet run).
      // Don't break client creation over it — retry without the column; the tenant is 'free' anyway.
      if (!/plan/i.test(String((e && e.message) || ''))) throw e
      const { plan, ...legacy } = row
      const created = (await rest('POST', 'supermega_console_clients', legacy))[0]
      return created ? { plan, ...created } : created
    }
  }
  if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_console_clients (id,name,plan,contacts,channels,notes) values ($1,$2,$3,$4,$5,$6) returning *', [row.id, row.name, row.plan, JSON.stringify(row.contacts), JSON.stringify(row.channels), row.notes]))[0] }
  const rec = { ...row, created_at: new Date().toISOString() }; mem.client.set(rec.id, rec); return rec
}
// Fetch a single client/tenant by id (used by the gateway's server-side plan resolution).
export async function getClient(id) {
  if (!id) return null
  if (mode === 'supabase') { const r = await rest('GET', `supermega_console_clients?id=eq.${encodeURIComponent(id)}&limit=1`); return r[0] || null }
  if (mode === 'postgres') { await ensurePgTables(); return (await q('select * from supermega_console_clients where id=$1 limit 1', [id]))[0] || null }
  return mem.client.get(id) || null
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
// Fetch a single project by id (used by the payment reconcile path for amount/status checks).
export async function getProject(id) {
  if (!id) return null
  if (mode === 'supabase') { const r = await rest('GET', `supermega_console_projects?id=eq.${encodeURIComponent(id)}&limit=1`); return r[0] || null }
  if (mode === 'postgres') { await ensurePgTables(); return (await q('select * from supermega_console_projects where id=$1 limit 1', [id]))[0] || null }
  return mem.project.get(id) || null
}
// Conditionally flip a project's deposit to 'paid' ONLY if it is currently 'unpaid'.
// Idempotent: a replay / double-delivery finds it already paid and returns null (no re-flip, no double activity).
// Returns the updated row if it actually flipped, or null if already paid / not found.
export async function markDepositPaid(id, { method = null } = {}) {
  if (!id) return null
  if (mode === 'supabase') { const r = await rest('PATCH', `supermega_console_projects?id=eq.${encodeURIComponent(id)}&deposit_status=eq.unpaid`, { deposit_status: 'paid', deposit_method: method }); return r?.[0] || null }
  if (mode === 'postgres') { await ensurePgTables(); return (await q(`update supermega_console_projects set deposit_status='paid', deposit_method=$2 where id=$1 and deposit_status='unpaid' returning *`, [id, method]))[0] || null }
  const cur = mem.project.get(id); if (!cur || cur.deposit_status === 'paid') return null; const next = { ...cur, deposit_status: 'paid', deposit_method: method }; mem.project.set(id, next); return next
}
export async function convertedLeadIds() {
  if (mode === 'supabase') return [...new Set((await rest('GET', 'supermega_console_projects?select=lead_id&lead_id=not.is.null')).map((r) => r.lead_id))]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('select distinct lead_id from supermega_console_projects where lead_id is not null')).map((r) => r.lead_id) }
  return [...mem.project.values()].map((p) => p.lead_id).filter(Boolean)
}
export async function listClients() {
  if (mode === 'supabase') return rest('GET', 'supermega_console_clients?order=created_at.desc')
  if (mode === 'postgres') { await ensurePgTables(); return q('select * from supermega_console_clients order by created_at desc') }
  return memSort([...mem.client.values()])
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
// Atomically reserve one deterministic activity id. Scheduled deliveries use this as their
// idempotency key because Vercel cron events can be delivered more than once.
export async function claimActivity(a) {
  const row = {
    id: String(a?.id || '').trim().slice(0, 120),
    kind: String(a?.kind || '').trim().slice(0, 80),
    summary: String(a?.summary || '').slice(0, 300),
    ref: a?.ref ? String(a.ref).slice(0, 160) : null,
  }
  if (!row.id) return { fresh: false, durable: mode !== 'memory', reason: 'missing_claim_id' }
  try {
    if (mode === 'supabase') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/supermega_console_activity?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          authorization: `Bearer ${SUPABASE_KEY}`,
          'content-type': 'application/json',
          prefer: 'resolution=ignore-duplicates,return=representation',
        },
        body: JSON.stringify(row),
      })
      if (!response.ok) return { fresh: false, durable: false, reason: `claim_store_http_${response.status}` }
      const rows = await response.json().catch(() => [])
      return { fresh: Array.isArray(rows) && rows.length > 0, durable: true }
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const rows = await q(
        'insert into supermega_console_activity (id,kind,summary,ref) values ($1,$2,$3,$4) on conflict (id) do nothing returning id',
        [row.id, row.kind, row.summary, row.ref],
      )
      return { fresh: rows.length > 0, durable: true }
    }
    if (mem.activity.has(row.id)) return { fresh: false, durable: false }
    mem.activity.set(row.id, { ...row, at: new Date().toISOString() })
    return { fresh: true, durable: false }
  } catch {
    return { fresh: false, durable: false, reason: 'claim_store_unavailable' }
  }
}
// Release only an internal deterministic claim so an owner delivery that failed can be retried.
export async function releaseActivityClaim(id) {
  const key = String(id || '').trim().slice(0, 120)
  if (!key) return false
  try {
    if (mode === 'supabase') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/supermega_console_activity?id=eq.${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_KEY,
          authorization: `Bearer ${SUPABASE_KEY}`,
          prefer: 'return=minimal',
        },
      })
      return response.ok
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      await q('delete from supermega_console_activity where id=$1', [key])
      return true
    }
    return mem.activity.delete(key)
  } catch {
    return false
  }
}
export async function listActivity(limit = 30) {
  if (mode === 'supabase') return rest('GET', `supermega_console_activity?order=at.desc&limit=${limit}`)
  if (mode === 'postgres') { await ensurePgTables(); return q('select * from supermega_console_activity order by at desc limit $1', [limit]) }
  return [...mem.activity.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit)
}

// ---------- per-tenant token ledger (monthly window) + AI response cache ----------
// Backs gateway.mjs so per-client spend caps + caching survive cold starts / multiple instances.
// memory mode keeps the same shape so nothing breaks locally without credentials.

// Read one tenant's usage for a window (e.g. '2026-06'). Always returns a row shape.
export async function getTokenUsage(tenantId, window) {
  const empty = { tenant_id: tenantId, window, in_tokens: 0, out_tokens: 0, calls: 0 }
  if (!tenantId || !window) return empty
  if (mode === 'supabase') {
    const r = await rest('GET', `supermega_token_ledger?tenant_id=eq.${encodeURIComponent(tenantId)}&window=eq.${encodeURIComponent(window)}&limit=1`)
    return r[0] ? { ...empty, ...r[0] } : empty
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const r = await q('select tenant_id, "window", in_tokens, out_tokens, calls from supermega_token_ledger where tenant_id=$1 and "window"=$2 limit 1', [tenantId, window])
    return r[0] ? { ...empty, ...r[0] } : empty
  }
  return mem.tokenLedger.get(`${tenantId}::${window}`) || empty
}

// Atomically add spend to a tenant's window and return the new running totals.
export async function addTokenUsage(tenantId, window, { inTokens = 0, outTokens = 0, calls = 1 } = {}) {
  if (!tenantId || !window) return null
  if (mode === 'supabase') {
    // PostgREST has no native UPSERT-with-increment; read-modify-write (best-effort, monthly granularity).
    const cur = await getTokenUsage(tenantId, window)
    const row = { tenant_id: tenantId, window, in_tokens: Number(cur.in_tokens) + inTokens, out_tokens: Number(cur.out_tokens) + outTokens, calls: Number(cur.calls) + calls, updated_at: new Date().toISOString() }
    const r = await rest('POST', 'supermega_token_ledger?on_conflict=tenant_id,window', row).catch(async () => rest('PATCH', `supermega_token_ledger?tenant_id=eq.${encodeURIComponent(tenantId)}&window=eq.${encodeURIComponent(window)}`, row))
    return r?.[0] ? r[0] : row
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const r = await q(
      `insert into supermega_token_ledger (tenant_id, "window", in_tokens, out_tokens, calls, updated_at)
       values ($1,$2,$3,$4,$5, now())
       on conflict (tenant_id, "window") do update set
         in_tokens = supermega_token_ledger.in_tokens + excluded.in_tokens,
         out_tokens = supermega_token_ledger.out_tokens + excluded.out_tokens,
         calls = supermega_token_ledger.calls + excluded.calls,
         updated_at = now()
       returning tenant_id, "window", in_tokens, out_tokens, calls`,
      [tenantId, window, inTokens, outTokens, calls],
    )
    return r[0] || null
  }
  const key = `${tenantId}::${window}`
  const cur = mem.tokenLedger.get(key) || { tenant_id: tenantId, window, in_tokens: 0, out_tokens: 0, calls: 0 }
  const next = { ...cur, in_tokens: cur.in_tokens + inTokens, out_tokens: cur.out_tokens + outTokens, calls: cur.calls + calls }
  mem.tokenLedger.set(key, next)
  return next
}

// AI response cache (optional). Returns the stored payload or null.
export async function getCachedResponse(cacheKey) {
  if (!cacheKey) return null
  if (mode === 'supabase') {
    const r = await rest('GET', `supermega_ai_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=payload&limit=1`)
    return r[0]?.payload || null
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const r = await q('select payload from supermega_ai_cache where cache_key=$1 limit 1', [cacheKey])
    return r[0]?.payload || null
  }
  return mem.aiCache.get(cacheKey) || null
}

export async function putCachedResponse(cacheKey, payload) {
  if (!cacheKey) return null
  if (mode === 'supabase') {
    return rest('POST', 'supermega_ai_cache?on_conflict=cache_key', { cache_key: cacheKey, payload }).catch(() => null)
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    return q('insert into supermega_ai_cache (cache_key, payload) values ($1,$2) on conflict (cache_key) do update set payload = excluded.payload', [cacheKey, JSON.stringify(payload)]).then(() => true).catch(() => null)
  }
  mem.aiCache.set(cacheKey, payload)
  return true
}

// ---------- graduation flywheel (auto: 3rd repeat of a request signature → productize) ----------
// supermega_graduation: one row per normalized request signature; count grows as deals/builds repeat it.
// supermega_build_modules: the modules of each shipped project (the "what we actually built" record).
// All best-effort: every method swallows its own errors so the deal/convert path is never broken.
const GRAD_THRESHOLD = 3
const uniqStrs = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean).map(String))]

// Increment (or create) the counter for a request signature. Flags graduation-ready at the threshold.
// Returns { signature, count, productized, graduated } or null on failure (never throws).
export async function bumpGraduation(signature, { label = '', source = null, modules = [] } = {}) {
  const sig = String(signature || '').trim()
  if (!sig) return null
  try {
    if (mode === 'supabase') {
      const existing = (await rest('GET', `supermega_graduation?signature=eq.${encodeURIComponent(sig)}&limit=1`))[0]
      if (existing) {
        const count = (Number(existing.count) || 0) + 1
        const productized = Boolean(existing.productized) || count >= GRAD_THRESHOLD
        const patch = { count, label: existing.label || label, sources: uniqStrs(existing.sources, source ? [source] : []), modules: uniqStrs(existing.modules, modules), productized, updated_at: new Date().toISOString() }
        if (productized && !existing.graduated_at) patch.graduated_at = new Date().toISOString()
        const r = await rest('PATCH', `supermega_graduation?signature=eq.${encodeURIComponent(sig)}`, patch)
        const row = r?.[0] || { signature: sig, ...patch }
        return { signature: sig, count, productized, graduated: productized && !existing.productized }
      }
      const row = { signature: sig, label, count: 1, sources: source ? [source] : [], modules: uniqStrs([], modules), productized: 1 >= GRAD_THRESHOLD }
      await rest('POST', 'supermega_graduation', row).catch(() => {})
      return { signature: sig, count: 1, productized: row.productized, graduated: row.productized }
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const cur = (await q('select * from supermega_graduation where signature=$1 limit 1', [sig]))[0]
      const count = (Number(cur?.count) || 0) + 1
      const wasProductized = Boolean(cur?.productized)
      const productized = wasProductized || count >= GRAD_THRESHOLD
      const sources = uniqStrs(cur?.sources, source ? [source] : [])
      const mods = uniqStrs(cur?.modules, modules)
      const gradAt = productized && !cur?.graduated_at ? new Date().toISOString() : (cur?.graduated_at || null)
      await q(
        `insert into supermega_graduation (signature, label, count, sources, modules, productized, graduated_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now())
         on conflict (signature) do update set count=$3, label=coalesce(nullif(supermega_graduation.label,''),$2), sources=$4, modules=$5, productized=$6, graduated_at=$7, updated_at=now()`,
        [sig, label, count, JSON.stringify(sources), JSON.stringify(mods), productized, gradAt],
      )
      return { signature: sig, count, productized, graduated: productized && !wasProductized }
    }
    const cur = mem.graduation.get(sig)
    const count = (Number(cur?.count) || 0) + 1
    const wasProductized = Boolean(cur?.productized)
    const productized = wasProductized || count >= GRAD_THRESHOLD
    const next = { signature: sig, label: cur?.label || label, count, sources: uniqStrs(cur?.sources, source ? [source] : []), modules: uniqStrs(cur?.modules, modules), productized, graduated_at: productized && !cur?.graduated_at ? new Date().toISOString() : (cur?.graduated_at || null), updated_at: new Date().toISOString() }
    mem.graduation.set(sig, next)
    return { signature: sig, count, productized, graduated: productized && !wasProductized }
  } catch { return null }
}

// Record the modules of a shipped project (best-effort; never throws).
export async function recordBuildModules(projectId, modules, signature = null) {
  const mods = uniqStrs([], modules)
  if (!mods.length) return null
  const row = { id: randomUUID(), project_id: projectId || null, signature: signature || null, modules: mods }
  try {
    if (mode === 'supabase') return (await rest('POST', 'supermega_build_modules', row))[0]
    if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_build_modules (id,project_id,signature,modules) values ($1,$2,$3,$4) returning *', [row.id, row.project_id, row.signature, JSON.stringify(row.modules)]))[0] }
    const rec = { ...row, shipped_at: new Date().toISOString() }; mem.buildModules.set(rec.id, rec); return rec
  } catch { return null }
}

// List graduation signatures (highest count first). Always returns an array.
export async function listGraduation(limit = 100) {
  try {
    if (mode === 'supabase') return await rest('GET', `supermega_graduation?order=count.desc,updated_at.desc&limit=${limit}`)
    if (mode === 'postgres') { await ensurePgTables(); return await q('select * from supermega_graduation order by count desc, updated_at desc limit $1', [limit]) }
    return [...mem.graduation.values()].sort((a, b) => (b.count - a.count) || String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, limit)
  } catch { return [] }
}

// ---------- payment-event idempotency (webhook / IPN dedup) ----------
// recordPaymentEvent returns { fresh } — true ONLY the first time a (provider,event_id) pair is seen,
// so a re-delivered/replayed webhook is a no-op. Durable across instances when the
// supermega_payment_events table exists (postgres always; supabase after running supabase/payment-events.sql).
// If the table is missing in supabase mode it falls back to a per-instance in-memory Set — same protection
// as the previous in-connector Set, i.e. NO regression — and warns once so the gap is visible.
let warnedPaymentEventsTable = false
export async function recordPaymentEvent(provider, eventId, meta = {}) {
  const p = String(provider || '').slice(0, 40)
  const e = String(eventId || '').slice(0, 200)
  if (!p || !e) return { fresh: false }
  const amount = Number.isFinite(Number(meta.amount)) ? Number(meta.amount) : null
  if (mode === 'postgres') {
    try {
      await ensurePgTables()
      const r = await q(
        `insert into supermega_payment_events (provider, event_id, project_ref, amount_total, currency)
         values ($1,$2,$3,$4,$5) on conflict (provider, event_id) do nothing returning event_id`,
        [p, e, meta.ref || null, amount, meta.currency || null],
      )
      return { fresh: r.length > 0 }
    } catch { /* fall through to in-memory */ }
  } else if (mode === 'supabase') {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/supermega_payment_events?on_conflict=provider,event_id`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ provider: p, event_id: e, project_ref: meta.ref || null, amount_total: amount, currency: meta.currency || null }),
      })
      if (res.ok) { const rows = await res.json().catch(() => []); return { fresh: Array.isArray(rows) && rows.length > 0 } }
      if (!warnedPaymentEventsTable) { warnedPaymentEventsTable = true; console.warn('[store] supermega_payment_events unavailable (run supabase/payment-events.sql) — using per-instance dedup') }
    } catch { /* fall through to in-memory */ }
  }
  const memKey = `${p}::${e}`
  if (mem.paymentEvents.has(memKey)) return { fresh: false }
  mem.paymentEvents.add(memKey)
  return { fresh: true }
}

// Lightweight reachability probe for the status endpoint. Bounded; never throws.
export async function ping() {
  if (mode === 'memory') return { ok: true, mode, detail: 'in-memory (no external DB)' }
  try {
    if (mode === 'supabase') {
      const workcellMode = Boolean(String(process.env.SUPERMEGA_WORKCELL_SLUGS || process.env.SUPERMEGA_WORKCELL_SLUG || '').trim())
      const probe = workcellMode
        ? 'supermega_console_activity?select=id&limit=1'
        : 'supermega_leads?select=lead_id&limit=1'
      await rest('GET', probe)
      return { ok: true, mode }
    }
    if (mode === 'postgres') { await q('select 1'); return { ok: true, mode } }
  } catch (e) { return { ok: false, mode, detail: String((e && e.message) || 'ping_failed').slice(0, 120) } }
  return { ok: false, mode, detail: 'unknown_mode' }
}

export default { mode, listLeads, getLead, insertLead, updateLead, listClients, listProjects, createClient, getClient, createProject, updateProject, getProject, markDepositPaid, convertedLeadIds, saveDeal, listDeals, updateDeal, logActivity, claimActivity, releaseActivityClaim, listActivity, getTokenUsage, addTokenUsage, getCachedResponse, putCachedResponse, recordPaymentEvent, ping, bumpGraduation, recordBuildModules, listGraduation }
