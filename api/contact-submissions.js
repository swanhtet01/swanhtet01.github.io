const crypto = require('crypto')
const datastore = require('./lib/supermega-datastore')
const { notifyTelegram: sendTelegram } = require('./lib/notify-telegram')

const notifyEmail = process.env.SUPERMEGA_CONTACT_NOTIFY_EMAIL || 'swanhtet@supermega.dev'
const fallbackFrom = 'SUPERMEGA <onboarding@resend.dev>'
const defaultAllowedOrigins = 'https://supermega.dev,https://www.supermega.dev'
const rateLimitWindowMs = Number(process.env.SUPERMEGA_CONTACT_RATE_WINDOW_MS || 15 * 60 * 1000)
const rateLimitMax = Number(process.env.SUPERMEGA_CONTACT_RATE_MAX || 8)
const rateStore = globalThis.__supermegaContactRateStore || new Map()
globalThis.__supermegaContactRateStore = rateStore

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function html(res, statusCode, title, message) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)} | SUPERMEGA.dev</title>
<style>
  :root { color-scheme: dark; font-family: Aptos, "Segoe UI", system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 80% 12%, rgba(114,243,255,.18), transparent 28rem), linear-gradient(135deg, #07111f, #02050b); color: #f6fbff; }
  main { width: min(560px, calc(100% - 32px)); border: 1px solid rgba(255,255,255,.16); border-radius: 28px; background: rgba(255,255,255,.07); padding: clamp(24px, 5vw, 42px); box-shadow: 0 34px 90px rgba(0,0,0,.34); }
  h1 { margin: 0 0 14px; font-size: clamp(38px, 7vw, 70px); line-height: .86; letter-spacing: -.07em; }
  p { margin: 0; color: #a9b8c7; font-size: 18px; line-height: 1.55; }
  a { display: inline-flex; margin-top: 24px; border-radius: 999px; background: linear-gradient(135deg, #72f3ff, #4f8cff); color: #06101d; padding: 13px 18px; font-weight: 900; text-decoration: none; }
</style>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <a href="/#contact">Back to SUPERMEGA.dev</a>
</main>
</html>`)
}

function receiptHtml(res, record) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  const onboarding = onboardingPlan(record)
  const subject = encodeURIComponent(`SuperMega source files for ${record.lead_id}`)
  const body = encodeURIComponent(`Lead: ${record.lead_id}\nTask: ${record.task_id}\nCompany: ${record.company}\n\nSource links / notes:\n`)
  res.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Request Received | SUPERMEGA.dev</title>
<style>
  :root { color-scheme: dark; font-family: Aptos, "Segoe UI", system-ui, sans-serif; --bg:#07111f; --line:rgba(255,255,255,.16); --text:#f6fbff; --muted:#a9b8c7; --cyan:#72f3ff; --green:#8cf0b8; --ink:#06101d; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 78% 8%, rgba(114,243,255,.18), transparent 28rem), linear-gradient(135deg, #07111f, #02050b); color: var(--text); }
  main { width: min(760px, calc(100% - 32px)); border: 1px solid var(--line); border-radius: 18px; background: rgba(255,255,255,.07); padding: clamp(24px, 5vw, 42px); box-shadow: 0 34px 90px rgba(0,0,0,.34); }
  h1 { margin: 0 0 14px; font-size: clamp(42px, 8vw, 82px); line-height: .86; letter-spacing: -.075em; }
  p { margin: 0; color: var(--muted); font-size: 18px; line-height: 1.55; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 24px 0; }
  .box { border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 13px; background: rgba(3,8,16,.36); }
  .box span { display:block; color: var(--green); font-size: 11px; font-weight: 950; letter-spacing: .14em; text-transform: uppercase; }
  .box strong { display:block; margin-top: 5px; overflow-wrap: anywhere; }
  ol { margin: 0 0 24px; padding-left: 22px; color: var(--text); font-size: 17px; line-height: 1.55; }
  li + li { margin-top: 8px; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; }
  a { display: inline-flex; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; color: var(--text); padding: 13px 18px; font-weight: 900; text-decoration: none; }
  a.primary { background: linear-gradient(135deg, var(--cyan), #4f8cff); color: var(--ink); border-color: transparent; }
  @media (max-width: 640px) { .meta { grid-template-columns: 1fr; } }
</style>
<main>
  <h1>Request received.</h1>
  <p>SuperMega captured the request. We review the source, reply with the first useful output path, then create app access only after scope approval.</p>
  <div class="meta">
    <div class="box"><span>Lead</span><strong>${escapeHtml(record.lead_id)}</strong></div>
    <div class="box"><span>Task</span><strong>${escapeHtml(record.task_id)}</strong></div>
    <div class="box"><span>Package</span><strong>${escapeHtml(record.public_package || record.requested_package)}</strong></div>
    <div class="box"><span>First output</span><strong>${escapeHtml(onboarding.first_output)}</strong></div>
    <div class="box"><span>Reply target</span><strong>${escapeHtml(record.email)}</strong></div>
    <div class="box"><span>Owner</span><strong>${escapeHtml(onboarding.owner)}</strong></div>
    <div class="box"><span>App access</span><strong>${escapeHtml(onboarding.workspace_status)}</strong></div>
  </div>
  <ol>
    <li>${escapeHtml(onboarding.steps[0])}</li>
    <li>${escapeHtml(onboarding.steps[1])}</li>
    <li>${escapeHtml(onboarding.steps[2])}</li>
  </ol>
  <div class="actions">
    <a class="primary" href="mailto:${escapeHtml(notifyEmail)}?subject=${subject}&body=${body}">Send source links</a>
    <a href="/contact/">Send another request</a>
    <a href="/products/">View products</a>
  </div>
</main>
</html>`)
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

function truncate(value, maxLength) {
  const normalized = text(value)
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function allowedOrigins() {
  return String(process.env.SUPERMEGA_ALLOWED_ORIGINS || defaultAllowedOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function isAllowedOrigin(origin) {
  const normalized = text(origin)
  if (!normalized) return true
  try {
    const url = new URL(normalized)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    if (url.hostname.endsWith('.vercel.app')) return true
  } catch {
    return false
  }
  return allowedOrigins().includes(normalized)
}

function cors(req, res) {
  const origin = text(req.headers.origin)
  if (isAllowedOrigin(origin) && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://supermega.dev')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let rawLength = 0
    req.on('data', (chunk) => {
      const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(nextChunk)
      rawLength += nextChunk.length
      if (rawLength > 5_000_000) {
        reject(new Error('request_too_large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      const rawBuffer = Buffer.concat(chunks)
      const raw = rawBuffer.toString('utf8')
      if (!raw.trim()) {
        resolve({})
        return
      }
      const rawContentType = text(req.headers['content-type'])
      const contentType = rawContentType.toLowerCase()
      if (contentType.includes('multipart/form-data')) {
        // Extract boundary from ORIGINAL header (case-preserved) — browser boundaries like
        // WebKitFormBoundary are mixed-case and must match the body delimiter exactly.
        const boundary = (rawContentType.match(/boundary="([^"]+)"/i) || rawContentType.match(/boundary=([^;\s]+)/i))?.[1]?.trim()
        if (!boundary) {
          reject(new Error('invalid_multipart'))
          return
        }
        const payload = {}
        const fileNames = []
        for (const part of raw.split(`--${boundary}`)) {
          // Handle both \r\n\r\n and \n\n separators between headers and body
          const sep = part.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n'
          const [headerBlock, ...bodyParts] = part.split(sep)
          if (!bodyParts.length) continue
          const headers = headerBlock || ''
          const body = bodyParts.join(sep).replace(/\r\n$/, '').replace(/\n$/, '')
          const name = headers.match(/name="([^"]+)"/i)?.[1]
          if (!name) continue
          const filename = headers.match(/filename="([^"]*)"/i)?.[1]
          if (filename) {
            const safeFilename = text(filename)
            if (safeFilename) fileNames.push(safeFilename)
            continue
          }
          payload[name] = body
        }
        if (fileNames.length) {
          const existing = text(payload.source_file_names)
          payload.source_file_names = [existing, fileNames.join('; ')].filter(Boolean).join('; ')
          payload.source_file_count = String(fileNames.length)
        }
        resolve(payload)
        return
      }
      if (contentType.includes('application/x-www-form-urlencoded')) {
        resolve(Object.fromEntries(new URLSearchParams(raw)))
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function clientIp(req) {
  return text(req.headers['x-forwarded-for']).split(',')[0].trim() || text(req.socket?.remoteAddress) || 'unknown'
}

function isHtmlFormRequest(req) {
  const contentType = text(req.headers['content-type']).toLowerCase()
  return contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')
}

function wantsJsonResponse(req) {
  const accept = text(req.headers.accept).toLowerCase()
  return accept.includes('application/json') || text(req.headers['x-supermega-response']).toLowerCase() === 'json'
}

function shouldRenderHtmlFormResponse(req) {
  return isHtmlFormRequest(req) && !wantsJsonResponse(req)
}

function checkRateLimit(req) {
  const now = Date.now()
  const key = clientIp(req)
  const entries = (rateStore.get(key) || []).filter((timestamp) => now - timestamp < rateLimitWindowMs)
  entries.push(now)
  rateStore.set(key, entries)
  return {
    allowed: entries.length <= rateLimitMax,
    count: entries.length,
    window_ms: rateLimitWindowMs,
  }
}

function fromCandidates() {
  const configured = text(process.env.SUPERMEGA_RESEND_FROM)
  return configured && configured !== fallbackFrom ? [configured, fallbackFrom] : [fallbackFrom]
}

function leadScore(payload) {
  let score = 20
  const goal = text(payload.goal)
  const company = text(payload.company)
  const email = text(payload.email)
  if (company) score += 15
  if (email && !email.match(/@(gmail|yahoo|hotmail|outlook)\./i)) score += 15
  if (text(payload.phone)) score += 5
  if (goal.length > 80) score += 20
  if (goal.match(/\b(approval|operations|workflow|files|spreadsheet|crm|erp|portal|manager|team|data|ai|meter|sensor|machine|energy|digital twin)\b/i)) score += 15
  if (text(payload.source_file_names) || Number(payload.source_file_count || 0) > 0) score += 10
  if (text(payload.requested_package) || text(payload.public_package) || text(payload.workflow)) score += 10
  if (text(payload.first_proof_target) || text(payload.acceptance_tests)) score += 5
  if (text(payload.utm_campaign)) score += 5
  return Math.max(0, Math.min(score, 100))
}

function leadStage(score) {
  if (score >= 75) return 'qualified'
  if (score >= 50) return 'needs_discovery'
  return 'needs_context'
}

function recommendedNextStep(record) {
  if (record.lead_stage === 'qualified') {
    return 'Reply with a 20-minute discovery call and ask for 2-3 workflow screenshots or sample files.'
  }
  if (record.lead_stage === 'needs_discovery') {
    return 'Reply with 3 clarifying questions: current tool, owner, and what result they need first.'
  }
  return 'Reply asking for the first messy workflow, current tools, and the team that owns it.'
}

function onboardingPlan(record) {
  const firstOutput = record.first_output || record.requested_package || 'First useful output'
  return {
    status: record.onboarding_stage || 'source_review',
    owner: record.management_owner || notifyEmail,
    first_output: firstOutput,
    public_package: record.public_package || '',
    first_proof_target: record.first_proof_target || '',
    automation_boundary: record.automation_boundary || 'Approval required before workspace access, external sends, connector writes, or payment actions.',
    access_policy: record.access_policy || 'approval_required',
    workspace_status: record.workspace_status || 'not_created_until_approved',
    next_step: record.next_step,
    steps: [
      'Share one source if it was not included: file, folder, screenshot, sheet, export, or email thread.',
      `We reply with the ${firstOutput} path, owner, scope, price, and approval boundary.`,
      'Client workspace access is created only after approval. Nothing is connected, sent, charged, or changed before that.',
    ],
  }
}

function supabaseConfig() {
  return {
    url: envText('SUPABASE_URL', 'DATABASE_URL_SUPABASE_URL', 'DATABASE_URL_SUPERMEGA_DATABASE_URLSUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: envText('SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function leadLedgerStatus() {
  if (datastore.postgresConfigured()) return 'configured'
  const config = supabaseConfig()
  return config.url && config.serviceRoleKey ? 'configured' : 'not_configured'
}

function pipelineActionStatus() {
  if (datastore.postgresConfigured()) return 'configured'
  const config = supabaseConfig()
  return config.url && config.serviceRoleKey ? 'configured' : 'not_configured'
}

function databaseConfigured() {
  return datastore.postgresConfigured()
}

function fallbackQueueStatus() {
  const emailConfigured = Boolean(envText('RESEND_API_KEY'))
  const webhookConfigured = Boolean(envText('SUPERMEGA_LEAD_WEBHOOK_URL'))
  return {
    status: emailConfigured || webhookConfigured ? 'ready' : 'needs_configuration',
    mode: emailConfigured && webhookConfigured ? 'email_and_webhook' : emailConfigured ? 'email' : webhookConfigured ? 'webhook' : 'manual_email_link',
    email_delivery: emailConfigured ? 'configured' : 'not_configured',
    webhook_delivery: webhookConfigured ? 'configured' : 'not_configured',
    owner: notifyEmail,
  }
}

function leadLedgerPayload(record) {
  return {
    lead_id: record.lead_id,
    task_id: record.task_id,
    source: record.source,
    name: record.name,
    email: record.email,
    phone: record.phone,
    company: record.company,
    workflow: record.workflow,
    requested_package: record.requested_package,
    goal: record.goal,
    data: record.data,
    team: record.team,
    source_url: record.source_url,
    page_path: record.page_path,
    referrer: record.referrer,
    utm_source: record.utm_source,
    utm_medium: record.utm_medium,
    utm_campaign: record.utm_campaign,
    utm_content: record.utm_content,
    utm_term: record.utm_term,
    lead_score: record.lead_score,
    lead_stage: record.lead_stage,
    status: record.status,
    owner: record.owner,
    next_step: record.next_step,
    submitted_at: record.submitted_at,
    raw: record,
  }
}

function pipelineActionPayload(record) {
  return {
    action_id: record.task_id,
    lead_id: record.lead_id,
    task_id: record.task_id,
    action_type: 'lead_followup',
    status: 'open',
    priority: record.lead_score >= 75 ? 'high' : record.lead_score >= 50 ? 'medium' : 'low',
    owner: record.owner || 'Revenue Pod',
    title: `Follow up ${record.company || record.name || record.email}`,
    next_step: record.next_step,
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    evidence_url: record.source_links || record.source_url || '',
    source_url: record.source_url || '',
    approval_required: true,
    approval_state: 'pending',
    notification_channel: 'email',
    notification_status: 'queued',
    payload: {
      lead_score: record.lead_score,
      lead_stage: record.lead_stage,
      requested_package: record.requested_package,
      first_output: record.first_output,
      product_area: record.product_area,
      source_file_count: record.source_file_count,
      public_package: record.public_package,
      first_proof_target: record.first_proof_target,
      acceptance_tests: record.acceptance_tests,
      launch_blockers: record.launch_blockers,
      automation_boundary: record.automation_boundary,
      access_policy: record.access_policy,
      workspace_status: record.workspace_status,
      utm_source: record.utm_source,
      utm_medium: record.utm_medium,
      utm_campaign: record.utm_campaign,
    },
  }
}

async function saveLeadLedger({ record }) {
  const payload = leadLedgerPayload(record)
  if (datastore.postgresConfigured()) {
    const postgres = await datastore.saveLeadLedger(payload)
    if (postgres.status === 'ready') {
      return { status: 'ready', table: 'supermega_leads', adapter: 'vercel_postgres_neon' }
    }
    const config = supabaseConfig()
    if (!config.url || !config.serviceRoleKey) {
      return {
        status: 'error',
        reason: postgres.reason || 'postgres_failed',
        table: 'supermega_leads',
        adapter: 'vercel_postgres_neon',
        fallback: 'email',
        detail: postgres.detail || null,
      }
    }
  }

  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    return { status: 'skipped', reason: 'database_not_configured', table: 'supermega_leads' }
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/supermega_leads`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })

    if (response.ok) {
      return { status: 'ready', code: response.status, table: 'supermega_leads', adapter: 'supabase_rest' }
    }

    return {
      status: 'error',
      reason: `supabase_${response.status}`,
      table: 'supermega_leads',
      hint: 'run_supermega_leads_schema',
    }
  } catch (error) {
    return {
      status: 'error',
      reason: error.message || 'supabase_failed',
      table: 'supermega_leads',
      hint: 'check_supabase_env_and_network',
    }
  }
}

async function savePipelineAction({ record }) {
  const payload = pipelineActionPayload(record)
  if (datastore.postgresConfigured()) {
    const postgres = await datastore.savePipelineAction(payload)
    if (postgres.status === 'ready') {
      return { status: 'ready', table: 'supermega_pipeline_actions', action_id: record.task_id, adapter: 'vercel_postgres_neon' }
    }
    const config = supabaseConfig()
    if (!config.url || !config.serviceRoleKey) {
      return {
        status: 'error',
        reason: postgres.reason || 'postgres_failed',
        table: 'supermega_pipeline_actions',
        adapter: 'vercel_postgres_neon',
        fallback: 'email',
        detail: postgres.detail || null,
      }
    }
  }

  const config = supabaseConfig()
  if (!config.url || !config.serviceRoleKey) {
    return { status: 'skipped', reason: 'database_not_configured', table: 'supermega_pipeline_actions' }
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/supermega_pipeline_actions`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })

    if (response.ok) {
      return { status: 'ready', code: response.status, table: 'supermega_pipeline_actions', action_id: record.task_id, adapter: 'supabase_rest' }
    }

    return {
      status: 'error',
      reason: `supabase_${response.status}`,
      table: 'supermega_pipeline_actions',
      hint: 'run_supermega_pipeline_actions_schema',
    }
  } catch (error) {
    return {
      status: 'error',
      reason: error.message || 'supabase_failed',
      table: 'supermega_pipeline_actions',
      hint: 'check_supabase_env_and_network',
    }
  }
}

function buildLeadRecord({ leadId, taskId, payload, req }) {
  const score = leadScore(payload)
  const sourceLinks = truncate(payload.source_links, 700)
  const firstStep = truncate(payload.first_step, 160)
  const publicPackage = truncate(payload.public_package, 160)
  const firstProofTarget = truncate(payload.first_proof_target, 300)
  const acceptanceTests = truncate(payload.acceptance_tests, 900)
  const launchBlockers = truncate(payload.launch_blockers, 500)
  const automationBoundary = truncate(payload.automation_boundary, 700)
  const firstOutput = truncate(payload.requested_package, 120) || truncate(payload.first_output, 120) || truncate(payload.workflow, 120) || 'First useful output'
  const productArea = truncate(payload.product_area, 160)
  const sourceFileNames = truncate(payload.source_file_names, 1200)
  const sourceFileCount = truncate(payload.source_file_count, 20)
  const onboardingStage = truncate(payload.onboarding_stage, 80) || 'source_review'
  const accessPolicy = truncate(payload.access_policy, 120) || 'approval_required'
  const workspaceStatus = truncate(payload.workspace_status, 120) || 'not_created_until_approved'
  const urgency = truncate(payload.urgency, 120)
  const team = truncate(payload.team, 500) || truncate(payload.first_team, 500) || truncate(payload.team_size, 500)
  const intakeData = [
    truncate(payload.data, 500),
    publicPackage ? `Public package: ${publicPackage}` : '',
    firstProofTarget ? `First proof target: ${firstProofTarget}` : '',
    acceptanceTests ? `Acceptance tests: ${acceptanceTests}` : '',
    launchBlockers ? `Launch blockers: ${launchBlockers}` : '',
    automationBoundary ? `Automation boundary: ${automationBoundary}` : '',
    sourceLinks ? `Source links: ${sourceLinks}` : '',
    productArea ? `Product area: ${productArea}` : '',
    sourceFileNames ? `Attached file manifest: ${sourceFileNames}` : '',
    sourceFileCount ? `Attached file count: ${sourceFileCount}` : '',
    firstStep ? `First step: ${firstStep}` : '',
    urgency ? `Urgency: ${urgency}` : '',
  ]
    .filter(Boolean)
    .join(' | ')
  const record = {
    id: leadId,
    lead_id: leadId,
    task_id: taskId,
    source: 'website',
    name: truncate(payload.name, 120),
    email: truncate(payload.email, 180).toLowerCase(),
    phone: truncate(payload.phone, 80),
    company: truncate(payload.company, 180),
    workflow: truncate(payload.workflow, 120) || 'Workflow system',
    requested_package: firstOutput,
    public_package: publicPackage,
    first_output: firstOutput,
    product_area: productArea,
    first_proof_target: firstProofTarget,
    acceptance_tests: acceptanceTests,
    launch_blockers: launchBlockers,
    automation_boundary: automationBoundary,
    goal: truncate(payload.goal, 2400),
    data: truncate(intakeData, 1400),
    team,
    source_links: sourceLinks,
    source_file_names: sourceFileNames,
    source_file_count: sourceFileCount,
    urgency,
    source_url: truncate(payload.source_url, 500),
    page_path: truncate(payload.page_path, 300),
    referrer: truncate(payload.referrer, 500),
    utm_source: truncate(payload.utm_source, 120),
    utm_medium: truncate(payload.utm_medium, 120),
    utm_campaign: truncate(payload.utm_campaign, 180),
    utm_content: truncate(payload.utm_content, 180),
    utm_term: truncate(payload.utm_term, 180),
    user_agent: truncate(req.headers['user-agent'], 500),
    ip_hint: clientIp(req),
    lead_score: score,
    lead_stage: leadStage(score),
    status: 'routed',
    owner: 'Revenue Pod',
    onboarding_stage: onboardingStage,
    access_policy: accessPolicy,
    workspace_status: workspaceStatus,
    management_owner: truncate(payload.management_owner, 160) || notifyEmail,
    next_step: '',
    submitted_at: new Date().toISOString(),
  }
  record.next_step = recommendedNextStep(record)
  return record
}

function emailRows(record) {
  const rows = [
    ['Lead', record.lead_id],
    ['Task', record.task_id],
    ['Score', `${record.lead_score}/100 (${record.lead_stage})`],
    ['Name', record.name],
    ['Email', record.email],
    ['Phone / WhatsApp', record.phone],
    ['Company', record.company],
    ['First output', record.first_output || record.requested_package],
    ['Public package', record.public_package],
    ['First proof target', record.first_proof_target],
    ['Acceptance tests', record.acceptance_tests],
    ['Launch blockers', record.launch_blockers],
    ['Automation boundary', record.automation_boundary],
    ['Product area', record.product_area],
    ['Team / users', record.team],
    ['Urgency', record.urgency],
    ['Onboarding stage', record.onboarding_stage],
    ['App access', record.workspace_status],
    ['Access policy', record.access_policy],
    ['Next step', record.next_step],
    ['Message', record.goal],
    ['Source links / files', record.source_links || record.data],
    ['Attached file manifest', record.source_file_names],
    ['Source', record.source_url || 'supermega.dev'],
    ['Campaign', [record.utm_source, record.utm_medium, record.utm_campaign].filter(Boolean).join(' / ') || 'direct'],
  ]
  return rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;vertical-align:top"><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`)
    .join('')
}

async function sendEmail({ record }) {
  const apiKey = text(process.env.RESEND_API_KEY)
  if (!apiKey) {
    return { status: 'error', reason: 'resend_not_configured' }
  }

  const subjectCompany = text(record.company) || text(record.name) || 'New request'
  const replyTo = text(record.email)
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 16px">New SuperMega lead: ${escapeHtml(subjectCompany)}</h2>
      <p style="margin:0 0 12px">A contact request was submitted on supermega.dev and routed into the sales intake.</p>
      <table style="border-collapse:collapse">${emailRows(record)}</table>
    </div>
  `

  let lastError = null
  for (const from of fromCandidates()) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [notifyEmail],
        subject: `[${record.lead_stage}] ${record.lead_score}/100 - ${subjectCompany}`,
        html,
        ...(replyTo.includes('@') ? { reply_to: [replyTo] } : {}),
      }),
    })

    const bodyText = await response.text()
    let body = {}
    try {
      body = bodyText ? JSON.parse(bodyText) : {}
    } catch {
      body = { raw: bodyText }
    }

    if (response.ok) {
      return { status: 'ready', email_id: text(body.id), to: notifyEmail, from }
    }

    // Do not echo raw upstream provider response back to the client.
    lastError = { status: 'error', reason: `resend_${response.status}`, from, to: notifyEmail }
    if (response.status !== 403) break
  }

  return lastError || { status: 'error', reason: 'resend_delivery_failed' }
}

async function sendConfirmationEmail({ record }) {
  if (text(process.env.SUPERMEGA_SEND_CONTACT_CONFIRMATION) !== '1') {
    return { status: 'skipped', reason: 'confirmation_disabled' }
  }

  const apiKey = text(process.env.RESEND_API_KEY)
  if (!apiKey || !record.email.includes('@')) {
    return { status: 'skipped', reason: 'confirmation_unavailable' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromCandidates()[0],
      to: [record.email],
      subject: 'SuperMega request received',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
          <h2 style="margin:0 0 16px">We received your SuperMega request.</h2>
          <p style="margin:0 0 12px">Hi ${escapeHtml(record.name)},</p>
          <p style="margin:0 0 12px">Your request for ${escapeHtml(record.company)} was captured. We will reply by email with the next step.</p>
          <p style="margin:0 0 12px"><strong>Lead:</strong> ${escapeHtml(record.lead_id)}</p>
          <p style="margin:0">Best,<br/>SUPERMEGA.dev</p>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    return { status: 'error', reason: `resend_${response.status}`, to: record.email }
  }

  const bodyText = await response.text()
  let body = {}
  try {
    body = bodyText ? JSON.parse(bodyText) : {}
  } catch {
    body = { raw: bodyText }
  }
  return { status: 'ready', email_id: text(body.id), to: record.email }
}

async function postLeadWebhook({ record }) {
  const webhookUrl = text(process.env.SUPERMEGA_LEAD_WEBHOOK_URL)
  if (!webhookUrl) {
    return { status: 'skipped', reason: 'webhook_not_configured' }
  }

  const headers = { 'Content-Type': 'application/json' }
  const secret = text(process.env.SUPERMEGA_LEAD_WEBHOOK_SECRET)
  if (secret) {
    headers['X-SuperMega-Secret'] = secret
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event: 'contact.created', record }),
    })
    await response.text()
    // Do not echo raw upstream webhook response back to the client.
    return response.ok ? { status: 'ready', code: response.status } : { status: 'error', reason: `webhook_${response.status}` }
  } catch (error) {
    return { status: 'error', reason: error.message || 'webhook_failed' }
  }
}

// Build the concise CEO lead-alert text, then push it via the shared Telegram helper.
// Best-effort: the helper never throws and skips cleanly when TELEGRAM_* isn't configured.
function telegramLeadMessage(record) {
  const company = record.company || record.name || 'Unknown'
  const goal = (record.goal || record.workflow || '').slice(0, 280)
  const score = record.lead_score || 0
  const pkg = record.requested_package || ''
  const consoleUrl = text(process.env.SUPERMEGA_CONSOLE_URL)
  const sheetUrl = text(process.env.SUPERMEGA_LEAD_SHEET_URL)
  const link = sheetUrl || consoleUrl
  return [
    `🔔 New lead — ${record.lead_id}`,
    `👤 ${record.name} · ${company}`,
    `📧 ${record.email}${record.phone ? ' · ' + record.phone : ''}`,
    pkg && pkg !== 'General enquiry' ? `📦 ${pkg}` : '',
    `⭐ Score ${score} · ${record.lead_stage || 'needs_discovery'}`,
    `💬 ${goal}`,
    `→ ${record.next_step || 'Review and reply.'}`,
    link ? `🔗 ${link}` : '',
  ].filter(Boolean).join('\n')
}

async function notifyTelegram({ record }) {
  return sendTelegram(telegramLeadMessage(record))
}

async function appendToGoogleSheet({ record }) {
  const saRaw = text(process.env.GOOGLE_SA_KEY)
  const sheetId = text(process.env.SUPERMEGA_LEAD_SHEET_ID)
  if (!saRaw || !sheetId) return { status: 'skipped', reason: 'sheets_not_configured' }
  try {
    const sa = JSON.parse(saRaw)
    const now = Math.floor(Date.now() / 1000)
    const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
    const { createSign } = await import('node:crypto')
    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${claim}`)
    const sig = b64url(signer.sign(sa.private_key))
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${sig}` }),
      signal: AbortSignal.timeout(8000),
    })
    if (!tokenRes.ok) return { status: 'error', reason: 'sa_token_failed' }
    const { access_token: tok } = await tokenRes.json()
    const row = [record.submitted_at || new Date().toISOString(), record.lead_id, record.name, record.email, record.phone || '', record.company || '', record.requested_package || '', record.lead_score || 0, record.lead_stage || '', record.goal || '', record.next_step || '']
    const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Leads!A:K:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
      signal: AbortSignal.timeout(8000),
    })
    return appendRes.ok ? { status: 'ready' } : { status: 'error', reason: `sheets_${appendRes.status}` }
  } catch (err) {
    return { status: 'error', reason: text(err?.message) || 'sheets_failed' }
  }
}

module.exports = async function handler(req, res) {
  cors(req, res)
  const pathname = new URL(req.url || '/api/contact-submissions', 'https://supermega.dev').pathname

  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req.headers.origin)) {
      json(res, 403, { status: 'error', reason: 'origin_not_allowed' })
      return
    }
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET') {
    if (pathname === '/api/contact-submissions/status') {
      json(res, 200, {
        status: 'ready',
        endpoint: 'contact-submissions',
        lead_scoring: 'ready',
        utm_tracking: 'ready',
        lead_ledger: leadLedgerStatus(),
        ledger_table: 'supermega_leads',
        pipeline_actions: pipelineActionStatus(),
        pipeline_actions_table: 'supermega_pipeline_actions',
        primary_datastore: datastore.datastoreStatus(),
        fallback_queue: fallbackQueueStatus(),
        management_mode: databaseConfigured() ? 'database_queue' : 'email_fallback',
        setup_checklist: {
          resend_api_key: Boolean(envText('RESEND_API_KEY')) ? 'configured' : 'missing — contact form email will not send',
          supabase: (envText('SUPABASE_URL') && envText('SUPABASE_SERVICE_ROLE_KEY')) ? 'configured' : 'missing — leads will not be saved to DB',
          telegram: envText('TELEGRAM_BOT_TOKEN') ? 'configured' : 'missing — no Telegram alerts on new leads',
          ops_key: Boolean(envText('SUPERMEGA_OPS_KEY')) ? 'configured' : 'missing — commercial-control and action-runner are blocked',
        },
      })
      return
    }
    json(res, 401, { status: 'error', reason: 'login_required', detail: 'Contact submission list requires app login.' })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    json(res, 403, { status: 'error', reason: 'origin_not_allowed' })
    return
  }

  const rate = checkRateLimit(req)
  if (!rate.allowed) {
    json(res, 429, { status: 'error', reason: 'rate_limited', rate })
    return
  }

  let payload
  try {
    payload = await readBody(req)
  } catch (error) {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 400, 'Could not send.', `The form could not be read. Email ${notifyEmail} directly.`)
      return
    }
    json(res, 400, { status: 'error', reason: error.message || 'invalid_request' })
    return
  }

  if (text(payload.website) || text(payload.url)) {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 200, 'Received.', 'Your message was routed.')
      return
    }
    json(res, 200, { status: 'ready', message: 'Submission routed.' })
    return
  }

  const name = truncate(payload.name, 120)
  const email = truncate(payload.email, 180)
  const company = truncate(payload.company, 180)
  const goal = truncate(payload.goal, 2400)

  if (!name || !email.includes('@') || !company || !goal) {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 400, 'Missing details.', 'Please include your name, work email, company, and the workflow to fix first.')
      return
    }
    json(res, 400, { status: 'error', reason: 'missing_required_fields' })
    return
  }

  const leadId = `LEAD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  const taskId = `TASK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  const record = buildLeadRecord({ leadId, taskId, payload: { ...payload, name, email, company, goal }, req })
  const ledger = await saveLeadLedger({ record })
  const pipelineAction = await savePipelineAction({ record })
  const webhook = await postLeadWebhook({ record })
  const [delivery, confirmation, telegram, sheets] = await Promise.all([
    sendEmail({ record }),
    sendConfirmationEmail({ record }),
    notifyTelegram({ record }),
    appendToGoogleSheet({ record }),
  ])

  // Forward to the Ops pipeline so the lead appears in the machine console
  // Fire-and-forget: doesn't block or affect the response
  ;(async () => {
    const intakeSecret = text(process.env.SUPERMEGA_INTAKE_SECRET)
    const intakeUrl = text(process.env.SUPERMEGA_OPS_INTAKE_URL) || 'https://supermega-machine.vercel.app/api/intake'
    if (!intakeSecret) return
    try {
      await fetch(intakeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: intakeSecret,
          source: 'website',
          external_id: record.lead_id,
          name: record.name,
          email: record.email,
          phone: record.phone,
          company: record.company,
          workflow: truncate(record.goal || goal || '', 2400),
        }),
      })
    } catch (err) {
      console.error('[contact-submissions] ops_intake_failed', err && err.message)
    }
  })().catch(() => {})

  // Email is a notification layer — only fail hard if the lead was not saved anywhere
  const leadSaved = ledger.status === 'ready'
  if (delivery.status !== 'ready' && !leadSaved) {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 502, 'Could not send.', `Email ${notifyEmail} directly and include your company, workflow, and contact details.`)
      return
    }
    json(res, 502, { status: 'error', reason: 'email_delivery_failed', delivery, fallback_email: notifyEmail })
    return
  }

  if (text(process.env.SUPERMEGA_REQUIRE_LEAD_WEBHOOK) === '1' && webhook.status !== 'ready') {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 502, 'Could not route.', `Email ${notifyEmail} directly and include your company, workflow, and contact details.`)
      return
    }
    json(res, 502, { status: 'error', reason: 'lead_webhook_failed', webhook, delivery })
    return
  }

  if (text(process.env.SUPERMEGA_REQUIRE_LEAD_LEDGER) === '1' && ledger.status !== 'ready') {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 502, 'Could not save.', `Email ${notifyEmail} directly and include your company, workflow, and contact details.`)
      return
    }
    json(res, 502, { status: 'error', reason: 'lead_ledger_failed', ledger, delivery, webhook })
    return
  }

  if (text(process.env.SUPERMEGA_REQUIRE_PIPELINE_ACTIONS) === '1' && pipelineAction.status !== 'ready') {
    if (shouldRenderHtmlFormResponse(req)) {
      html(res, 502, 'Could not create task.', `Email ${notifyEmail} directly and include your company, workflow, and contact details.`)
      return
    }
    json(res, 502, { status: 'error', reason: 'pipeline_action_failed', ledger, pipeline_action: pipelineAction, delivery, webhook })
    return
  }

  if (shouldRenderHtmlFormResponse(req)) {
    receiptHtml(res, record)
    return
  }

  // Do not echo the submitter's own IP/User-Agent back in the response body.
  const { ip_hint, user_agent, ...publicSubmission } = record
  json(res, 200, {
    status: 'ready',
    message: 'Submission routed.',
    submission: publicSubmission,
    onboarding: onboardingPlan(record),
    delivery,
    ledger,
    pipeline_action: pipelineAction,
    webhook,
    confirmation,
    telegram,
    sheets,
    pipeline: {
      saved_count: ledger.status === 'ready' ? 1 : 0,
      saved_task_count: pipelineAction.status === 'ready' ? 1 : 0,
      email_routed_count: delivery.status === 'ready' ? 1 : 0,
      management_mode: ledger.status === 'ready' && pipelineAction.status === 'ready' ? 'database_queue' : 'email_fallback',
      datastore: ledger.adapter || pipelineAction.adapter || 'email_fallback',
      workspace_id: 'public-site',
      lead_id: leadId,
      task_id: taskId,
      lead_score: record.lead_score,
      lead_stage: record.lead_stage,
      summary: {
        status: 'routed',
        next_step: record.next_step,
      },
      onboarding: onboardingPlan(record),
    },
  })
}
