// SUPERMEGA kernel — data spine access. Three modes, picked from env:
//  - 'supabase' : Supabase REST (PostgREST) with the service_role key. Reachable everywhere, no DB password.
//  - 'postgres' : direct Postgres via `pg` (Neon/Vercel) when a connection string is present.
//  - 'memory'   : in-process maps, for dev with no credentials.
// Reads real `supermega_leads`; pipeline lives in additive `supermega_console_*` tables. See ../PLATFORM.md.

import { createHash, randomUUID } from 'node:crypto'

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
async function tx(run) {
  const client = await (await pg()).connect()
  try {
    await client.query('begin')
    const result = await run(async (sql, params = []) => (await client.query(sql, params)).rows || [])
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
let tablesReady
async function ensurePgTables() {
  if (!tablesReady) tablesReady = q(`
    create table if not exists supermega_console_clients (id text primary key, name text not null, plan text not null default 'free', contacts jsonb default '[]'::jsonb, channels jsonb default '{}'::jsonb, notes text, created_at timestamptz default now());
    alter table supermega_console_clients add column if not exists plan text not null default 'free';
    create table if not exists supermega_console_projects (id text primary key, client_id text, lead_id text, offer text, scope_summary text, price_mmk bigint, deposit_status text default 'unpaid', deposit_method text, status text default 'scoping', live_url text, created_at timestamptz default now());
    create table if not exists supermega_console_deals (id text primary key, lead_id text, project_id text, packet jsonb, status text default 'draft', created_at timestamptz default now());
    create table if not exists supermega_console_activity (id text primary key, at timestamptz default now(), kind text, summary text, ref text);
    create table if not exists supermega_token_ledger (tenant_id text not null, "window" text not null, cap_tokens bigint, in_tokens bigint default 0, out_tokens bigint default 0, calls bigint default 0, updated_at timestamptz default now(), primary key (tenant_id, "window"));
    alter table supermega_token_ledger add column if not exists cap_tokens bigint;
    create table if not exists supermega_ai_budget_reservations (reservation_id text primary key, "window" text not null, reserved_units bigint not null check (reserved_units > 0), actual_units bigint, status text not null default 'reserved' check (status in ('reserved','consumed','failed','released')), tenant_id text, tier text, provider text, created_at timestamptz not null default now(), settled_at timestamptz);
    create index if not exists supermega_ai_budget_window_status_idx on supermega_ai_budget_reservations ("window", status);
    create or replace function public.supermega_reserve_ai_budget(
      p_reservation_id text,
      p_window text,
      p_reserved_units bigint,
      p_cap_units bigint,
      p_tenant_id text default null,
      p_tier text default null,
      p_provider text default null
    ) returns table (granted boolean, used_units bigint, cap_units bigint, reason text)
    language plpgsql
    security invoker
    set search_path = public
    as $supermega$
    declare
      current_used bigint;
      effective_cap bigint;
    begin
      if p_reservation_id is null or char_length(p_reservation_id) not between 1 and 120
        or p_window is null or p_window !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or p_reserved_units is null or p_reserved_units <= 0
        or p_cap_units is null or p_cap_units <= 0 then
        return query select false, 0::bigint, greatest(coalesce(p_cap_units, 0), 0)::bigint, 'invalid_budget_reservation'::text;
        return;
      end if;

      effective_cap := least(p_cap_units, 2000000);

      perform pg_advisory_xact_lock(hashtext('supermega-ai-budget:' || p_window));
      select coalesce(sum(r.reserved_units), 0)::bigint
        into current_used
        from public.supermega_ai_budget_reservations r
       where r."window" = p_window and r.status <> 'released';

      if exists (select 1 from public.supermega_ai_budget_reservations r where r.reservation_id = p_reservation_id) then
        return query select false, current_used, effective_cap, 'duplicate_budget_reservation'::text;
        return;
      end if;
      if current_used + p_reserved_units > effective_cap then
        return query select false, current_used, effective_cap, 'company_daily_budget_reached'::text;
        return;
      end if;

      insert into public.supermega_ai_budget_reservations
        (reservation_id, "window", reserved_units, status, tenant_id, tier, provider)
      values
        (p_reservation_id, p_window, p_reserved_units, 'reserved', nullif(p_tenant_id, ''), nullif(p_tier, ''), nullif(p_provider, ''));
      return query select true, current_used + p_reserved_units, effective_cap, null::text;
    end;
    $supermega$;
    revoke all on function public.supermega_reserve_ai_budget(text,text,bigint,bigint,text,text,text) from public;
    create or replace function public.supermega_get_ai_budget_usage(p_window text)
    returns table (reserved_units bigint, attempts bigint, in_flight bigint, consumed bigint, failed bigint)
    language sql
    stable
    security invoker
    set search_path = public
    as $supermega$
      select
        coalesce(sum(r.reserved_units), 0)::bigint as reserved_units,
        count(*)::bigint as attempts,
        count(*) filter (where r.status = 'reserved')::bigint as in_flight,
        count(*) filter (where r.status = 'consumed')::bigint as consumed,
        count(*) filter (where r.status = 'failed')::bigint as failed
      from public.supermega_ai_budget_reservations r
      where r."window" = p_window and r.status <> 'released'
    $supermega$;
    revoke all on function public.supermega_get_ai_budget_usage(text) from public;
    create table if not exists supermega_spend_reservations (reservation_id text primary key, tenant_id text not null, "window" text not null, reserved_tokens bigint not null check (reserved_tokens > 0), status text not null default 'reserved' check (status in ('reserved','dispatched','indeterminate','settled','released')), dispatch_token text not null, context jsonb not null default '{}'::jsonb, actual_in_tokens bigint not null default 0, actual_out_tokens bigint not null default 0, actual_calls bigint not null default 0, reconciled_by text, reconciliation_evidence_hash text, reconciled_at timestamptz, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table supermega_spend_reservations add column if not exists dispatch_token text;
    alter table supermega_spend_reservations add column if not exists context jsonb not null default '{}'::jsonb;
    alter table supermega_spend_reservations add column if not exists reconciled_by text;
    alter table supermega_spend_reservations add column if not exists reconciliation_evidence_hash text;
    alter table supermega_spend_reservations add column if not exists reconciled_at timestamptz;
    do $migration$
    begin
      if exists (select 1 from supermega_spend_reservations where status='active') then
        raise exception 'legacy_active_reservations_require_reconciliation';
      end if;
      if exists (
        select 1 from pg_constraint
         where conrelid='supermega_spend_reservations'::regclass
           and conname='supermega_spend_reservations_status_check'
           and pg_get_constraintdef(oid) not like '%indeterminate%'
      ) then
        alter table supermega_spend_reservations drop constraint supermega_spend_reservations_status_check;
      end if;
      if not exists (
        select 1 from pg_constraint
         where conrelid='supermega_spend_reservations'::regclass
           and conname='supermega_spend_reservations_status_check'
           and pg_get_constraintdef(oid) like '%indeterminate%'
      ) then
        alter table supermega_spend_reservations alter column status set default 'reserved';
        alter table supermega_spend_reservations add constraint supermega_spend_reservations_status_check check (status in ('reserved','dispatched','indeterminate','settled','released'));
      end if;
      update supermega_spend_reservations
         set dispatch_token='legacy-terminal:' || md5(reservation_id)
       where dispatch_token is null and status in ('settled','released');
      if exists (select 1 from supermega_spend_reservations where dispatch_token is null) then
        raise exception 'reservation_dispatch_token_reconciliation_required';
      end if;
      alter table supermega_spend_reservations alter column dispatch_token set not null;
      if not exists (
        select 1 from pg_constraint
         where conrelid='supermega_spend_reservations'::regclass
           and conname='supermega_spend_reservations_dispatch_token_check'
      ) then
        alter table supermega_spend_reservations add constraint supermega_spend_reservations_dispatch_token_check check (char_length(dispatch_token) between 1 and 160);
      end if;
      if not exists (
        select 1 from pg_constraint
         where conrelid='supermega_spend_reservations'::regclass
           and conname='supermega_spend_reservations_reconciliation_check'
      ) then
        alter table supermega_spend_reservations add constraint supermega_spend_reservations_reconciliation_check check (
          (reconciled_by is null and reconciliation_evidence_hash is null and reconciled_at is null)
          or (char_length(reconciled_by) between 1 and 80 and reconciliation_evidence_hash ~ '^[a-f0-9]{64}$' and reconciled_at is not null)
        );
      end if;
    end;
    $migration$;
    create index if not exists supermega_spend_reservations_active_idx on supermega_spend_reservations (tenant_id, "window", status);
    create table if not exists supermega_ai_cache (cache_key text primary key, payload jsonb not null, created_at timestamptz default now());
    create table if not exists supermega_control_records (
      record_key text primary key,
      record_type text not null,
      tenant_id text not null,
      status text not null,
      plan_hash text not null,
      payload jsonb not null,
      payload_hash text not null,
      record_version bigint not null default 1 check (record_version >= 1),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint supermega_control_records_key_check check (char_length(record_key) between 1 and 240),
      constraint supermega_control_records_type_check check (record_type in ('sign_in_code','operator_session','mission','work_order','work_order_review','work_order_evaluation','ceo_outcome_operation','ceo_outcome_evaluation','ceo_outcome_delivery','ceo_outcome_action','lead_review')),
      constraint supermega_control_records_tenant_check check (char_length(tenant_id) between 1 and 80),
      constraint supermega_control_records_status_check check (status ~ '^[a-z][a-z_]{0,39}$'),
      constraint supermega_control_records_plan_hash_check check (plan_hash ~ '^[a-f0-9]{64}$'),
      constraint supermega_control_records_payload_hash_check check (payload_hash ~ '^[a-f0-9]{64}$')
    );
    create index if not exists supermega_control_records_tenant_type_status_idx on supermega_control_records (tenant_id, record_type, status, updated_at desc);
    create table if not exists supermega_control_transitions (
      transition_id bigint generated always as identity primary key,
      record_key text not null references supermega_control_records(record_key) on delete restrict,
      record_type text not null,
      tenant_id text not null,
      event_type text not null check (event_type in ('created','replaced','transitioned')),
      from_status text,
      to_status text not null,
      from_record_version bigint,
      to_record_version bigint not null,
      prior_payload_hash text,
      next_payload_hash text not null,
      created_at timestamptz not null default now()
    );
    create unique index if not exists supermega_control_transitions_record_version_uidx on supermega_control_transitions (record_key, to_record_version);
    create or replace function supermega_reject_control_transition_mutation()
    returns trigger language plpgsql security definer set search_path = '' as $immutable$
    begin raise exception 'control_transition_history_is_immutable'; end;
    $immutable$;
    drop trigger if exists supermega_control_transitions_immutable on supermega_control_transitions;
    create trigger supermega_control_transitions_immutable before update or delete on supermega_control_transitions
    for each row execute function supermega_reject_control_transition_mutation();
    create or replace function supermega_put_control_record(
      p_record_key text, p_record_type text, p_tenant_id text, p_status text,
      p_plan_hash text, p_payload jsonb, p_payload_hash text
    ) returns table (updated boolean, version bigint)
    language plpgsql security definer set search_path = '' as $control$
    declare existing public.supermega_control_records%rowtype; next_version bigint;
    begin
      select * into existing from public.supermega_control_records where record_key=p_record_key for update;
      if not found then
        insert into public.supermega_control_records (record_key,record_type,tenant_id,status,plan_hash,payload,payload_hash,record_version)
        values (p_record_key,p_record_type,p_tenant_id,p_status,p_plan_hash,p_payload,p_payload_hash,1);
        insert into public.supermega_control_transitions (record_key,record_type,tenant_id,event_type,to_status,to_record_version,next_payload_hash)
        values (p_record_key,p_record_type,p_tenant_id,'created',p_status,1,p_payload_hash);
        return query select true, 1::bigint;
        return;
      end if;
      if existing.record_type<>p_record_type or existing.tenant_id<>p_tenant_id then
        raise exception 'control_record_identity_conflict';
      end if;
      next_version := existing.record_version + 1;
      update public.supermega_control_records set status=p_status,plan_hash=p_plan_hash,payload=p_payload,payload_hash=p_payload_hash,record_version=next_version,updated_at=now() where record_key=p_record_key;
      insert into public.supermega_control_transitions (record_key,record_type,tenant_id,event_type,from_status,to_status,from_record_version,to_record_version,prior_payload_hash,next_payload_hash)
      values (p_record_key,p_record_type,p_tenant_id,'replaced',existing.status,p_status,existing.record_version,next_version,existing.payload_hash,p_payload_hash);
      return query select true, next_version;
    end;
    $control$;
    create or replace function supermega_transition_control_record(
      p_record_key text, p_expected_status text, p_expected_plan_hash text,
      p_has_revision boolean, p_expected_revision bigint,
      p_record_type text, p_tenant_id text, p_status text, p_plan_hash text,
      p_payload jsonb, p_payload_hash text
    ) returns table (updated boolean, version bigint)
    language plpgsql security definer set search_path = '' as $control$
    declare existing public.supermega_control_records%rowtype; next_version bigint;
    begin
      select * into existing from public.supermega_control_records
       where record_key=p_record_key and status=p_expected_status and plan_hash=p_expected_plan_hash
         and (not p_has_revision or payload->>'revision'=p_expected_revision::text)
       for update;
      if not found then return query select false, null::bigint; return; end if;
      if existing.record_type<>p_record_type or existing.tenant_id<>p_tenant_id then
        raise exception 'control_record_identity_conflict';
      end if;
      next_version := existing.record_version + 1;
      update public.supermega_control_records set status=p_status,plan_hash=p_plan_hash,payload=p_payload,payload_hash=p_payload_hash,record_version=next_version,updated_at=now() where record_key=p_record_key;
      insert into public.supermega_control_transitions (record_key,record_type,tenant_id,event_type,from_status,to_status,from_record_version,to_record_version,prior_payload_hash,next_payload_hash)
      values (p_record_key,p_record_type,p_tenant_id,'transitioned',existing.status,p_status,existing.record_version,next_version,existing.payload_hash,p_payload_hash);
      return query select true, next_version;
    end;
    $control$;
    create table if not exists supermega_action_queue (id text primary key, client_id text not null, action_type text not null, title text not null, payload jsonb not null, payload_hash text not null, source jsonb not null default '{}'::jsonb, status text not null default 'draft', version int not null default 0, approved_by text, approved_at timestamptz, rejected_by text, rejected_at timestamptz, executing_at timestamptz, lease_expires_at timestamptz, attempts int not null default 0, provider_ref text, result jsonb, last_error text, executed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint supermega_action_queue_status check (status in ('draft','approved','executing','succeeded','failed','rejected')));
    create table if not exists supermega_graduation (signature text primary key, label text, count int not null default 1, sources jsonb default '[]'::jsonb, modules jsonb default '[]'::jsonb, productized boolean not null default false, graduated_at timestamptz, updated_at timestamptz default now());
    create table if not exists supermega_build_modules (id text primary key, project_id text, signature text, modules jsonb default '[]'::jsonb, shipped_at timestamptz default now());
    create table if not exists supermega_payment_events (provider text not null, event_id text not null, project_ref text, amount_total bigint, currency text, at timestamptz default now(), primary key (provider, event_id));
  `).then(() => true)
  return tablesReady
}

// ---------- in-memory fallback ----------
const mem = { lead: new Map(), client: new Map(), project: new Map(), deal: new Map(), activity: new Map(), tokenLedger: new Map(), spendReservation: new Map(), aiBudgetReservations: new Map(), aiCache: new Map(), controlRecords: new Map(), controlTransitions: [], approval: new Map(), graduation: new Map(), buildModules: new Map(), paymentEvents: new Set() }
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

export async function markLeadWon(id) {
  if (!id) return null
  if (mode === 'supabase') {
    const changed = await rest('PATCH', `supermega_leads?lead_id=eq.${encodeURIComponent(id)}&or=(lead_stage.neq.won,lead_stage.is.null)`, { lead_stage: 'won' })
    if (changed?.[0]) return { lead: mapLead(changed[0]), changed: true }
    const lead = await getLead(id)
    return lead ? { lead, changed: false } : null
  }
  if (mode === 'postgres') {
    const changed = await q(`update public.supermega_leads set lead_stage='won' where lead_id=$1 and lead_stage is distinct from 'won' returning ${LEAD_COLS}`, [id])
    if (changed[0]) return { lead: mapLead(changed[0]), changed: true }
    const lead = await getLead(id)
    return lead ? { lead, changed: false } : null
  }
  const current = mem.lead.get(id)
  if (!current) return null
  if (current.stage === 'won') return { lead: current, changed: false }
  const lead = { ...current, stage: 'won' }
  mem.lead.set(id, lead)
  return { lead, changed: true }
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
  if (mem.client.has(row.id)) throw new Error('console_client_id_conflict')
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
  const row = { id: String(p.id || randomUUID()), client_id: p.client_id || null, lead_id: p.lead_id || null, offer: p.offer || 'build', scope_summary: p.scope_summary || '', status: p.status || 'scoping', deposit_status: p.deposit_status || 'unpaid' }
  if (mode === 'supabase') return (await rest('POST', 'supermega_console_projects', row))[0]
  if (mode === 'postgres') { await ensurePgTables(); return (await q('insert into supermega_console_projects (id,client_id,lead_id,offer,scope_summary,status,deposit_status) values ($1,$2,$3,$4,$5,$6,$7) returning *', [row.id, row.client_id, row.lead_id, row.offer, row.scope_summary, row.status, row.deposit_status]))[0] }
  if (mem.project.has(row.id)) throw new Error('console_project_id_conflict')
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
export async function releaseActivityClaim(id, expectedRef = undefined) {
  const key = String(id || '').trim().slice(0, 120)
  if (!key) return false
  const ownerBound = expectedRef !== undefined
  const normalizedRef = ownerBound ? String(expectedRef || '').trim().slice(0, 160) : ''
  if (ownerBound && !normalizedRef) return false
  try {
    if (mode === 'supabase') {
      const ownerFilter = ownerBound ? `&ref=eq.${encodeURIComponent(normalizedRef)}` : ''
      const response = await fetch(`${SUPABASE_URL}/rest/v1/supermega_console_activity?id=eq.${encodeURIComponent(key)}${ownerFilter}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_KEY,
          authorization: `Bearer ${SUPABASE_KEY}`,
          prefer: ownerBound ? 'return=representation' : 'return=minimal',
        },
      })
      if (!response.ok) return false
      if (!ownerBound) return true
      const rows = await response.json().catch(() => [])
      return Array.isArray(rows) && rows.length === 1
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      if (!ownerBound) {
        await q('delete from supermega_console_activity where id=$1', [key])
        return true
      }
      const rows = await q('delete from supermega_console_activity where id=$1 and ref=$2 returning id', [key, normalizedRef])
      return rows.length === 1
    }
    if (ownerBound && mem.activity.get(key)?.ref !== normalizedRef) return false
    return mem.activity.delete(key)
  } catch {
    return false
  }
}

export async function getActivityClaim(id) {
  const key = String(id || '').trim().slice(0, 120)
  if (!key) return { claim: null, durable: mode !== 'memory', reason: 'missing_claim_id' }
  try {
    if (mode === 'supabase') {
      const rows = await rest('GET', `supermega_console_activity?id=eq.${encodeURIComponent(key)}&select=id,at,kind,summary,ref&limit=1`)
      return { claim: rows[0] || null, durable: true }
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const rows = await q('select id, at, kind, summary, ref from supermega_console_activity where id=$1 limit 1', [key])
      return { claim: rows[0] || null, durable: true }
    }
    return { claim: mem.activity.get(key) || null, durable: false }
  } catch {
    return { claim: null, durable: false, reason: 'claim_store_unavailable' }
  }
}

export async function transitionActivityClaim(id, expectedRef, nextRef) {
  const key = String(id || '').trim().slice(0, 120)
  const expected = String(expectedRef || '').trim().slice(0, 160)
  const next = String(nextRef || '').trim().slice(0, 160)
  if (!key || !expected || !next || expected === next) {
    return { updated: false, durable: mode !== 'memory', reason: 'invalid_claim_transition' }
  }
  try {
    if (mode === 'supabase') {
      const rows = await rest(
        'PATCH',
        `supermega_console_activity?id=eq.${encodeURIComponent(key)}&ref=eq.${encodeURIComponent(expected)}&select=id`,
        { ref: next, at: new Date().toISOString() },
      )
      return Array.isArray(rows) && rows.length === 1
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'claim_transition_conflict' }
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const rows = await q(
        'update supermega_console_activity set ref=$3, at=now() where id=$1 and ref=$2 returning id',
        [key, expected, next],
      )
      return rows.length === 1
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'claim_transition_conflict' }
    }
    const current = mem.activity.get(key)
    if (!current || current.ref !== expected) {
      return { updated: false, durable: false, reason: 'claim_transition_conflict' }
    }
    mem.activity.set(key, { ...current, ref: next, at: new Date().toISOString() })
    return { updated: true, durable: false }
  } catch {
    return { updated: false, durable: false, reason: 'claim_store_unavailable' }
  }
}
export async function listActivity(limit = 30, filter = {}) {
  const boundedLimit = Math.min(200, Math.max(1, Number.isInteger(Number(limit)) ? Number(limit) : 30))
  const kind = String(filter?.kind || '').trim().slice(0, 80)
  const ref = String(filter?.ref || '').trim().slice(0, 160)
  if (mode === 'supabase') {
    const query = [
      kind ? `kind=eq.${encodeURIComponent(kind)}` : '',
      ref ? `ref=eq.${encodeURIComponent(ref)}` : '',
      'order=at.desc',
      `limit=${boundedLimit}`,
    ].filter(Boolean).join('&')
    return rest('GET', `supermega_console_activity?${query}`)
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const where = []
    const values = []
    if (kind) { values.push(kind); where.push(`kind=$${values.length}`) }
    if (ref) { values.push(ref); where.push(`ref=$${values.length}`) }
    values.push(boundedLimit)
    return q(`select * from supermega_console_activity${where.length ? ` where ${where.join(' and ')}` : ''} order by at desc limit $${values.length}`, values)
  }
  let rows = [...mem.activity.values()]
  if (kind) rows = rows.filter((row) => row.kind === kind)
  if (ref) rows = rows.filter((row) => row.ref === ref)
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, boundedLimit)
}

// ---------- per-tenant token ledger (monthly window) + AI response cache ----------
// Backs gateway.mjs so per-client spend caps + caching survive cold starts / multiple instances.
// memory mode keeps the same shape so nothing breaks locally without credentials.

function spendSnapshot(row, reservedTokens = 0) {
  const inTokens = Number(row?.in_tokens) || 0
  const outTokens = Number(row?.out_tokens) || 0
  const calls = Number(row?.calls) || 0
  const reserved = Number(reservedTokens) || 0
  return {
    ...row,
    cap_tokens: row?.cap_tokens === null || row?.cap_tokens === undefined ? null : Number(row.cap_tokens),
    in_tokens: inTokens,
    out_tokens: outTokens,
    calls,
    reserved_tokens: reserved,
    committed_tokens: inTokens + outTokens,
    spend_total: inTokens + outTokens + reserved,
  }
}

function counter(value, name, { positive = false } = {}) {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0)) throw new TypeError(`invalid_${name}`)
  return n
}

function reservationIdentity(reservationId, tenantId, window) {
  const id = String(reservationId || '').trim()
  const tenant = String(tenantId || '').trim()
  const month = String(window || '').trim()
  if (!id || id.length > 120) throw new TypeError('invalid_reservation_id')
  if (!tenant || tenant.length > 200) throw new TypeError('invalid_tenant_id')
  if (!/^\d{4}-\d{2}$/.test(month)) throw new TypeError('invalid_usage_window')
  return { id, tenant, month }
}

const ACTIVE_SPEND_STATUSES = new Set(['reserved', 'dispatched', 'indeterminate'])
const ACTIVE_SPEND_SQL = "('reserved','dispatched','indeterminate')"

function dispatchCredential(value) {
  const token = String(value || '').trim()
  if (!token || token.length > 160) throw new TypeError('invalid_dispatch_token')
  return token
}

function safeReservationContext(value) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_reservation_context')
  const encoded = JSON.stringify(value)
  if (encoded.length > 4096) throw new TypeError('invalid_reservation_context')
  return JSON.parse(encoded)
}

function sameReservationContext(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {})
}

function memoryActiveReserved(tenantId, window) {
  let total = 0
  for (const row of mem.spendReservation.values()) {
    if (row.tenant_id === tenantId && row.window === window && ACTIVE_SPEND_STATUSES.has(row.status)) total += row.reserved_tokens
  }
  return total
}

async function pgActiveReserved(query, tenantId, window) {
  const rows = await query(`select coalesce(sum(reserved_tokens),0) as reserved_tokens from supermega_spend_reservations where tenant_id=$1 and "window"=$2 and status in ${ACTIVE_SPEND_SQL}`, [tenantId, window])
  return Number(rows[0]?.reserved_tokens) || 0
}

// Read one tenant's committed and in-flight usage for a window (e.g. '2026-06').
// spend_total is the cap-safe value: committed usage plus every active reservation.
export async function getTokenUsage(tenantId, window) {
  const empty = spendSnapshot({ tenant_id: tenantId, window, in_tokens: 0, out_tokens: 0, calls: 0 })
  if (!tenantId || !window) return empty
  if (mode === 'supabase') {
    const rows = await rest('POST', 'rpc/supermega_get_token_usage', { p_tenant_id: tenantId, p_window: window })
    return rows?.[0] ? spendSnapshot({ ...empty, ...rows[0] }, rows[0].reserved_tokens) : empty
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const r = await q(
      `select l.tenant_id, l."window", l.cap_tokens, l.in_tokens, l.out_tokens, l.calls,
              coalesce(sum(r.reserved_tokens) filter (where r.status in ('reserved','dispatched','indeterminate')), 0) as reserved_tokens
         from supermega_token_ledger l
         left join supermega_spend_reservations r on r.tenant_id=l.tenant_id and r."window"=l."window"
        where l.tenant_id=$1 and l."window"=$2
        group by l.tenant_id, l."window", l.cap_tokens, l.in_tokens, l.out_tokens, l.calls
        limit 1`,
      [tenantId, window],
    )
    return r[0] ? spendSnapshot({ ...empty, ...r[0] }, r[0].reserved_tokens) : empty
  }
  return spendSnapshot(mem.tokenLedger.get(`${tenantId}::${window}`) || empty, memoryActiveReserved(tenantId, window))
}

// ---------- company-wide daily AI admission budget ----------
// Every paid provider attempt reserves its conservative maximum cost BEFORE network I/O. The
// reservation remains charged for that UTC day even when the provider times out or fails because
// an ambiguous response may still have incurred provider cost. Only work rejected before provider
// I/O may transition to `released`.
export async function reserveAiBudget(input = {}) {
  const reservationId = String(input.reservationId || '').trim().slice(0, 120)
  const window = String(input.window || '').trim().slice(0, 10)
  const parsedReservedUnits = Number(input.reservedUnits)
  const parsedCapUnits = Number(input.capUnits)
  const reservedUnits = Number.isFinite(parsedReservedUnits) ? Math.trunc(parsedReservedUnits) : 0
  const capUnits = Number.isFinite(parsedCapUnits) ? Math.min(Math.trunc(parsedCapUnits), 2_000_000) : 0
  const tenantId = String(input.tenantId || '').trim().slice(0, 80)
  const tier = String(input.tier || '').trim().slice(0, 20)
  const provider = String(input.provider || '').trim().slice(0, 40)
  if (!reservationId || !/^\d{4}-\d{2}-\d{2}$/.test(window) || !Number.isSafeInteger(reservedUnits) || !Number.isSafeInteger(capUnits) || reservedUnits <= 0 || capUnits <= 0) {
    return { granted: false, durable: mode !== 'memory', usedUnits: 0, capUnits: Math.max(capUnits || 0, 0), reason: 'invalid_budget_reservation' }
  }

  try {
    if (mode === 'supabase') {
      const result = await rest('POST', 'rpc/supermega_reserve_ai_budget', {
        p_reservation_id: reservationId,
        p_window: window,
        p_reserved_units: reservedUnits,
        p_cap_units: capUnits,
        p_tenant_id: tenantId || null,
        p_tier: tier || null,
        p_provider: provider || null,
      })
      const row = Array.isArray(result) ? result[0] : result
      if (!row || typeof row.granted !== 'boolean') return { granted: false, durable: false, reason: 'budget_store_invalid_response' }
      return {
        granted: row.granted,
        durable: true,
        usedUnits: Number(row.used_units) || 0,
        capUnits: Number(row.cap_units) || capUnits,
        reason: row.reason || null,
      }
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const rows = await q(
        'select * from public.supermega_reserve_ai_budget($1,$2,$3,$4,$5,$6,$7)',
        [reservationId, window, reservedUnits, capUnits, tenantId || null, tier || null, provider || null],
      )
      const row = rows[0]
      if (!row || typeof row.granted !== 'boolean') return { granted: false, durable: false, reason: 'budget_store_invalid_response' }
      return {
        granted: row.granted,
        durable: true,
        usedUnits: Number(row.used_units) || 0,
        capUnits: Number(row.cap_units) || capUnits,
        reason: row.reason || null,
      }
    }

    let usedUnits = 0
    for (const [id, row] of mem.aiBudgetReservations) {
      if (row.window !== window) {
        mem.aiBudgetReservations.delete(id)
        continue
      }
      if (row.window === window && row.status !== 'released') usedUnits += row.reserved_units
    }
    if (mem.aiBudgetReservations.has(reservationId)) {
      return { granted: false, durable: false, usedUnits, capUnits, reason: 'duplicate_budget_reservation' }
    }
    if (usedUnits + reservedUnits > capUnits) {
      return { granted: false, durable: false, usedUnits, capUnits, reason: 'company_daily_budget_reached' }
    }
    mem.aiBudgetReservations.set(reservationId, {
      reservation_id: reservationId,
      window,
      reserved_units: reservedUnits,
      actual_units: null,
      status: 'reserved',
      tenant_id: tenantId || null,
      tier: tier || null,
      provider: provider || null,
      created_at: new Date().toISOString(),
      settled_at: null,
    })
    return { granted: true, durable: false, usedUnits: usedUnits + reservedUnits, capUnits, reason: null }
  } catch {
    return { granted: false, durable: false, usedUnits: 0, capUnits, reason: 'budget_store_unavailable' }
  }
}

function aiBudgetUsageRow(window, row, durable) {
  const integer = (value) => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
  }
  const reservedUnits = integer(row?.reserved_units)
  const attempts = integer(row?.attempts)
  const inFlight = integer(row?.in_flight)
  const consumed = integer(row?.consumed)
  const failed = integer(row?.failed)
  if ([reservedUnits, attempts, inFlight, consumed, failed].includes(null)
    || inFlight + consumed + failed !== attempts) {
    return { available: false, durable: false, window, reason: 'budget_store_invalid_response' }
  }
  return { available: true, durable, window, reservedUnits, attempts, inFlight, consumed, failed }
}

// Metadata-only company budget aggregate for protected operator status. Tenant, tier, provider,
// prompt, output, and provider-error fields never leave the reservation store through this read.
export async function getAiBudgetUsage(windowInput) {
  const window = String(windowInput || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(window)) {
    return { available: false, durable: false, window, reason: 'invalid_budget_window' }
  }
  try {
    if (mode === 'supabase') {
      const result = await rest('POST', 'rpc/supermega_get_ai_budget_usage', { p_window: window })
      const row = Array.isArray(result) ? result[0] : result
      return aiBudgetUsageRow(window, row, true)
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const rows = await q('select * from public.supermega_get_ai_budget_usage($1)', [window])
      return aiBudgetUsageRow(window, rows[0], true)
    }

    const aggregate = { reserved_units: 0, attempts: 0, in_flight: 0, consumed: 0, failed: 0 }
    for (const [id, row] of mem.aiBudgetReservations) {
      if (row.window !== window) {
        mem.aiBudgetReservations.delete(id)
        continue
      }
      if (row.status === 'released') continue
      aggregate.reserved_units += row.reserved_units
      aggregate.attempts += 1
      if (row.status === 'reserved') aggregate.in_flight += 1
      else if (row.status === 'consumed') aggregate.consumed += 1
      else if (row.status === 'failed') aggregate.failed += 1
    }
    return aiBudgetUsageRow(window, aggregate, false)
  } catch {
    return { available: false, durable: false, window, reason: 'budget_store_unavailable' }
  }
}

export async function settleAiBudgetReservation(reservationIdInput, statusInput, actualUnitsInput = null) {
  const reservationId = String(reservationIdInput || '').trim().slice(0, 120)
  const status = String(statusInput || '').trim().toLowerCase()
  const parsedActualUnits = actualUnitsInput === null ? null : Number(actualUnitsInput)
  const actualUnits = parsedActualUnits === null ? null : Math.trunc(parsedActualUnits)
  if (!reservationId || !['consumed', 'failed', 'released'].includes(status) || (actualUnits !== null && (!Number.isSafeInteger(actualUnits) || actualUnits < 0))) {
    return { updated: false, durable: mode !== 'memory', reason: 'invalid_budget_transition' }
  }
  const patch = { status, actual_units: actualUnits, settled_at: new Date().toISOString() }
  try {
    if (mode === 'supabase') {
      const rows = await rest(
        'PATCH',
        `supermega_ai_budget_reservations?reservation_id=eq.${encodeURIComponent(reservationId)}&status=eq.reserved&select=reservation_id,status`,
        patch,
      )
      return Array.isArray(rows) && rows.length === 1
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'budget_transition_conflict' }
    }
    if (mode === 'postgres') {
      await ensurePgTables()
      const rows = await q(
        `update supermega_ai_budget_reservations
            set status=$2, actual_units=$3, settled_at=now()
          where reservation_id=$1 and status='reserved'
          returning reservation_id`,
        [reservationId, status, actualUnits],
      )
      return rows.length === 1
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'budget_transition_conflict' }
    }
    const current = mem.aiBudgetReservations.get(reservationId)
    if (!current || current.status !== 'reserved') return { updated: false, durable: false, reason: 'budget_transition_conflict' }
    mem.aiBudgetReservations.set(reservationId, { ...current, ...patch })
    return { updated: true, durable: false }
  } catch {
    return { updated: false, durable: false, reason: 'budget_store_unavailable' }
  }
}

// Legacy post-dispatch increments bypass atomic admission and are intentionally disabled.
export async function addTokenUsage() {
  throw new Error('unreserved_token_usage_disabled')
}

// Reserve the maximum weighted units a model call can consume before any provider is contacted.
// Every durable implementation serializes on the tenant/window ledger row. Active reservations are
// deliberately not auto-expired: a crashed process must fail closed until an operator reconciles it.
export async function reserveTokenSpend(reservationId, tenantId, window, { reservedTokens, capTokens, expiresAt, dispatchToken, context } = {}) {
  const { id, tenant, month } = reservationIdentity(reservationId, tenantId, window)
  const requested = counter(reservedTokens, 'reserved_tokens', { positive: true })
  const cap = counter(capTokens, 'cap_tokens', { positive: true })
  const token = dispatchCredential(dispatchToken)
  const safeContext = safeReservationContext(context)
  const expiry = new Date(expiresAt)
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new TypeError('invalid_reservation_expiry')

  if (mode === 'supabase') {
    const rows = await rest('POST', 'rpc/supermega_reserve_token_spend', {
      p_reservation_id: id,
      p_tenant_id: tenant,
      p_window: month,
      p_reserved_tokens: requested,
      p_cap_tokens: cap,
      p_expires_at: expiry.toISOString(),
      p_dispatch_token: token,
      p_context: safeContext,
    })
    return { ...(rows?.[0] || { accepted: false, reason: 'reservation_store_empty' }), durable: true }
  }

  if (mode === 'postgres') {
    await ensurePgTables()
    return tx(async (query) => {
      await query('insert into supermega_token_ledger (tenant_id, "window", cap_tokens) values ($1,$2,$3) on conflict do nothing', [tenant, month, cap])
      let ledgerRow = (await query('select tenant_id, "window", cap_tokens, in_tokens, out_tokens, calls from supermega_token_ledger where tenant_id=$1 and "window"=$2 for update', [tenant, month]))[0]
      if (ledgerRow.cap_tokens === null) ledgerRow = (await query('update supermega_token_ledger set cap_tokens=$3,updated_at=now() where tenant_id=$1 and "window"=$2 returning tenant_id,"window",cap_tokens,in_tokens,out_tokens,calls', [tenant, month, cap]))[0]
      const existingRows = await query('select * from supermega_spend_reservations where reservation_id=$1', [id])
      const existing = existingRows[0]
      const active = await pgActiveReserved(query, tenant, month)
      const snapshot = spendSnapshot(ledgerRow, active)
      if (Number(ledgerRow.cap_tokens) !== cap) return { accepted: false, reason: 'cap_mismatch', reservation_id: id, status: 'rejected', ...snapshot, durable: true }
      if (existing) {
        const sameScope = existing.tenant_id === tenant && existing.window === month && Number(existing.reserved_tokens) === requested && sameReservationContext(existing.context, safeContext)
        if (sameScope && existing.status === 'reserved' && existing.dispatch_token === token) return { accepted: true, reason: 'idempotent', reservation_id: id, status: existing.status, ...snapshot, durable: true }
        if (sameScope && existing.status === 'reserved' && Date.parse(existing.expires_at) <= Date.now()) {
          await query('update supermega_spend_reservations set dispatch_token=$2,context=$3::jsonb,expires_at=$4,updated_at=now() where reservation_id=$1', [id, token, JSON.stringify(safeContext), expiry.toISOString()])
          return { accepted: true, reason: 'reservation_reclaimed', reservation_id: id, status: 'reserved', ...snapshot, durable: true }
        }
        const reason = sameScope && ['dispatched', 'indeterminate'].includes(existing.status)
          ? 'reconciliation_required'
          : sameScope && existing.status === 'reserved'
            ? 'reservation_in_progress'
            : 'reservation_exists'
        return { accepted: false, reason, reservation_id: id, status: existing.status, ...snapshot, durable: true }
      }
      if (snapshot.spend_total + requested > cap) return { accepted: false, reason: 'cap_reached', reservation_id: id, status: 'rejected', ...snapshot, durable: true }
      await query(
        `insert into supermega_spend_reservations (reservation_id,tenant_id,"window",reserved_tokens,status,expires_at,dispatch_token,context) values ($1,$2,$3,$4,'reserved',$5,$6,$7::jsonb)`,
        [id, tenant, month, requested, expiry.toISOString(), token, JSON.stringify(safeContext)],
      )
      return { accepted: true, reason: 'reserved', reservation_id: id, status: 'reserved', ...spendSnapshot(ledgerRow, active + requested), durable: true }
    })
  }

  const ledgerKey = `${tenant}::${month}`
  let ledgerRow = mem.tokenLedger.get(ledgerKey) || { tenant_id: tenant, window: month, cap_tokens: cap, in_tokens: 0, out_tokens: 0, calls: 0 }
  if (ledgerRow.cap_tokens === null || ledgerRow.cap_tokens === undefined) ledgerRow = { ...ledgerRow, cap_tokens: cap }
  mem.tokenLedger.set(ledgerKey, ledgerRow)
  const existing = mem.spendReservation.get(id)
  const active = memoryActiveReserved(tenant, month)
  const snapshot = spendSnapshot(ledgerRow, active)
  if (Number(ledgerRow.cap_tokens) !== cap) return { accepted: false, reason: 'cap_mismatch', reservation_id: id, status: 'rejected', ...snapshot, durable: false }
  if (existing) {
    const sameScope = existing.tenant_id === tenant && existing.window === month && existing.reserved_tokens === requested && sameReservationContext(existing.context, safeContext)
    if (sameScope && existing.status === 'reserved' && existing.dispatch_token === token) return { accepted: true, reason: 'idempotent', reservation_id: id, status: existing.status, ...snapshot, durable: false }
    if (sameScope && existing.status === 'reserved' && Date.parse(existing.expires_at) <= Date.now()) {
      mem.spendReservation.set(id, { ...existing, dispatch_token: token, context: safeContext, expires_at: expiry.toISOString(), updated_at: new Date().toISOString() })
      return { accepted: true, reason: 'reservation_reclaimed', reservation_id: id, status: 'reserved', ...snapshot, durable: false }
    }
    const reason = sameScope && ['dispatched', 'indeterminate'].includes(existing.status)
      ? 'reconciliation_required'
      : sameScope && existing.status === 'reserved'
        ? 'reservation_in_progress'
        : 'reservation_exists'
    return { accepted: false, reason, reservation_id: id, status: existing.status, ...snapshot, durable: false }
  }
  if (snapshot.spend_total + requested > cap) return { accepted: false, reason: 'cap_reached', reservation_id: id, status: 'rejected', ...snapshot, durable: false }
  mem.spendReservation.set(id, { reservation_id: id, tenant_id: tenant, window: month, reserved_tokens: requested, status: 'reserved', dispatch_token: token, context: safeContext, actual_in_tokens: 0, actual_out_tokens: 0, actual_calls: 0, expires_at: expiry.toISOString() })
  return { accepted: true, reason: 'reserved', reservation_id: id, status: 'reserved', ...spendSnapshot(ledgerRow, active + requested), durable: false }
}

async function transitionTokenSpend(reservationId, dispatchToken, target) {
  const id = String(reservationId || '').trim()
  if (!id || id.length > 120) throw new TypeError('invalid_reservation_id')
  const token = dispatchCredential(dispatchToken)
  const rpc = target === 'dispatched' ? 'supermega_mark_token_spend_dispatched' : 'supermega_mark_token_spend_indeterminate'
  if (mode === 'supabase') {
    const rows = await rest('POST', `rpc/${rpc}`, { p_reservation_id: id, p_dispatch_token: token })
    return { ...(rows?.[0] || { changed: false, reason: 'reservation_store_empty' }), durable: true }
  }
  const from = target === 'dispatched' ? 'reserved' : 'dispatched'
  if (mode === 'postgres') {
    await ensurePgTables()
    return tx(async (query) => {
      const reservation = (await query('select * from supermega_spend_reservations where reservation_id=$1 for update', [id]))[0]
      if (!reservation) return { changed: false, reason: 'reservation_not_found', reservation_id: id, durable: true }
      if (reservation.dispatch_token !== token) return { changed: false, reason: 'dispatch_token_mismatch', reservation_id: id, status: reservation.status, durable: true }
      if (reservation.status === target) return { changed: true, reason: 'idempotent', reservation_id: id, status: target, durable: true }
      if (reservation.status !== from) return { changed: false, reason: 'invalid_reservation_state', reservation_id: id, status: reservation.status, durable: true }
      if (target === 'dispatched' && Date.parse(reservation.expires_at) <= Date.now()) return { changed: false, reason: 'reservation_stale', reservation_id: id, status: reservation.status, durable: true }
      await query('update supermega_spend_reservations set status=$2,updated_at=now() where reservation_id=$1', [id, target])
      return { changed: true, reason: target, reservation_id: id, status: target, durable: true }
    })
  }
  const reservation = mem.spendReservation.get(id)
  if (!reservation) return { changed: false, reason: 'reservation_not_found', reservation_id: id, durable: false }
  if (reservation.dispatch_token !== token) return { changed: false, reason: 'dispatch_token_mismatch', reservation_id: id, status: reservation.status, durable: false }
  if (reservation.status === target) return { changed: true, reason: 'idempotent', reservation_id: id, status: target, durable: false }
  if (reservation.status !== from) return { changed: false, reason: 'invalid_reservation_state', reservation_id: id, status: reservation.status, durable: false }
  if (target === 'dispatched' && Date.parse(reservation.expires_at) <= Date.now()) return { changed: false, reason: 'reservation_stale', reservation_id: id, status: reservation.status, durable: false }
  mem.spendReservation.set(id, { ...reservation, status: target, updated_at: new Date().toISOString() })
  return { changed: true, reason: target, reservation_id: id, status: target, durable: false }
}

export async function markTokenSpendDispatched(reservationId, dispatchToken) {
  return transitionTokenSpend(reservationId, dispatchToken, 'dispatched')
}

export async function markTokenSpendIndeterminate(reservationId, dispatchToken) {
  return transitionTokenSpend(reservationId, dispatchToken, 'indeterminate')
}

// Settle exactly once. If the durable write fails, the active maximum reservation remains counted,
// which over-counts safely instead of allowing a second request to spend the same budget.
export async function settleTokenSpend(reservationId, { inTokens = 0, outTokens = 0, calls = 1, dispatchToken } = {}) {
  const id = String(reservationId || '').trim()
  if (!id || id.length > 120) throw new TypeError('invalid_reservation_id')
  const token = dispatchCredential(dispatchToken)
  const input = counter(inTokens, 'input_tokens')
  const output = counter(outTokens, 'output_tokens')
  const callCount = counter(calls, 'calls')

  if (mode === 'supabase') {
    const rows = await rest('POST', 'rpc/supermega_settle_token_spend', { p_reservation_id: id, p_dispatch_token: token, p_in_tokens: input, p_out_tokens: output, p_calls: callCount })
    return { ...(rows?.[0] || { settled: false, reason: 'reservation_store_empty' }), durable: true }
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    return tx(async (query) => {
      const identities = await query('select tenant_id, "window" from supermega_spend_reservations where reservation_id=$1', [id])
      if (!identities[0]) return { settled: false, reason: 'reservation_not_found', reservation_id: id, durable: true }
      const { tenant_id: tenant, window: month } = identities[0]
      await query('insert into supermega_token_ledger (tenant_id, "window") values ($1,$2) on conflict do nothing', [tenant, month])
      let ledgerRow = (await query('select tenant_id, "window", cap_tokens, in_tokens, out_tokens, calls from supermega_token_ledger where tenant_id=$1 and "window"=$2 for update', [tenant, month]))[0]
      const reservation = (await query('select * from supermega_spend_reservations where reservation_id=$1 for update', [id]))[0]
      const snapshot = async () => spendSnapshot(ledgerRow, await pgActiveReserved(query, tenant, month))
      if (reservation.dispatch_token !== token) return { settled: false, reason: 'dispatch_token_mismatch', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      if (reservation.status === 'released') {
        return { settled: false, reason: 'reservation_released', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      }
      if (reservation.status === 'settled' && (Number(reservation.actual_in_tokens) !== input || Number(reservation.actual_out_tokens) !== output || Number(reservation.actual_calls) !== callCount)) {
        return { settled: false, reason: 'settlement_conflict', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      }
      if (reservation.status === 'reserved') return { settled: false, reason: 'reservation_not_dispatched', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      if (ACTIVE_SPEND_STATUSES.has(reservation.status) && input + output > Number(reservation.reserved_tokens)) {
        return { settled: false, reason: 'actual_exceeds_reservation', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      }
      const settleable = reservation.status === 'dispatched' || reservation.status === 'indeterminate'
      if (settleable) {
        ledgerRow = (await query(
          `update supermega_token_ledger set in_tokens=in_tokens+$3, out_tokens=out_tokens+$4, calls=calls+$5, updated_at=now() where tenant_id=$1 and "window"=$2 returning tenant_id,"window",cap_tokens,in_tokens,out_tokens,calls`,
          [tenant, month, input, output, callCount],
        ))[0]
        await query(`update supermega_spend_reservations set status='settled',actual_in_tokens=$2,actual_out_tokens=$3,actual_calls=$4,updated_at=now() where reservation_id=$1`, [id, input, output, callCount])
      }
      return { settled: reservation.status === 'settled' || settleable, reason: settleable ? 'settled' : 'idempotent', reservation_id: id, status: 'settled', ...(await snapshot()), durable: true }
    })
  }

  const reservation = mem.spendReservation.get(id)
  if (!reservation) return { settled: false, reason: 'reservation_not_found', reservation_id: id, durable: false }
  const ledgerKey = `${reservation.tenant_id}::${reservation.window}`
  let ledgerRow = mem.tokenLedger.get(ledgerKey) || { tenant_id: reservation.tenant_id, window: reservation.window, in_tokens: 0, out_tokens: 0, calls: 0 }
  if (reservation.dispatch_token !== token) return { settled: false, reason: 'dispatch_token_mismatch', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (reservation.status === 'released') return { settled: false, reason: 'reservation_released', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (reservation.status === 'settled' && (reservation.actual_in_tokens !== input || reservation.actual_out_tokens !== output || reservation.actual_calls !== callCount)) return { settled: false, reason: 'settlement_conflict', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (reservation.status === 'reserved') return { settled: false, reason: 'reservation_not_dispatched', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (ACTIVE_SPEND_STATUSES.has(reservation.status) && input + output > reservation.reserved_tokens) return { settled: false, reason: 'actual_exceeds_reservation', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  const settleable = reservation.status === 'dispatched' || reservation.status === 'indeterminate'
  if (settleable) {
    ledgerRow = { ...ledgerRow, in_tokens: ledgerRow.in_tokens + input, out_tokens: ledgerRow.out_tokens + output, calls: ledgerRow.calls + callCount }
    mem.tokenLedger.set(ledgerKey, ledgerRow)
    mem.spendReservation.set(id, { ...reservation, status: 'settled', actual_in_tokens: input, actual_out_tokens: output, actual_calls: callCount })
  }
  return { settled: reservation.status === 'settled' || settleable, reason: settleable ? 'settled' : 'idempotent', reservation_id: id, status: 'settled', ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
}

export async function releaseTokenSpend(reservationId, { dispatchToken, definitive = false } = {}) {
  const id = String(reservationId || '').trim()
  if (!id || id.length > 120) throw new TypeError('invalid_reservation_id')
  const token = dispatchCredential(dispatchToken)
  if (mode === 'supabase') {
    const rows = await rest('POST', 'rpc/supermega_release_token_spend', { p_reservation_id: id, p_dispatch_token: token, p_definitive: Boolean(definitive) })
    return { ...(rows?.[0] || { released: false, reason: 'reservation_store_empty' }), durable: true }
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    return tx(async (query) => {
      const identities = await query('select tenant_id, "window" from supermega_spend_reservations where reservation_id=$1', [id])
      if (!identities[0]) return { released: false, reason: 'reservation_not_found', reservation_id: id, durable: true }
      const { tenant_id: tenant, window: month } = identities[0]
      await query('insert into supermega_token_ledger (tenant_id, "window") values ($1,$2) on conflict do nothing', [tenant, month])
      const ledgerRow = (await query('select tenant_id, "window", cap_tokens, in_tokens, out_tokens, calls from supermega_token_ledger where tenant_id=$1 and "window"=$2 for update', [tenant, month]))[0]
      const reservation = (await query('select * from supermega_spend_reservations where reservation_id=$1 for update', [id]))[0]
      const snapshot = async () => spendSnapshot(ledgerRow, await pgActiveReserved(query, tenant, month))
      if (reservation.dispatch_token !== token) return { released: false, reason: 'dispatch_token_mismatch', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      if (reservation.status === 'settled') {
        return { released: false, reason: 'reservation_settled', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      }
      if (reservation.status === 'indeterminate') return { released: false, reason: 'reservation_indeterminate', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      if (reservation.status === 'dispatched' && !definitive) return { released: false, reason: 'dispatch_not_definitive', reservation_id: id, status: reservation.status, ...(await snapshot()), durable: true }
      const releasable = reservation.status === 'reserved' || reservation.status === 'dispatched'
      if (releasable) await query(`update supermega_spend_reservations set status='released',updated_at=now() where reservation_id=$1`, [id])
      return { released: reservation.status === 'released' || releasable, reason: releasable ? 'released' : 'idempotent', reservation_id: id, status: 'released', ...(await snapshot()), durable: true }
    })
  }
  const reservation = mem.spendReservation.get(id)
  if (!reservation) return { released: false, reason: 'reservation_not_found', reservation_id: id, durable: false }
  const ledgerRow = mem.tokenLedger.get(`${reservation.tenant_id}::${reservation.window}`) || { tenant_id: reservation.tenant_id, window: reservation.window, in_tokens: 0, out_tokens: 0, calls: 0 }
  if (reservation.dispatch_token !== token) return { released: false, reason: 'dispatch_token_mismatch', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (reservation.status === 'settled') return { released: false, reason: 'reservation_settled', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (reservation.status === 'indeterminate') return { released: false, reason: 'reservation_indeterminate', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (reservation.status === 'dispatched' && !definitive) return { released: false, reason: 'dispatch_not_definitive', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  const releasable = reservation.status === 'reserved' || reservation.status === 'dispatched'
  if (releasable) mem.spendReservation.set(id, { ...reservation, status: 'released' })
  return { released: reservation.status === 'released' || releasable, reason: releasable ? 'released' : 'idempotent', reservation_id: id, status: 'released', ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
}

// Privileged operator recovery for a provider outcome proven outside the request process. This is
// intentionally separate from dispatch credentials and requires a hash of reviewed evidence.
export async function reconcileTokenSpend(reservationId, { action, inTokens = 0, outTokens = 0, calls = 0, actor, evidenceHash } = {}) {
  const id = String(reservationId || '').trim()
  if (!id || id.length > 120) throw new TypeError('invalid_reservation_id')
  const resolution = String(action || '').trim().toLowerCase()
  if (!['settle', 'release'].includes(resolution)) throw new TypeError('invalid_reconciliation_action')
  const reconciledBy = String(actor || '').trim()
  if (!reconciledBy || reconciledBy.length > 80) throw new TypeError('invalid_reconciliation_actor')
  const proof = String(evidenceHash || '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(proof)) throw new TypeError('invalid_reconciliation_evidence_hash')
  const input = counter(inTokens, 'input_tokens')
  const output = counter(outTokens, 'output_tokens')
  const callCount = counter(calls, 'calls')
  if (resolution === 'release' && (input !== 0 || output !== 0 || callCount !== 0)) throw new TypeError('invalid_release_reconciliation_usage')

  if (mode === 'supabase') {
    const rows = await rest('POST', 'rpc/supermega_reconcile_token_spend', {
      p_reservation_id: id,
      p_action: resolution,
      p_in_tokens: input,
      p_out_tokens: output,
      p_calls: callCount,
      p_actor: reconciledBy,
      p_evidence_hash: proof,
    })
    return { ...(rows?.[0] || { reconciled: false, reason: 'reservation_store_empty' }), durable: true }
  }

  if (mode === 'postgres') {
    await ensurePgTables()
    return tx(async (query) => {
      const identity = (await query('select tenant_id,"window" from supermega_spend_reservations where reservation_id=$1', [id]))[0]
      if (!identity) return { reconciled: false, reason: 'reservation_not_found', reservation_id: id, durable: true }
      const { tenant_id: tenant, window: month } = identity
      const ledgerRow = (await query('select tenant_id,"window",cap_tokens,in_tokens,out_tokens,calls from supermega_token_ledger where tenant_id=$1 and "window"=$2 for update', [tenant, month]))[0]
      const reservation = (await query('select * from supermega_spend_reservations where reservation_id=$1 for update', [id]))[0]
      const terminalStatus = resolution === 'settle' ? 'settled' : 'released'
      const sameTerminal = reservation.status === terminalStatus
        && reservation.reconciled_by === reconciledBy
        && reservation.reconciliation_evidence_hash === proof
        && (resolution === 'release' || (Number(reservation.actual_in_tokens) === input && Number(reservation.actual_out_tokens) === output && Number(reservation.actual_calls) === callCount))
      if (sameTerminal) return { reconciled: true, reason: 'idempotent', reservation_id: id, status: terminalStatus, ...spendSnapshot(ledgerRow, await pgActiveReserved(query, tenant, month)), durable: true }
      if (['settled', 'released'].includes(reservation.status)) return { reconciled: false, reason: 'reconciliation_conflict', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, await pgActiveReserved(query, tenant, month)), durable: true }
      if (!['dispatched', 'indeterminate'].includes(reservation.status)) return { reconciled: false, reason: 'invalid_reservation_state', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, await pgActiveReserved(query, tenant, month)), durable: true }
      if (resolution === 'settle' && input + output > Number(reservation.reserved_tokens)) return { reconciled: false, reason: 'actual_exceeds_reservation', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, await pgActiveReserved(query, tenant, month)), durable: true }
      let nextLedger = ledgerRow
      if (resolution === 'settle') {
        nextLedger = (await query('update supermega_token_ledger set in_tokens=in_tokens+$3,out_tokens=out_tokens+$4,calls=calls+$5,updated_at=now() where tenant_id=$1 and "window"=$2 returning tenant_id,"window",cap_tokens,in_tokens,out_tokens,calls', [tenant, month, input, output, callCount]))[0]
      }
      await query(`update supermega_spend_reservations set status=$2,actual_in_tokens=$3,actual_out_tokens=$4,actual_calls=$5,reconciled_by=$6,reconciliation_evidence_hash=$7,reconciled_at=now(),updated_at=now() where reservation_id=$1`, [id, terminalStatus, input, output, callCount, reconciledBy, proof])
      return { reconciled: true, reason: 'reconciled', reservation_id: id, status: terminalStatus, ...spendSnapshot(nextLedger, await pgActiveReserved(query, tenant, month)), durable: true }
    })
  }

  const reservation = mem.spendReservation.get(id)
  if (!reservation) return { reconciled: false, reason: 'reservation_not_found', reservation_id: id, durable: false }
  const ledgerKey = `${reservation.tenant_id}::${reservation.window}`
  let ledgerRow = mem.tokenLedger.get(ledgerKey) || { tenant_id: reservation.tenant_id, window: reservation.window, in_tokens: 0, out_tokens: 0, calls: 0 }
  const terminalStatus = resolution === 'settle' ? 'settled' : 'released'
  const sameTerminal = reservation.status === terminalStatus
    && reservation.reconciled_by === reconciledBy
    && reservation.reconciliation_evidence_hash === proof
    && (resolution === 'release' || (reservation.actual_in_tokens === input && reservation.actual_out_tokens === output && reservation.actual_calls === callCount))
  if (sameTerminal) return { reconciled: true, reason: 'idempotent', reservation_id: id, status: terminalStatus, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (['settled', 'released'].includes(reservation.status)) return { reconciled: false, reason: 'reconciliation_conflict', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (!['dispatched', 'indeterminate'].includes(reservation.status)) return { reconciled: false, reason: 'invalid_reservation_state', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (resolution === 'settle' && input + output > reservation.reserved_tokens) return { reconciled: false, reason: 'actual_exceeds_reservation', reservation_id: id, status: reservation.status, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
  if (resolution === 'settle') {
    ledgerRow = { ...ledgerRow, in_tokens: ledgerRow.in_tokens + input, out_tokens: ledgerRow.out_tokens + output, calls: ledgerRow.calls + callCount }
    mem.tokenLedger.set(ledgerKey, ledgerRow)
  }
  mem.spendReservation.set(id, { ...reservation, status: terminalStatus, actual_in_tokens: input, actual_out_tokens: output, actual_calls: callCount, reconciled_by: reconciledBy, reconciliation_evidence_hash: proof, reconciled_at: new Date().toISOString() })
  return { reconciled: true, reason: 'reconciled', reservation_id: id, status: terminalStatus, ...spendSnapshot(ledgerRow, memoryActiveReserved(reservation.tenant_id, reservation.window)), durable: false }
}

const CONTROL_RECORD_PREFIXES = Object.freeze([
  ['agent-company-sign-in-code:', 'sign_in_code'],
  ['agent-company-operator-session:', 'operator_session'],
  ['company-mission-record:', 'mission'],
  ['company-work-order-record:', 'work_order'],
  ['company-work-order-review-record:', 'work_order_review'],
  ['company-work-order-evaluation:', 'work_order_evaluation'],
  // Founder lead-review decisions (console Leads view). Authority evidence, never response cache.
  ['console-lead-review-record:', 'lead_review'],
  // CEO outcome records are execution authority (completions, evaluations, deliveries, follow-up
  // actions) recorded by agent-company-operations.mjs. They must never live in the response cache.
  ['ceo-outcome-operation:', 'ceo_outcome_operation'],
  ['ceo-outcome-evaluation:', 'ceo_outcome_evaluation'],
  ['ceo-outcome-delivery:', 'ceo_outcome_delivery'],
  ['ceo-outcome-action:', 'ceo_outcome_action'],
])
const CONTROL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const CONTROL_STATUS_RE = /^[a-z][a-z_]{0,39}$/
const CONTROL_HASH_RE = /^[a-f0-9]{64}$/

function controlRecordType(key) {
  const normalized = String(key || '')
  return CONTROL_RECORD_PREFIXES.find(([prefix]) => normalized.startsWith(prefix))?.[1] || ''
}

function controlRecordTypeForPrefix(prefix) {
  const normalized = String(prefix || '')
  return CONTROL_RECORD_PREFIXES.find(([candidate]) => normalized === candidate)?.[1] || ''
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function controlEnvelope(recordKey, payload) {
  const key = String(recordKey || '').trim()
  const recordType = controlRecordType(key)
  if (!recordType || key.length > 240 || !payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const tenantId = String(payload.clientId || payload.tenantId || '').trim()
  const status = String(payload.status || 'recorded').trim()
  const planHash = String(payload.planHash || payload.reviewHash || payload.recordHash || payload.deliveryHash || payload.actionHash || payload.evaluationHash || '').trim()
  const revision = Number.isInteger(payload.revision) && payload.revision >= 1 ? payload.revision : 1
  if (!CONTROL_ID_RE.test(tenantId) || !CONTROL_STATUS_RE.test(status) || !CONTROL_HASH_RE.test(planHash)) return null
  let serialized
  try { serialized = stableJson(payload) } catch { return null }
  return {
    record_key: key,
    record_type: recordType,
    tenant_id: tenantId,
    status,
    plan_hash: planHash,
    payload,
    payload_hash: createHash('sha256').update(serialized).digest('hex'),
    revision,
  }
}

function rpcRow(result) {
  return Array.isArray(result) ? result[0] : result
}

// AI response cache (optional). Control-plane keys are never accepted by these explicit APIs.
export async function getResponseCache(cacheKey) {
  if (!cacheKey) return null
  if (controlRecordType(cacheKey)) return null
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

export async function putResponseCache(cacheKey, payload) {
  if (!cacheKey) return null
  if (controlRecordType(cacheKey)) return null
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

// Bounded internal index for cache-backed control records. Callers must still validate every
// payload before using it; this only narrows the durable read by key prefix and tenant metadata.
async function listResponseCacheRecords({
  prefix,
  clientId = '',
  status = '',
  expiresAfter = '',
  limit = 200,
} = {}) {
  const normalizedPrefix = String(prefix || '').trim()
  const normalizedClientId = String(clientId || '').trim()
  const normalizedStatus = String(status || '').trim()
  const normalizedExpiry = String(expiresAfter || '').trim()
  const boundedLimit = Number(limit)
  const validExpiry = !normalizedExpiry
    || (Number.isFinite(new Date(normalizedExpiry).getTime()) && new Date(normalizedExpiry).toISOString() === normalizedExpiry)
  if (!/^[A-Za-z0-9][A-Za-z0-9.:-]{0,159}$/.test(normalizedPrefix)
    || (normalizedClientId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(normalizedClientId))
    || (normalizedStatus && !/^[a-z][a-z_]{0,39}$/.test(normalizedStatus))
    || !validExpiry
    || !Number.isInteger(boundedLimit)
    || boundedLimit < 1
    || boundedLimit > 250) {
    throw new Error('invalid_cached_response_list_query')
  }

  if (mode === 'supabase') {
    const query = [
      `cache_key=like.${encodeURIComponent(normalizedPrefix)}*`,
      normalizedClientId ? `payload->>clientId=eq.${encodeURIComponent(normalizedClientId)}` : '',
      normalizedStatus ? `payload->>status=eq.${encodeURIComponent(normalizedStatus)}` : '',
      normalizedExpiry ? `payload->>expiresAt=gt.${encodeURIComponent(normalizedExpiry)}` : '',
      'select=cache_key,payload',
      'order=created_at.desc',
      `limit=${boundedLimit}`,
    ].filter(Boolean).join('&')
    const rows = await rest('GET', `supermega_ai_cache?${query}`)
    return {
      durable: true,
      records: rows.map((row) => ({ key: row.cache_key, payload: row.payload })),
    }
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const clauses = ['cache_key like $1']
    const values = [`${normalizedPrefix}%`]
    if (normalizedClientId) { values.push(normalizedClientId); clauses.push(`payload->>'clientId'=$${values.length}`) }
    if (normalizedStatus) { values.push(normalizedStatus); clauses.push(`payload->>'status'=$${values.length}`) }
    if (normalizedExpiry) { values.push(normalizedExpiry); clauses.push(`payload->>'expiresAt'>$${values.length}`) }
    values.push(boundedLimit)
    const rows = await q(
      `select cache_key, payload from supermega_ai_cache where ${clauses.join(' and ')} order by created_at desc limit $${values.length}`,
      values,
    )
    return {
      durable: true,
      records: rows.map((row) => ({ key: row.cache_key, payload: row.payload })),
    }
  }

  let records = [...mem.aiCache.entries()]
    .map(([key, payload]) => ({ key, payload }))
    .filter((record) => record.key.startsWith(normalizedPrefix))
  if (normalizedClientId) records = records.filter((record) => record.payload?.clientId === normalizedClientId)
  if (normalizedStatus) records = records.filter((record) => record.payload?.status === normalizedStatus)
  if (normalizedExpiry) records = records.filter((record) => String(record.payload?.expiresAt || '') > normalizedExpiry)
  records.sort((left, right) => String(right.payload?.issuedAt || '').localeCompare(String(left.payload?.issuedAt || '')))
  return { durable: false, records: records.slice(0, boundedLimit) }
}

// Atomically replace one cached payload only while its status, plan hash, and optional revision
// still match. Work orders use status + planHash; staged missions also bind every transition to a
// monotonically increasing revision so concurrent operators cannot both advance the same stage.
async function transitionResponseCache(cacheKey, expected, payload) {
  const key = String(cacheKey || '').trim()
  const status = String(expected?.status || '').trim()
  const planHash = String(expected?.planHash || '').trim()
  const hasRevision = expected?.revision !== undefined
  const revision = Number(expected?.revision)
  const valid = key
    && /^[a-z][a-z_]{0,39}$/.test(status)
    && /^[a-f0-9]{64}$/.test(planHash)
    && (!hasRevision || (Number.isInteger(revision) && revision >= 1))
    && payload && typeof payload === 'object' && !Array.isArray(payload)
  if (!valid) return { updated: false, durable: mode !== 'memory', reason: 'invalid_transition' }

  if (mode === 'supabase') {
    try {
      const query = [
        `cache_key=eq.${encodeURIComponent(key)}`,
        `payload->>status=eq.${encodeURIComponent(status)}`,
        `payload->>planHash=eq.${encodeURIComponent(planHash)}`,
        ...(hasRevision ? [`payload->>revision=eq.${revision}`] : []),
        'select=cache_key',
      ].join('&')
      const rows = await rest('PATCH', `supermega_ai_cache?${query}`, { payload })
      return Array.isArray(rows) && rows.length === 1
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'transition_conflict' }
    } catch {
      return { updated: false, durable: false, reason: 'store_unavailable' }
    }
  }
  if (mode === 'postgres') {
    try {
      await ensurePgTables()
      const rows = hasRevision
        ? await q(
          `update supermega_ai_cache
           set payload=$5
           where cache_key=$1 and payload->>'status'=$2 and payload->>'planHash'=$3
             and payload->>'revision'=$4
           returning cache_key`,
          [key, status, planHash, String(revision), JSON.stringify(payload)],
        )
        : await q(
          `update supermega_ai_cache
           set payload=$4
           where cache_key=$1 and payload->>'status'=$2 and payload->>'planHash'=$3
           returning cache_key`,
          [key, status, planHash, JSON.stringify(payload)],
        )
      return rows.length === 1
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'transition_conflict' }
    } catch {
      return { updated: false, durable: false, reason: 'store_unavailable' }
    }
  }

  const current = mem.aiCache.get(key)
  if (!current
    || current.status !== status
    || current.planHash !== planHash
    || (hasRevision && current.revision !== revision)) {
    return { updated: false, durable: false, reason: 'transition_conflict' }
  }
  mem.aiCache.set(key, payload)
  return { updated: true, durable: false }
}

// ---------- versioned Agent Company control records ----------
// These records are physically separate from model-response cache entries. The compatibility
// exports below route only a fixed set of authority-bearing key prefixes into this store, so an
// old cache row with the same key is inert and can never be read as current authority.
export async function getControlRecord(recordKey) {
  const key = String(recordKey || '').trim()
  if (!controlRecordType(key)) return null
  if (mode === 'supabase') {
    const rows = await rest('GET', `supermega_control_records?record_key=eq.${encodeURIComponent(key)}&select=payload&limit=1`)
    return rows[0]?.payload || null
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const rows = await q('select payload from supermega_control_records where record_key=$1 limit 1', [key])
    return rows[0]?.payload || null
  }
  return mem.controlRecords.get(key)?.payload || null
}

export async function putControlRecord(recordKey, payload) {
  const envelope = controlEnvelope(recordKey, payload)
  if (!envelope) return null
  const params = [
    envelope.record_key,
    envelope.record_type,
    envelope.tenant_id,
    envelope.status,
    envelope.plan_hash,
    JSON.stringify(envelope.payload),
    envelope.payload_hash,
  ]
  if (mode === 'supabase') {
    const row = rpcRow(await rest('POST', 'rpc/supermega_put_control_record', {
      p_record_key: envelope.record_key,
      p_record_type: envelope.record_type,
      p_tenant_id: envelope.tenant_id,
      p_status: envelope.status,
      p_plan_hash: envelope.plan_hash,
      p_payload: envelope.payload,
      p_payload_hash: envelope.payload_hash,
    }))
    return row?.updated === true
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const row = (await q('select * from supermega_put_control_record($1,$2,$3,$4,$5,$6::jsonb,$7)', params))[0]
    return row?.updated === true
  }
  const current = mem.controlRecords.get(envelope.record_key)
  if (current && (current.record_type !== envelope.record_type || current.tenant_id !== envelope.tenant_id)) return null
  const version = Number(current?.record_version || 0) + 1
  const now = new Date().toISOString()
  mem.controlRecords.set(envelope.record_key, {
    ...envelope,
    record_version: version,
    created_at: current?.created_at || now,
    updated_at: now,
  })
  mem.controlTransitions.push({
    record_key: envelope.record_key,
    record_type: envelope.record_type,
    tenant_id: envelope.tenant_id,
    event_type: current ? 'replaced' : 'created',
    from_status: current?.status || null,
    to_status: envelope.status,
    from_record_version: current?.record_version || null,
    to_record_version: version,
    prior_payload_hash: current?.payload_hash || null,
    next_payload_hash: envelope.payload_hash,
    created_at: now,
  })
  return true
}

export async function listControlRecords({
  prefix,
  clientId = '',
  status = '',
  expiresAfter = '',
  limit = 200,
} = {}) {
  const normalizedPrefix = String(prefix || '').trim()
  const recordType = controlRecordTypeForPrefix(normalizedPrefix)
  const normalizedClientId = String(clientId || '').trim()
  const normalizedStatus = String(status || '').trim()
  const normalizedExpiry = String(expiresAfter || '').trim()
  const boundedLimit = Number(limit)
  const validExpiry = !normalizedExpiry
    || (Number.isFinite(new Date(normalizedExpiry).getTime()) && new Date(normalizedExpiry).toISOString() === normalizedExpiry)
  if (!recordType
    || (normalizedClientId && !CONTROL_ID_RE.test(normalizedClientId))
    || (normalizedStatus && !CONTROL_STATUS_RE.test(normalizedStatus))
    || !validExpiry
    || !Number.isInteger(boundedLimit)
    || boundedLimit < 1
    || boundedLimit > 250) {
    throw new Error('invalid_control_record_list_query')
  }
  if (mode === 'supabase') {
    const query = [
      `record_type=eq.${encodeURIComponent(recordType)}`,
      normalizedClientId ? `tenant_id=eq.${encodeURIComponent(normalizedClientId)}` : '',
      normalizedStatus ? `status=eq.${encodeURIComponent(normalizedStatus)}` : '',
      normalizedExpiry ? `payload->>expiresAt=gt.${encodeURIComponent(normalizedExpiry)}` : '',
      'select=record_key,payload',
      'order=updated_at.desc',
      `limit=${boundedLimit}`,
    ].filter(Boolean).join('&')
    const rows = await rest('GET', `supermega_control_records?${query}`)
    return { durable: true, records: rows.map((row) => ({ key: row.record_key, payload: row.payload })) }
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const clauses = ['record_type=$1']
    const values = [recordType]
    if (normalizedClientId) { values.push(normalizedClientId); clauses.push(`tenant_id=$${values.length}`) }
    if (normalizedStatus) { values.push(normalizedStatus); clauses.push(`status=$${values.length}`) }
    if (normalizedExpiry) { values.push(normalizedExpiry); clauses.push(`payload->>'expiresAt'>$${values.length}`) }
    values.push(boundedLimit)
    const rows = await q(
      `select record_key, payload from supermega_control_records where ${clauses.join(' and ')} order by updated_at desc limit $${values.length}`,
      values,
    )
    return { durable: true, records: rows.map((row) => ({ key: row.record_key, payload: row.payload })) }
  }
  let records = [...mem.controlRecords.values()]
    .filter((record) => record.record_type === recordType)
  if (normalizedClientId) records = records.filter((record) => record.tenant_id === normalizedClientId)
  if (normalizedStatus) records = records.filter((record) => record.status === normalizedStatus)
  if (normalizedExpiry) records = records.filter((record) => String(record.payload?.expiresAt || '') > normalizedExpiry)
  records.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
  return { durable: false, records: records.slice(0, boundedLimit).map((record) => ({ key: record.record_key, payload: record.payload })) }
}

export async function transitionControlRecord(recordKey, expected, payload) {
  const key = String(recordKey || '').trim()
  const envelope = controlEnvelope(key, payload)
  const status = String(expected?.status || '').trim()
  const planHash = String(expected?.planHash || '').trim()
  const hasRevision = expected?.revision !== undefined
  const revision = Number(expected?.revision)
  if (!envelope
    || !CONTROL_STATUS_RE.test(status)
    || !CONTROL_HASH_RE.test(planHash)
    || (hasRevision && (!Number.isInteger(revision) || revision < 1))) {
    return { updated: false, durable: mode !== 'memory', reason: 'invalid_transition' }
  }
  if (mode === 'supabase') {
    try {
      const row = rpcRow(await rest('POST', 'rpc/supermega_transition_control_record', {
        p_record_key: key,
        p_expected_status: status,
        p_expected_plan_hash: planHash,
        p_has_revision: hasRevision,
        p_expected_revision: hasRevision ? revision : null,
        p_record_type: envelope.record_type,
        p_tenant_id: envelope.tenant_id,
        p_status: envelope.status,
        p_plan_hash: envelope.plan_hash,
        p_payload: envelope.payload,
        p_payload_hash: envelope.payload_hash,
      }))
      return row?.updated === true
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'transition_conflict' }
    } catch {
      return { updated: false, durable: false, reason: 'store_unavailable' }
    }
  }
  if (mode === 'postgres') {
    try {
      await ensurePgTables()
      const row = (await q(
        'select * from supermega_transition_control_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)',
        [key, status, planHash, hasRevision, hasRevision ? revision : null, envelope.record_type, envelope.tenant_id, envelope.status, envelope.plan_hash, JSON.stringify(envelope.payload), envelope.payload_hash],
      ))[0]
      return row?.updated === true
        ? { updated: true, durable: true }
        : { updated: false, durable: true, reason: 'transition_conflict' }
    } catch {
      return { updated: false, durable: false, reason: 'store_unavailable' }
    }
  }
  const current = mem.controlRecords.get(key)
  if (!current
    || current.status !== status
    || current.plan_hash !== planHash
    || current.record_type !== envelope.record_type
    || current.tenant_id !== envelope.tenant_id
    || (hasRevision && current.payload?.revision !== revision)) {
    return { updated: false, durable: false, reason: 'transition_conflict' }
  }
  const version = current.record_version + 1
  const now = new Date().toISOString()
  mem.controlRecords.set(key, { ...envelope, record_version: version, created_at: current.created_at, updated_at: now })
  mem.controlTransitions.push({
    record_key: key,
    record_type: envelope.record_type,
    tenant_id: envelope.tenant_id,
    event_type: 'transitioned',
    from_status: current.status,
    to_status: envelope.status,
    from_record_version: current.record_version,
    to_record_version: version,
    prior_payload_hash: current.payload_hash,
    next_payload_hash: envelope.payload_hash,
    created_at: now,
  })
  return { updated: true, durable: false }
}

// Compatibility adapter for existing Agent Company modules. Non-control keys retain response-cache
// behavior; recognized authority keys are never read from or written to supermega_ai_cache.
export async function getCachedResponse(cacheKey) {
  return controlRecordType(cacheKey) ? getControlRecord(cacheKey) : getResponseCache(cacheKey)
}

export async function putCachedResponse(cacheKey, payload) {
  return controlRecordType(cacheKey) ? putControlRecord(cacheKey, payload) : putResponseCache(cacheKey, payload)
}

export async function listCachedResponseRecords(query = {}) {
  return controlRecordTypeForPrefix(String(query.prefix || '').trim())
    ? listControlRecords(query)
    : listResponseCacheRecords(query)
}

export async function transitionCachedResponse(cacheKey, expected, payload) {
  return controlRecordType(cacheKey)
    ? transitionControlRecord(cacheKey, expected, payload)
    : transitionResponseCache(cacheKey, expected, payload)
}

// ---------- approval queue ----------
// State changes are compare-and-swap updates on status + version. Provider credentials never enter
// these rows; payload contains only the exact owner-reviewed action arguments.

const APPROVAL_PATCH_FIELDS = new Set([
  'status', 'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
  'executing_at', 'lease_expires_at', 'attempts', 'provider_ref', 'result',
  'last_error', 'executed_at',
])

export async function createApprovalRecord(input) {
  const now = new Date().toISOString()
  const row = {
    id: String(input.id),
    client_id: String(input.client_id),
    action_type: String(input.action_type),
    title: String(input.title),
    payload: input.payload,
    payload_hash: String(input.payload_hash),
    source: input.source || {},
    status: 'draft',
    version: 0,
    attempts: 0,
    created_at: now,
    updated_at: now,
  }
  if (mode === 'supabase') return (await rest('POST', 'supermega_action_queue', row))[0] || null
  if (mode === 'postgres') {
    await ensurePgTables()
    const rows = await q(
      `insert into supermega_action_queue
       (id,client_id,action_type,title,payload,payload_hash,source,status,version,attempts,created_at,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,'draft',0,0,$8,$8) returning *`,
      [row.id, row.client_id, row.action_type, row.title, JSON.stringify(row.payload), row.payload_hash, JSON.stringify(row.source), now],
    )
    return rows[0] || null
  }
  if (mem.approval.has(row.id)) throw new Error('approval_id_conflict')
  mem.approval.set(row.id, row)
  return { ...row }
}

export async function getApprovalRecord(id) {
  const key = String(id || '').trim()
  if (!key) return null
  if (mode === 'supabase') return (await rest('GET', `supermega_action_queue?id=eq.${encodeURIComponent(key)}&limit=1`))[0] || null
  if (mode === 'postgres') {
    await ensurePgTables()
    return (await q('select * from supermega_action_queue where id=$1 limit 1', [key]))[0] || null
  }
  const row = mem.approval.get(key)
  return row ? { ...row } : null
}

export async function listApprovalRecords({ status, clientId, limit = 100 } = {}) {
  const bounded = Math.max(1, Math.min(200, Number(limit) || 100))
  if (mode === 'supabase') {
    const filters = []
    if (status) filters.push(`status=eq.${encodeURIComponent(status)}`)
    if (clientId) filters.push(`client_id=eq.${encodeURIComponent(clientId)}`)
    return rest('GET', `supermega_action_queue?order=created_at.desc&limit=${bounded}${filters.length ? `&${filters.join('&')}` : ''}`)
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const clauses = []
    const params = []
    if (status) { params.push(status); clauses.push(`status=$${params.length}`) }
    if (clientId) { params.push(clientId); clauses.push(`client_id=$${params.length}`) }
    params.push(bounded)
    return q(`select * from supermega_action_queue ${clauses.length ? `where ${clauses.join(' and ')}` : ''} order by created_at desc limit $${params.length}`, params)
  }
  let rows = [...mem.approval.values()]
  if (status) rows = rows.filter((row) => row.status === status)
  if (clientId) rows = rows.filter((row) => row.client_id === clientId)
  return memSort(rows.map((row) => ({ ...row }))).slice(0, bounded)
}

export async function transitionApprovalRecord(id, expectedStatus, expectedVersion, inputPatch = {}) {
  const key = String(id || '').trim()
  const version = Number(expectedVersion)
  if (!key || !expectedStatus || !Number.isInteger(version) || version < 0) return null
  const patch = {}
  for (const [name, value] of Object.entries(inputPatch)) {
    if (APPROVAL_PATCH_FIELDS.has(name)) patch[name] = value
  }
  patch.version = version + 1
  patch.updated_at = new Date().toISOString()
  if (mode === 'supabase') {
    const path = `supermega_action_queue?id=eq.${encodeURIComponent(key)}&status=eq.${encodeURIComponent(expectedStatus)}&version=eq.${version}`
    return (await rest('PATCH', path, patch))[0] || null
  }
  if (mode === 'postgres') {
    await ensurePgTables()
    const entries = Object.entries(patch)
    const set = entries.map(([name], index) => `${name}=$${index + 4}`).join(', ')
    const rows = await q(
      `update supermega_action_queue set ${set} where id=$1 and status=$2 and version=$3 returning *`,
      [key, expectedStatus, version, ...entries.map(([, value]) => value && typeof value === 'object' ? JSON.stringify(value) : value)],
    )
    return rows[0] || null
  }
  const current = mem.approval.get(key)
  if (!current || current.status !== expectedStatus || Number(current.version) !== version) return null
  const next = { ...current, ...patch }
  mem.approval.set(key, next)
  return { ...next }
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
    } catch {
      if (!warnedPaymentEventsTable) { warnedPaymentEventsTable = true; console.warn('[store] supermega_payment_events durable dedup failed — using per-instance dedup') }
    }
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

export default { mode, listLeads, getLead, insertLead, updateLead, markLeadWon, listClients, listProjects, createClient, getClient, createProject, updateProject, getProject, markDepositPaid, convertedLeadIds, saveDeal, listDeals, updateDeal, logActivity, claimActivity, releaseActivityClaim, getActivityClaim, transitionActivityClaim, listActivity, getTokenUsage, addTokenUsage, reserveAiBudget, getAiBudgetUsage, settleAiBudgetReservation, reserveTokenSpend, markTokenSpendDispatched, markTokenSpendIndeterminate, settleTokenSpend, releaseTokenSpend, reconcileTokenSpend, getResponseCache, putResponseCache, getControlRecord, putControlRecord, listControlRecords, transitionControlRecord, getCachedResponse, putCachedResponse, listCachedResponseRecords, transitionCachedResponse, createApprovalRecord, getApprovalRecord, listApprovalRecords, transitionApprovalRecord, recordPaymentEvent, ping, bumpGraduation, recordBuildModules, listGraduation }
