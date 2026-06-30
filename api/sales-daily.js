const crypto = require('crypto')
const datastore = require('./lib/supermega-datastore')
const blobQueue = require('./lib/supermega-blob-queue')

const defaultNotifyEmail = 'swanhtet@supermega.dev'
const defaultFrom = 'SuperMega Owner Brief <onboarding@supermega.dev>'
const defaultBaseUrl = 'https://supermega.dev'

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
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

function envFlag(name, fallback = false) {
  const value = text(process.env[name]).toLowerCase()
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value)
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Rangoon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    weekday: map.weekday,
  }
}

function pickByCycle(items, seed) {
  if (!items.length) return null
  return items[Math.abs(seed) % items.length]
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function expectedSecret() {
  return envText('CRON_SECRET', 'SUPERMEGA_INTERNAL_CRON_TOKEN')
}

function expectedSecrets() {
  return [envText('CRON_SECRET'), envText('SUPERMEGA_INTERNAL_CRON_TOKEN')].filter(Boolean)
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function isAuthorized(req) {
  const secrets = expectedSecrets()
  if (!secrets.length) return false
  const provided = text(req.headers.authorization).startsWith('Bearer ')
    ? text(req.headers.authorization).slice(7)
    : text(req.headers.authorization)
  return secrets.some((secret) => safeEqual(provided, secret))
}

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function buildPlan(now = new Date()) {
  const local = localDateParts(now)
  const seed = Number(local.date.replaceAll('-', ''))
  const contactUrl = `${envText('SUPERMEGA_PUBLIC_BASE_URL') || defaultBaseUrl}/contact`
  const segments = [
    {
      id: 'owner-led-distributors',
      name: 'Owner-led distributors',
      first_workflow: 'Quote and delivery follow-up desk',
      search: 'Myanmar distributors import export dealers spreadsheet follow up',
    },
    {
      id: 'factories-warehouses',
      name: 'Factories and warehouses',
      first_workflow: 'Operations exception desk',
      search: 'Myanmar factory warehouse QC maintenance receiving manager',
    },
    {
      id: 'service-groups',
      name: 'Multi-location service businesses',
      first_workflow: 'Manager follow-up desk',
      search: 'Myanmar multi branch service business operations manager',
    },
    {
      id: 'clinics-education',
      name: 'Clinics and education teams',
      first_workflow: 'Intake and document desk',
      search: 'Myanmar clinic school education documents forms workflow',
    },
    {
      id: 'construction-property',
      name: 'Construction and property teams',
      first_workflow: 'Site request desk',
      search: 'Myanmar construction property site requests approvals contractor',
    },
  ]
  const posts = [
    {
      channel: 'LinkedIn',
      hook: 'Most companies do not need another dashboard first.',
      body: 'They need one repeated workflow to become clear: owner, file, status, next action.',
    },
    {
      channel: 'Facebook',
      hook: 'If managers ask for updates every day, the system is missing.',
      body: 'Start with one shared work screen for the workflow everyone keeps chasing.',
    },
    {
      channel: 'LinkedIn',
      hook: 'The best first AI project is not a chatbot.',
      body: 'It is one painful workflow where AI can prepare work and a human can approve the next action.',
    },
    {
      channel: 'LinkedIn',
      hook: 'Start smaller than a platform.',
      body: 'One team. One workflow. One useful screen. Then expand only where the team feels value.',
    },
  ]
  const segment = pickByCycle(segments, seed)
  const post = pickByCycle(posts, seed + 2)
  const outreach = [
    {
      channel: 'Email',
      subject: `${segment.first_workflow} for your team`,
      message: `Hi {{name}}, what is one workflow your team still chases in chat, Excel, email, Drive, or paper every week? If you send one current sample, I can map the first useful screen before proposing anything bigger.`,
    },
    {
      channel: 'LinkedIn DM',
      subject: 'One workflow question',
      message: 'Quick question: what is one workflow your team keeps chasing manually every week?',
    },
    {
      channel: 'WhatsApp',
      subject: 'Workflow sample request',
      message: 'If you send one screenshot, sheet, or file, I can show what the first useful system should look like.',
    },
  ]
  const actions = [
    {
      lane: 'review',
      action: 'Check the live control board',
      output: 'Open /app/revenue/pipeline and close or advance every lead older than 24 hours.',
    },
    {
      lane: 'research',
      action: `Pick 3 specific buyer accounts: ${segment.search}`,
      output: 'Company, owner/manager role, visible workflow pain, proof source to request, and one reason now.',
    },
    {
      lane: 'outreach',
      action: 'Send only founder-approved messages',
      output: 'Use one edited message only after you can name the workflow, source sample, and first screen.',
    },
    {
      lane: 'content',
      action: `Draft or publish: ${post.hook}`,
      output: `${post.body} ${contactUrl}`,
    },
    {
      lane: 'proof',
      action: 'Capture one proof asset that can sell',
      output: 'One screenshot, 60-second walkthrough, before/after workflow map, objection answer, or client-ready sample.',
    },
  ]
  return {
    run_id: `SALESRUN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    status: 'ready',
    run_type: 'sales_daily',
    generated_at: now.toISOString(),
    local_date: local.date,
    local_weekday: local.weekday,
    timezone: 'Asia/Rangoon',
    campaign: 'general-growth',
    core_pitch: 'One messy workflow becomes one usable SuperMega work screen.',
    contact_url: contactUrl,
    selected_segment: segment,
    post,
    outreach,
    actions,
    metrics: {
      action_count: actions.length,
      outreach_draft_count: outreach.length,
      target_account_count: 5,
      manual_review_required: true,
    },
    next_action: 'Open the pipeline, pick three real accounts, and only send reviewed messages tied to one workflow sample.',
  }
}

function normalizeKey(value, fallback = 'lead') {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function offerForLead(lead = {}) {
  const context = `${lead.requested_package || ''} ${lead.lead_stage || ''} ${lead.next_step || ''} ${lead.status || ''}`.toLowerCase()
  if (/factory|plant|quality|maintenance|receiving|meter|sensor|asset|operations/.test(context)) {
    return {
      package: 'Factory Operations App',
      first_output: 'One plant screen with issue, source, owner, evidence, and next action.',
      price_band: 'Scope first; build starts only after source, access, and approval boundary are confirmed.',
      source_request: 'Ask for one current issue list, receiving log, maintenance note, QC file, or manager screenshot.',
    }
  }
  if (/restaurant|pos|store|menu|cash|payment|stock|daily close|counter/.test(context)) {
    return {
      package: 'Restaurant POS App',
      first_output: 'One branch screen for daily close, payment proof, stock notes, and owner review.',
      price_band: 'Scope first; build starts only after source, access, and approval boundary are confirmed.',
      source_request: 'Ask for one menu file, daily close sheet, payment proof sample, or stock note.',
    }
  }
  return {
    package: 'Custom Workflow App',
    first_output: 'One workflow screen with source, proof, owner, status, review, and next action.',
    price_band: 'Scope first; build starts only after source, access, and approval boundary are confirmed.',
    source_request: 'Ask for one file, screenshot, sheet, folder, email thread, export, or repeated task sample.',
  }
}

function leadAutopilotActions(lead = {}) {
  const leadId = text(lead.lead_id) || text(lead.task_id) || `LEAD-${normalizeKey(lead.requested_package)}`
  const taskId = text(lead.task_id) || leadId
  const key = normalizeKey(leadId)
  const offer = offerForLead(lead)
  const submittedAt = lead.submitted_at ? new Date(lead.submitted_at) : new Date()
  const dueAt = new Date(Math.max(Date.now(), submittedAt.getTime()) + 18 * 60 * 60 * 1000).toISOString()
  const basePayload = {
    lead_id: leadId,
    task_id: taskId,
    run_id: null,
    status: 'queued',
    owner: envText('SUPERMEGA_SALES_NOTIFY_EMAIL', 'SUPERMEGA_CONTACT_NOTIFY_EMAIL') || defaultNotifyEmail,
    due_at: dueAt,
    evidence_url: '',
    source_url: '',
    approval_required: true,
    approval_state: 'pending',
    notification_channel: 'internal_queue',
    notification_status: 'queued',
    payload: {
      lead,
      offer,
      policy: 'draft_only_no_external_send_no_payment_no_connector_without_owner_approval',
      prepared_by: 'sales_daily_autopilot',
    },
  }
  return [
    {
      ...basePayload,
      action_id: `AUTO-${key}-source`,
      action_type: 'source_request',
      priority: Number(lead.lead_score || 0) >= 75 ? 'high' : 'medium',
      title: `Ask for source: ${offer.package}`,
      next_step: offer.source_request,
    },
    {
      ...basePayload,
      action_id: `AUTO-${key}-packet`,
      action_type: 'offer_packet',
      priority: Number(lead.lead_score || 0) >= 75 ? 'high' : 'medium',
      title: `Prepare offer packet: ${offer.package}`,
      next_step: `${offer.first_output} Include price band, access boundary, first screen, and approval gate.`,
    },
    {
      ...basePayload,
      action_id: `AUTO-${key}-reply`,
      action_type: 'reply_draft',
      priority: 'medium',
      title: `Draft reply: ${offer.package}`,
      next_step: `Draft a short reply: confirm the workflow, request the source sample, explain ${offer.first_output}, and state that no account, data connection, or charge happens before approval.`,
    },
  ]
}

async function prepareLeadAutopilot(run) {
  if (!datastore.postgresConfigured()) {
    return prepareBlobLeadAutopilot(run, { status: 'skipped', reason: 'postgres_not_configured' })
  }

  const snapshot = await datastore.pipelineSnapshot({
    since24h: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    since7d: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (snapshot.status !== 'ready') {
    return prepareBlobLeadAutopilot(run, {
      status: 'error',
      reason: 'pipeline_snapshot_failed',
      detail: snapshot.detail || snapshot.reason || snapshot.code || null,
      code: snapshot.code || null,
      provider: snapshot.provider || snapshot.adapter || 'vercel_postgres_neon',
    })
  }

  const leads = (snapshot.latestLeads || []).slice(0, 5)
  const prepared = []
  for (const lead of leads) {
    for (const action of leadAutopilotActions(lead)) {
      const result = await datastore.savePipelineAction({ ...action, run_id: run.run_id })
      const finalResult = result.status === 'ready' ? result : await blobQueue.savePipelineAction({ ...action, run_id: run.run_id })
      prepared.push({
        action_id: action.action_id,
        lead_id: action.lead_id,
        action_type: action.action_type,
        status: finalResult.status,
        adapter: finalResult.adapter,
        reason: finalResult.reason || finalResult.detail || result.reason || result.detail || null,
      })
    }
  }

  return {
    status: prepared.every((item) => item.status === 'ready') ? 'ready' : 'partial',
    lead_count: leads.length,
    action_count: prepared.filter((item) => item.status === 'ready').length,
    prepared,
    approval_required: true,
    external_send: 'blocked_until_owner_approval',
  }
}

function fallbackLeadForRun(run) {
  const segment = run.selected_segment || {}
  return {
    lead_id: `SALES-${run.run_id}`,
    task_id: `TASK-${run.run_id}`,
    submitted_at: run.generated_at,
    name: 'Owner pipeline',
    company: text(segment.name) || 'Target buyer segment',
    workflow: text(segment.first_workflow) || 'Owner-approved first proof workflow',
    requested_package: text(segment.first_workflow) || 'Custom Solutions & AI Agents',
    goal: `Find and qualify real accounts for ${text(segment.name) || 'the selected buyer segment'}.`,
    lead_score: 82,
    lead_stage: 'owner_research_required',
    status: 'queued',
    next_step: `Pick three real accounts for: ${text(segment.search) || 'Myanmar buyer research'}. Request one approved source sample before any external send.`,
  }
}

async function prepareBlobLeadAutopilot(run, primaryError = {}) {
  const lead = fallbackLeadForRun(run)
  const prepared = []
  for (const action of leadAutopilotActions(lead)) {
    const result = await blobQueue.savePipelineAction({
      ...action,
      run_id: run.run_id,
      notification_channel: 'blob_queue',
      payload: {
        ...action.payload,
        run,
        primary_database: primaryError,
        fallback_reason: 'sql_pipeline_unavailable',
      },
    })
    prepared.push({
      action_id: action.action_id,
      lead_id: action.lead_id,
      action_type: action.action_type,
      status: result.status,
      adapter: result.adapter,
      reason: result.reason || result.detail || null,
    })
  }
  return {
    status: prepared.some((item) => item.status === 'ready') ? (prepared.every((item) => item.status === 'ready') ? 'ready' : 'partial') : 'error',
    adapter: 'vercel_blob',
    primary_error: primaryError,
    lead_count: 1,
    action_count: prepared.filter((item) => item.status === 'ready').length,
    prepared,
    approval_required: true,
    external_send: 'blocked_until_owner_approval',
    payment_or_connector_access: 'blocked_until_owner_approval',
  }
}

async function saveRun(run) {
  if (datastore.postgresConfigured()) {
    const result = await datastore.saveSalesRun({
      run_id: run.run_id,
      run_type: run.run_type,
      campaign: run.campaign,
      status: run.status,
      summary: run.core_pitch,
      metrics: run.metrics,
      payload: run,
      generated_at: run.generated_at,
    })
    if (result.status === 'ready') {
      return { status: 'ready', code: 200, table: result.table, adapter: result.adapter }
    }
    // Fall through to Supabase if Postgres quota exceeded or tables missing
    const isQuotaOrMissing = /quota|does not exist|relation/i.test(JSON.stringify(result))
    if (!isQuotaOrMissing) {
      return {
        status: 'error',
        reason: 'vercel_postgres_sales_run_write_failed',
        table: 'supermega_sales_runs',
        adapter: 'vercel_postgres_neon',
        detail: result.detail || result.reason || result.code || null,
      }
    }
  }

  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    return blobQueue.saveSalesRun(run)
  }

  const response = await fetch(`${config.url}/rest/v1/supermega_sales_runs`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      run_id: run.run_id,
      run_type: run.run_type,
      campaign: run.campaign,
      status: run.status,
      summary: run.core_pitch,
      metrics: run.metrics,
      payload: run,
      generated_at: run.generated_at,
    }),
  })

  if (response.ok) {
    return { status: 'ready', code: response.status, table: 'supermega_sales_runs' }
  }

  const body = await response.text().catch(() => '')
  const blobFallback = await blobQueue.saveSalesRun(run)
  if (blobFallback.status === 'ready') {
    return { ...blobFallback, primary_error: { status: 'error', reason: `supabase_${response.status}`, detail: body.slice(0, 180) } }
  }
  return {
    status: 'error',
    reason: `supabase_${response.status}`,
    table: 'supermega_sales_runs',
    hint: 'run_supermega_sales_runs_schema',
    detail: body.slice(0, 300),
  }
}

async function checkSalesRunLedger() {
  if (datastore.postgresConfigured()) {
    const result = await datastore.latestSalesRun()
    if (result.status === 'ready') {
      const latest = result.rows?.[0] || null
      return {
        status: 'ready',
        table: 'supermega_sales_runs',
        adapter: 'vercel_postgres_neon',
        latest_run_id: latest?.run_id || null,
        latest_generated_at: latest?.generated_at || null,
      }
    }
    const blobFallback = await blobQueue.latestSalesRun()
    if (blobFallback.status === 'ready') {
      const latest = blobFallback.rows?.[0] || null
      return {
        status: 'ready',
        table: 'supermega_sales_runs',
        adapter: 'vercel_blob',
        latest_run_id: latest?.run_id || null,
        latest_generated_at: latest?.generated_at || null,
        primary_error: {
          status: 'error',
          reason: 'vercel_postgres_sales_run_probe_failed',
          detail: result.detail || result.reason || result.code || null,
        },
      }
    }
    return {
      status: 'error',
      reason: 'vercel_postgres_sales_run_probe_failed',
      table: 'supermega_sales_runs',
      adapter: 'vercel_postgres_neon',
      detail: result.detail || result.reason || result.code || null,
    }
  }

  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    const blobFallback = await blobQueue.latestSalesRun()
    if (blobFallback.status === 'ready') {
      const latest = blobFallback.rows?.[0] || null
      return {
        status: 'ready',
        table: 'supermega_sales_runs',
        adapter: 'vercel_blob',
        latest_run_id: latest?.run_id || null,
        latest_generated_at: latest?.generated_at || null,
      }
    }
    return { status: 'not_configured', table: 'supermega_sales_runs' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${config.url}/rest/v1/supermega_sales_runs?select=run_id,generated_at&order=generated_at.desc&limit=1`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    const body = await response.text().catch(() => '')
    if (response.ok) {
      let rows = []
      try {
        rows = body ? JSON.parse(body) : []
      } catch {
        rows = []
      }
      return {
        status: 'ready',
        table: 'supermega_sales_runs',
        latest_run_id: rows[0]?.run_id || null,
        latest_generated_at: rows[0]?.generated_at || null,
      }
    }
    const blobFallback = await blobQueue.latestSalesRun()
    if (blobFallback.status === 'ready') {
      const latest = blobFallback.rows?.[0] || null
      return {
        status: 'ready',
        table: 'supermega_sales_runs',
        adapter: 'vercel_blob',
        latest_run_id: latest?.run_id || null,
        latest_generated_at: latest?.generated_at || null,
        primary_error: { status: 'error', reason: `supabase_${response.status}`, detail: body.slice(0, 180) },
      }
    }
    return {
      status: 'error',
      reason: `supabase_${response.status}`,
      table: 'supermega_sales_runs',
      hint: 'apply_docs_supabase_supermega_sales_runs_sql',
      detail: body.slice(0, 180),
    }
  } catch (error) {
    const blobFallback = await blobQueue.latestSalesRun()
    if (blobFallback.status === 'ready') {
      const latest = blobFallback.rows?.[0] || null
      return {
        status: 'ready',
        table: 'supermega_sales_runs',
        adapter: 'vercel_blob',
        latest_run_id: latest?.run_id || null,
        latest_generated_at: latest?.generated_at || null,
        primary_error: { status: 'error', reason: error?.name === 'AbortError' ? 'ledger_probe_timeout' : 'ledger_probe_failed', detail: text(error?.message).slice(0, 180) },
      }
    }
    return {
      status: 'error',
      reason: error?.name === 'AbortError' ? 'ledger_probe_timeout' : 'ledger_probe_failed',
      table: 'supermega_sales_runs',
      detail: text(error?.message).slice(0, 180),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function emailHtml(run) {
  const actions = run.actions
    .map((item) => `<li><strong>${escapeHtml(item.action)}</strong><br/><span>${escapeHtml(item.output)}</span></li>`)
    .join('')
  const outreach = run.outreach
    .map((item) => `<li><strong>${escapeHtml(item.channel)}: ${escapeHtml(item.subject)}</strong><br/><span>${escapeHtml(item.message)}</span></li>`)
    .join('')
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#0f766e;font-weight:800">SuperMega owner brief</p>
      <h2 style="margin:0 0 8px">What needs a decision today</h2>
      <p style="margin:0 0 16px;color:#475569">${escapeHtml(run.local_date)} (${escapeHtml(run.timezone)}) · ${escapeHtml(run.run_id)}</p>
      <div style="padding:14px 16px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;margin:0 0 16px">
        <p style="margin:0"><strong>Focus:</strong> ${escapeHtml(run.selected_segment.name)} · ${escapeHtml(run.selected_segment.first_workflow)}</p>
        <p style="margin:6px 0 0"><strong>Promise:</strong> ${escapeHtml(run.core_pitch)}</p>
      </div>
      <h3>Owner actions</h3>
      <ol>${actions}</ol>
      <h3>Draft post</h3>
      <p><strong>${escapeHtml(run.post.channel)}:</strong> ${escapeHtml(run.post.hook)}</p>
      <p>${escapeHtml(run.post.body)} <a href="${escapeHtml(run.contact_url)}">${escapeHtml(run.contact_url)}</a></p>
      <h3>Draft messages</h3>
      <ul>${outreach}</ul>
      <p style="padding:12px 14px;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa"><strong>Rule:</strong> Do not auto-send. Edit manually, then log posted URLs, replies, promised samples, and next action.</p>
    </div>
  `
}

async function sendBrief(run) {
  if (!envFlag('SUPERMEGA_SALES_DAILY_EMAIL_ENABLED', false)) {
    return { status: 'skipped', reason: 'sales_daily_email_disabled_by_default' }
  }

  const apiKey = envText('RESEND_API_KEY')
  if (!apiKey) {
    return { status: 'skipped', reason: 'resend_not_configured' }
  }
  const notifyEmail = envText('SUPERMEGA_SALES_NOTIFY_EMAIL', 'SUPERMEGA_CONTACT_NOTIFY_EMAIL') || defaultNotifyEmail
  const from = envText('SUPERMEGA_RESEND_FROM') || defaultFrom
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [notifyEmail],
      subject: `SuperMega owner brief - ${run.local_date}`,
      html: emailHtml(run),
    }),
    signal: AbortSignal.timeout(8000),
  })
  const body = await response.text().catch(() => '')
  if (response.ok) {
    let parsed = {}
    try {
      parsed = body ? JSON.parse(body) : {}
    } catch {
      parsed = {}
    }
    return { status: 'ready', email_id: text(parsed.id), to: notifyEmail }
  }
  return { status: 'error', reason: `resend_${response.status}`, to: notifyEmail, detail: body.slice(0, 300) }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/api/cron/sales-daily', defaultBaseUrl)

  if (!isAuthorized(req)) {
    json(res, expectedSecret() ? 401 : 503, {
      status: 'error',
      reason: expectedSecret() ? 'unauthorized' : 'cron_secret_not_configured',
      endpoint: 'sales-daily',
    })
    return
  }

  if (url.pathname.endsWith('/status')) {
    const config = supabaseConfig()
    const salesRunLedger = await checkSalesRunLedger()
    json(res, 200, {
      status: 'ready',
      endpoint: 'sales-daily',
      schedule: '30 2 * * *',
      local_schedule: '09:00 Asia/Rangoon daily',
      pc_dependency: 'none',
      requires_authorization: true,
      cron_secret_configured: expectedSecrets().length > 0,
      lead_ledger: config.url && config.serviceRoleKey ? 'configured' : 'not_configured',
      sales_run_ledger: salesRunLedger,
      sales_autopilot: {
        status: salesRunLedger.status === 'ready' ? 'ready' : 'needs_database',
        queue_adapter: salesRunLedger.adapter || 'vercel_postgres_neon',
        prepares: ['source_request', 'offer_packet', 'reply_draft'],
        external_send: 'blocked_until_owner_approval',
        payment_or_connector_access: 'blocked_until_owner_approval',
      },
      email_delivery: envText('RESEND_API_KEY') ? 'configured' : 'not_configured',
      email_enabled: envFlag('SUPERMEGA_SALES_DAILY_EMAIL_ENABLED', false),
      email_required: envFlag('SUPERMEGA_SALES_DAILY_EMAIL_ENABLED', false) && text(process.env.SUPERMEGA_REQUIRE_SALES_DAILY_EMAIL) === '1',
    })
    return
  }

  if (!['GET', 'POST'].includes(req.method)) {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  const dryRun = url.searchParams.get('dry_run') === '1'
  const run = buildPlan(new Date())
  const ledger = dryRun ? { status: 'skipped', reason: 'dry_run' } : await saveRun(run)
  const autopilot = dryRun ? { status: 'skipped', reason: 'dry_run', action_count: 0 } : await prepareLeadAutopilot(run)
  const delivery = dryRun ? { status: 'skipped', reason: 'dry_run' } : await sendBrief(run)
  const requireLedger = text(process.env.SUPERMEGA_REQUIRE_SALES_RUN_LEDGER) === '1'
  const emailEnabled = envFlag('SUPERMEGA_SALES_DAILY_EMAIL_ENABLED', false)
  const requireDelivery = emailEnabled && text(process.env.SUPERMEGA_REQUIRE_SALES_DAILY_EMAIL) === '1'

  if ((requireLedger && ledger.status !== 'ready') || (requireDelivery && delivery.status !== 'ready')) {
    json(res, 502, {
      status: 'blocked',
      run,
      ledger,
      autopilot,
      delivery,
      pc_dependency: 'none',
    })
    return
  }

  json(res, 200, {
    status: 'ready',
    run,
    ledger,
    autopilot,
    delivery,
    dry_run: dryRun,
    pc_dependency: 'none',
  })
}
