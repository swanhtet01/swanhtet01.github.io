const crypto = require('crypto')
const datastore = require('./lib/supermega-datastore')

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', process.env.SUPERMEGA_CONSOLE_URL || 'https://supermega.dev')
  res.end(JSON.stringify(payload))
}

function text(value) {
  return String(value || '').trim()
}

function envText(...names) {
  for (const name of names) {
    const value = text(process.env[name])
    if (value) return value
  }
  return ''
}

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function countFromRange(value) {
  const match = text(value).match(/\/(\d+)$/)
  return match ? Number(match[1]) : 0
}

async function supabaseFetch(path, options = {}) {
  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    return { status: 'not_configured' }
  }

  const response = await fetch(`${config.url}${path}`, {
    method: 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      accept: 'application/json',
      ...(options.count ? { Prefer: 'count=exact' } : {}),
    },
    signal: AbortSignal.timeout(Number(process.env.SUPERMEGA_COMMERCIAL_STATUS_TIMEOUT_MS || 10000)),
  })
  const body = await response.text().catch(() => '')
  if (!response.ok) {
    return {
      status: 'error',
      code: response.status,
      detail: body.slice(0, 180),
    }
  }
  let data = []
  try {
    data = body ? JSON.parse(body) : []
  } catch {
    data = []
  }
  return {
    status: 'ready',
    code: response.status,
    count: options.count ? countFromRange(response.headers.get('content-range')) : undefined,
    data,
  }
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function encodeFilter(value) {
  return encodeURIComponent(value)
}

function safeLead(row) {
  return {
    lead_id: row.lead_id || null,
    submitted_at: row.submitted_at || null,
    requested_package: row.requested_package || 'Workflow system',
    lead_score: Number(row.lead_score || 0),
    lead_stage: row.lead_stage || 'needs_context',
    status: row.status || 'routed',
    campaign: row.utm_campaign || 'direct',
    next_step: row.next_step || 'Review and reply with first workflow request.',
  }
}

function safeRun(row) {
  return {
    run_id: row.run_id || null,
    generated_at: row.generated_at || null,
    campaign: row.campaign || 'general-growth',
    status: row.status || 'ready',
    summary: row.summary || 'Send one messy workflow. Turn it into a first useful system.',
    metrics: row.metrics || {},
  }
}

const ownerControl = {
  owner: 'Swan Htet',
  control_level: 'owner_approved_autonomy',
  rule: 'Agents prepare and route work; the owner approves money, access, posting, writeback, and production changes.',
  owner_approves: [
    'pricing and proposal',
    'payment link activation',
    'client data connection',
    'workspace and account access',
    'external email or social sending',
    'client-system writeback',
    'production deploy or domain change',
  ],
  automated_now: [
    'lead capture and scoring',
    'lead and task ledger save',
    'email notification',
    'daily sales queue generation',
    'public route health checks',
    'public-safe machine status',
  ],
}

function onboardingPlan(latestLead) {
  return {
    public_entry: 'https://supermega.dev/contact',
    app_entry: 'https://app.supermega.dev/login',
    current_flow: 'one_request_to_reviewed_first_output',
    steps: [
      { step: 1, name: 'Lead captured', owner: 'system', control: 'automatic' },
      { step: 2, name: 'First source requested', owner: 'owner', control: 'owner_review' },
      { step: 3, name: 'Output and scope prepared', owner: 'agent', control: 'draft_only' },
      { step: 4, name: 'Price and approval boundary confirmed', owner: 'owner', control: 'manual_approval_required' },
      { step: 5, name: 'Workspace or connector opened', owner: 'owner and client', control: 'explicit_permission_required' },
    ],
    next_action: latestLead
      ? `Review ${latestLead.lead_id}, request one source if needed, then approve the first output scope.`
      : 'Capture the next request from /contact, then approve the first output scope.',
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', process.env.SUPERMEGA_CONSOLE_URL || 'https://supermega.dev')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    res.end()
    return
  }

  // Auth guard — always enforced; fail-closed (503 if key not configured)
  const opsKey = process.env.SUPERMEGA_OPS_KEY
  if (!opsKey) {
    json(res, 503, { status: 'error', reason: 'ops_key_not_configured' })
    return
  }
  const authHeader = req.headers['authorization'] || ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!safeEqual(provided, opsKey)) {
    json(res, 401, { status: 'error', reason: 'unauthorized' })
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  const config = supabaseConfig()
  if (datastore.postgresConfigured()) {
    const snapshot = await datastore.pipelineSnapshot({
      since24h: isoHoursAgo(24),
      since7d: isoHoursAgo(24 * 7),
    })
    // Fall through to Supabase if Postgres quota exceeded or table missing
    if (snapshot.status !== 'ready') {
      const isQuotaOrMissing = /quota|does not exist|relation/i.test(JSON.stringify(snapshot))
      if (!isQuotaOrMissing) {
        json(res, 200, {
          status: 'blocked',
          reason: 'vercel_postgres_query_failed',
          detail: snapshot,
          pc_dependency: 'none',
        })
        return
      }
      // Fall through to Supabase path below
    } else {

    const recentRuns = snapshot.latestRuns.map(safeRun)
    const recentLeads = snapshot.latestLeads.map(safeLead)
    const latestRun = recentRuns[0] || null
    const latestLead = recentLeads[0] || null
    const nextAction = latestLead
      ? `Review ${latestLead.lead_id} and send the first workflow reply.`
      : latestRun
        ? 'Send five founder-reviewed messages from the latest daily brief.'
        : 'Run the daily sales brief and capture the first lead.'

    json(res, 200, {
      status: 'ready',
      endpoint: 'commercial-control',
      pc_dependency: 'none',
      privacy: 'public_safe_no_names_emails_or_phone_numbers',
      generated_at: new Date().toISOString(),
      machine: {
        public_site: 'ready',
        lead_capture: 'ready',
        daily_sales_agent: 'ready',
        run_ledger: 'ready',
        primary_database: 'vercel_postgres_neon',
        email_delivery: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
        schedule: '09:00 Asia/Rangoon daily',
      },
      owner_control: ownerControl,
      onboarding: onboardingPlan(latestLead),
      leads: {
        last_24h: snapshot.lead24hCount,
        last_7d: snapshot.lead7dCount,
        recent: recentLeads,
      },
      sales_runs: {
        latest: latestRun,
        recent: recentRuns,
      },
      next_action: nextAction,
    })
    return
  } // end else (postgres success)
  } // end if (postgresConfigured)

  if (!config.url || !config.serviceRoleKey) {
    json(res, 200, {
      status: 'blocked',
      reason: 'supabase_not_configured',
      pc_dependency: 'none',
    })
    return
  }

  try {
    const since24h = encodeFilter(isoHoursAgo(24))
    const since7d = encodeFilter(isoHoursAgo(24 * 7))
    const [latestRuns, latestLeads, lead24h, lead7d] = await Promise.all([
      supabaseFetch('/rest/v1/supermega_sales_runs?select=run_id,generated_at,campaign,status,summary,metrics&order=generated_at.desc&limit=5'),
      supabaseFetch('/rest/v1/supermega_leads?select=lead_id,submitted_at,requested_package,lead_score,lead_stage,status,utm_campaign,next_step&order=submitted_at.desc&limit=5'),
      supabaseFetch(`/rest/v1/supermega_leads?select=lead_id&submitted_at=gte.${since24h}&limit=1`, { count: true }),
      supabaseFetch(`/rest/v1/supermega_leads?select=lead_id&submitted_at=gte.${since7d}&limit=1`, { count: true }),
    ])

    const blocked = [latestRuns, latestLeads, lead24h, lead7d].find((result) => result.status !== 'ready')
    if (blocked) {
      json(res, 200, {
        status: 'blocked',
        reason: 'supabase_query_failed',
        detail: blocked,
        pc_dependency: 'none',
      })
      return
    }

    const recentRuns = latestRuns.data.map(safeRun)
    const recentLeads = latestLeads.data.map(safeLead)
    const latestRun = recentRuns[0] || null
    const latestLead = recentLeads[0] || null
    const nextAction = latestLead
      ? `Review ${latestLead.lead_id} and send the first workflow reply.`
      : latestRun
        ? 'Send five founder-reviewed messages from the latest daily brief.'
        : 'Run the daily sales brief and capture the first lead.'

    json(res, 200, {
      status: 'ready',
      endpoint: 'commercial-control',
      pc_dependency: 'none',
      privacy: 'public_safe_no_names_emails_or_phone_numbers',
      generated_at: new Date().toISOString(),
      machine: {
        public_site: 'ready',
        lead_capture: 'ready',
        daily_sales_agent: 'ready',
        run_ledger: 'ready',
        email_delivery: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
        schedule: '09:00 Asia/Rangoon daily',
      },
      owner_control: ownerControl,
      onboarding: onboardingPlan(latestLead),
      leads: {
        last_24h: lead24h.count ?? 0,
        last_7d: lead7d.count ?? 0,
        recent: recentLeads,
      },
      sales_runs: {
        latest: latestRun,
        recent: recentRuns,
      },
      next_action: nextAction,
    })
  } catch (error) {
    json(res, 200, {
      status: 'blocked',
      reason: 'commercial_control_failed',
      detail: text(error?.message).slice(0, 180),
      pc_dependency: 'none',
    })
  }
}
