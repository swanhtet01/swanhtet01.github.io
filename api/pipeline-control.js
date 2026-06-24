const datastore = require('./lib/supermega-datastore')

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
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

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function safeLead(row) {
  return {
    lead_id: row.lead_id || null,
    task_id: row.task_id || null,
    submitted_at: row.submitted_at || null,
    requested_package: row.requested_package || 'Workflow system',
    lead_score: Number(row.lead_score || 0),
    lead_stage: row.lead_stage || 'needs_context',
    status: row.status || 'routed',
    next_step: row.next_step || 'Review and reply with first workflow request.',
  }
}

function safeAction(row) {
  return {
    action_id: row.action_id || null,
    lead_id: row.lead_id || null,
    task_id: row.task_id || null,
    action_type: row.action_type || 'lead_followup',
    status: row.status || 'open',
    priority: row.priority || 'medium',
    owner: row.owner || 'Revenue Pod',
    title: row.title || 'Follow up lead',
    next_step: row.next_step || 'Review and choose next action.',
    approval_required: row.approval_required !== false,
    approval_state: row.approval_state || 'pending',
    notification_channel: row.notification_channel || 'email',
    notification_status: row.notification_status || 'queued',
    created_at: row.created_at || null,
  }
}

function fallbackQueue() {
  const emailConfigured = Boolean(envText('RESEND_API_KEY'))
  const webhookConfigured = Boolean(envText('SUPERMEGA_LEAD_WEBHOOK_URL'))
  return {
    status: emailConfigured || webhookConfigured ? 'ready' : 'needs_configuration',
    mode: emailConfigured && webhookConfigured ? 'email_and_webhook' : emailConfigured ? 'email' : webhookConfigured ? 'webhook' : 'manual_email_link',
    email_delivery: emailConfigured ? 'configured' : 'not_configured',
    webhook_delivery: webhookConfigured ? 'configured' : 'not_configured',
    source_endpoint: '/api/contact-submissions',
    owner: envText('SUPERMEGA_CONTACT_NOTIFY_EMAIL') || 'swanhtet@supermega.dev',
    rule: 'Capture still works through email/webhook even when the primary database is quota-blocked.',
  }
}

function recommendedDatastores() {
  return [
    {
      id: 'restore-supabase',
      fit: 'fastest if current project is paid/unblocked',
      action: 'Resolve Supabase exceed_egress_quota or move the tables to a clean Supabase project, then reapply docs/supabase/*.sql.',
    },
    {
      id: 'vercel-postgres-neon',
      fit: 'best Vercel-native SQL replacement',
      action: 'Provision Neon Postgres through the Vercel Marketplace, set POSTGRES_URL or DATABASE_URL in supermega-public, then run npm run db:lead-ledger:schema.',
    },
    {
      id: 'upstash-redis-queue',
      fit: 'best lightweight durable queue for follow-up actions',
      action: 'Use Redis lists or streams for lead actions and keep email as the notification channel.',
    },
    {
      id: 'google-sheets-bridge',
      fit: 'best founder-operator fallback because it is easy to inspect and edit',
      action: 'Use a Google Sheet as the approval inbox while the SQL database is being restored.',
    },
  ]
}

function primaryDatabaseStatus(result) {
  if (!result || result.status === 'ready') {
    return { status: 'ready' }
  }
  const detail = text(result.detail)
  const quotaBlocked = result.code === 402 || /exceed_egress_quota|quota|restricted/i.test(detail)
  const provider = result.provider || result.adapter || 'supabase'
  return {
    status: 'blocked',
    provider,
    adapter: result.adapter || null,
    code: result.code || null,
    reason: provider === 'vercel_postgres_neon' ? 'vercel_postgres_query_failed' : quotaBlocked ? 'supabase_quota_or_project_restriction' : 'supabase_query_failed',
    detail: detail || text(result.reason),
  }
}

async function supabaseFetch(config, path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      accept: 'application/json',
      ...(options.count ? { Prefer: 'count=exact' } : {}),
    },
    signal: AbortSignal.timeout(Number(process.env.SUPERMEGA_PIPELINE_STATUS_TIMEOUT_MS || 10000)),
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    res.end()
    return
  }

  // Auth guard — ops key required
  const opsKey = process.env.SUPERMEGA_OPS_KEY
  const authHeader = req.headers['authorization'] || ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!opsKey || provided !== opsKey) {
    json(res, 401, { status: 'error', reason: 'unauthorized' })
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  const config = supabaseConfig()
  const contract = {
    required_tables: ['supermega_leads', 'supermega_pipeline_actions', 'supermega_sales_runs'],
    lead_capture: '/api/contact-submissions',
    pipeline_status: '/api/pipeline-control/status',
    daily_sales_cron: '/api/cron/sales-daily',
    primary_database: 'vercel_postgres_neon',
    fallback_database: 'supabase_rest',
    owner_rule: 'Agents prepare and queue work; the founder approves external sending, money, connector access, and production writes.',
    pc_dependency: 'none',
  }

  if (datastore.postgresConfigured()) {
    const since24h = isoHoursAgo(24)
    const since7d = isoHoursAgo(24 * 7)
    const snapshot = await datastore.pipelineSnapshot({ since24h, since7d })
    if (snapshot.status !== 'ready') {
      const fallback = fallbackQueue()
      json(res, 200, {
        status: 'ready',
        runtime_status: fallback.status === 'ready' ? 'degraded' : 'blocked',
        endpoint: 'pipeline-control',
        contract,
        primary_database: primaryDatabaseStatus(snapshot),
        fallback_queue: fallback,
        approval_inbox: {
          status: fallback.status === 'ready' ? 'email_fallback' : 'blocked',
          pending_count: null,
          next_action: {
            action_type: 'operator_review',
            priority: 'high',
            owner: fallback.owner,
            title: 'Fix Vercel Postgres pipeline schema or connection',
            next_step: 'Run npm run db:lead-ledger:schema with the Vercel/Neon DATABASE_URL, then redeploy public.',
            approval_required: true,
            approval_state: 'pending',
          },
        },
        notifications: {
          status: fallback.email_delivery,
          channel: fallback.mode,
          human_review_required: true,
        },
        durable_queue: {
          status: fallback.status === 'ready' ? 'degraded_ready' : 'blocked',
          public_daily_cron: '/api/cron/sales-daily',
          app_daily_cron: '/api/cron/supermega/daily',
          fallback_mode: fallback.mode,
          protected_by_bearer_token: true,
        },
        recommended_datastores: recommendedDatastores(),
        blocker: snapshot,
      })
      return
    }

    const actions = snapshot.latestActions.map(safeAction)
    const leads = snapshot.latestLeads.map(safeLead)
    const nextAction = actions.find((action) => action.approval_state === 'pending') || actions[0] || null

    json(res, 200, {
      status: 'ready',
      runtime_status: 'ready',
      endpoint: 'pipeline-control',
      generated_at: new Date().toISOString(),
      contract,
      primary_database: {
        status: 'ready',
        provider: 'vercel_postgres_neon',
        adapter: 'pg',
      },
      metrics: {
        leads_24h: snapshot.lead24hCount,
        leads_7d: snapshot.lead7dCount,
        open_action_count: snapshot.pendingActionCount,
        recent_action_count: actions.length,
        recent_lead_count: leads.length,
        recent_sales_run_count: snapshot.latestRuns.length,
      },
      approval_inbox: {
        status: 'ready',
        pending_count: snapshot.pendingActionCount,
        next_action: nextAction,
      },
      notifications: {
        status: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
        channel: 'email',
        human_review_required: true,
      },
      fallback_queue: fallbackQueue(),
      durable_queue: {
        status: 'ready',
        public_daily_cron: '/api/cron/sales-daily',
        app_daily_cron: '/api/cron/supermega/daily',
        protected_by_bearer_token: true,
      },
      recent_leads: leads,
      recent_actions: actions,
      recent_sales_runs: snapshot.latestRuns,
    })
    return
  }

  if (!config.url || !config.serviceRoleKey) {
    json(res, 200, {
      status: 'ready',
      runtime_status: 'not_configured',
      endpoint: 'pipeline-control',
      contract,
      primary_database: datastore.datastoreStatus(),
      fallback_queue: fallbackQueue(),
      recommended_datastores: recommendedDatastores(),
      blockers: ['Provision Neon Postgres in the Vercel Marketplace, set POSTGRES_URL or DATABASE_URL, then run npm run db:lead-ledger:schema.'],
    })
    return
  }

  try {
    const since24h = encodeURIComponent(isoHoursAgo(24))
    const since7d = encodeURIComponent(isoHoursAgo(24 * 7))
    const [latestLeads, latestActions, pendingActions, lead24h, lead7d, latestRuns] = await Promise.all([
      supabaseFetch(config, '/rest/v1/supermega_leads?select=lead_id,task_id,submitted_at,requested_package,lead_score,lead_stage,status,next_step&order=submitted_at.desc&limit=5'),
      supabaseFetch(config, '/rest/v1/supermega_pipeline_actions?select=action_id,lead_id,task_id,action_type,status,priority,owner,title,next_step,approval_required,approval_state,notification_channel,notification_status,created_at&order=created_at.desc&limit=8'),
      supabaseFetch(config, '/rest/v1/supermega_pipeline_actions?select=action_id&status=neq.done&limit=1', { count: true }),
      supabaseFetch(config, `/rest/v1/supermega_leads?select=lead_id&submitted_at=gte.${since24h}&limit=1`, { count: true }),
      supabaseFetch(config, `/rest/v1/supermega_leads?select=lead_id&submitted_at=gte.${since7d}&limit=1`, { count: true }),
      supabaseFetch(config, '/rest/v1/supermega_sales_runs?select=run_id,generated_at,status,summary&order=generated_at.desc&limit=3'),
    ])

    const blocked = [latestLeads, latestActions, pendingActions, lead24h, lead7d, latestRuns].find((result) => result.status !== 'ready')
    if (blocked) {
      const fallbackDatabase = primaryDatabaseStatus(blocked)
      const fallback = fallbackQueue()
      json(res, 200, {
        status: 'ready',
        runtime_status: fallback.status === 'ready' ? 'degraded' : 'blocked',
        endpoint: 'pipeline-control',
        contract,
        primary_database: datastore.datastoreStatus(),
        fallback_database: fallbackDatabase,
        fallback_queue: fallback,
        approval_inbox: {
          status: fallback.status === 'ready' ? 'email_fallback' : 'blocked',
          pending_count: null,
          next_action: {
            action_type: 'operator_review',
            priority: 'high',
            owner: fallback.owner,
            title: 'Review inbound lead emails while primary database is blocked',
            next_step: 'Provision Vercel Postgres/Neon for the primary ledger; use email fallback until the schema is applied.',
            approval_required: true,
            approval_state: 'pending',
          },
        },
        notifications: {
          status: fallback.email_delivery,
          channel: fallback.mode,
          human_review_required: true,
        },
        durable_queue: {
          status: fallback.status === 'ready' ? 'degraded_ready' : 'blocked',
          public_daily_cron: '/api/cron/sales-daily',
          app_daily_cron: '/api/cron/supermega/daily',
          fallback_mode: fallback.mode,
          protected_by_bearer_token: true,
        },
        recommended_datastores: recommendedDatastores(),
        blocker: blocked,
      })
      return
    }

    const actions = latestActions.data.map(safeAction)
    const leads = latestLeads.data.map(safeLead)
    const nextAction = actions.find((action) => action.approval_state === 'pending') || actions[0] || null

    json(res, 200, {
      status: 'ready',
      runtime_status: 'ready',
      endpoint: 'pipeline-control',
      generated_at: new Date().toISOString(),
      contract,
      metrics: {
        leads_24h: lead24h.count ?? 0,
        leads_7d: lead7d.count ?? 0,
        open_action_count: pendingActions.count ?? 0,
        recent_action_count: actions.length,
        recent_lead_count: leads.length,
        recent_sales_run_count: latestRuns.data.length,
      },
      approval_inbox: {
        status: 'ready',
        pending_count: pendingActions.count ?? 0,
        next_action: nextAction,
      },
      notifications: {
        status: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
        channel: 'email',
        human_review_required: true,
      },
      fallback_queue: fallbackQueue(),
      durable_queue: {
        status: 'ready',
        public_daily_cron: '/api/cron/sales-daily',
        app_daily_cron: '/api/cron/supermega/daily',
        protected_by_bearer_token: true,
      },
      recent_leads: leads,
      recent_actions: actions,
      recent_sales_runs: latestRuns.data,
    })
  } catch (error) {
    json(res, 200, {
      status: 'ready',
      runtime_status: 'blocked',
      endpoint: 'pipeline-control',
      contract,
      fallback_queue: fallbackQueue(),
      recommended_datastores: recommendedDatastores(),
      reason: 'pipeline_control_failed',
      detail: text(error?.message).slice(0, 180),
    })
  }
}
