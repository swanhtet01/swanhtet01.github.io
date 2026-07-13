const crypto = require('crypto')
const datastore = require('./lib/supermega-datastore')
const blobQueue = require('./lib/supermega-blob-queue')
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
  const sourcePackUrl = sourcePackIntakeUrl(record)
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
    <a class="primary" href="${escapeHtml(sourcePackUrl)}">Open source pack room</a>
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

function absolutePublicUrl(value) {
  const raw = text(value)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://supermega.dev${raw.startsWith('/') ? raw : `/${raw}`}`
}

function operatorConsoleUrl() {
  return envText('SUPERMEGA_OPERATOR_URL', 'SUPERMEGA_CONSOLE_URL') || 'https://supermega.dev/operator/'
}

function sourcePackIntakeUrl(record = {}) {
  const base = (envText('PUBLIC_WORKSPACE_BASE_URL', 'SUPERMEGA_WORKSPACE_BASE_URL') || 'https://supermega.dev').replace(/\/$/, '')
  const params = new URLSearchParams()
  params.set('lead', text(record.lead_id) || text(record.id) || 'lead-required')
  params.set('action', text(record.task_id) || text(record.action_id) || 'action-required')
  return `${base}/app/source-pack?${params.toString()}`
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
  if (text(payload.template_id)) score += 5
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

const runtimeWorkcellCatalog = {
  'cash-close': {
    template_id: 'cash-close',
    package_name: 'Cash Close',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'cash_close_workcell',
    keywords: ['cash close', 'cash', 'paypal', 'settlement', 'fees', 'net receipts', 'reconcile'],
    first_proof_target: 'One read-only cash-close preview with gross receipts, fees, net cash, transaction count, exceptions, and source trace.',
    source_requests: [
      'PayPal account owner and one settlement window; load credentials only during isolated provisioning, never in this form or email',
      'agreed close window and reporting timezone',
      'owner who reviews the first proof',
    ],
    sales_motion: 'Prove one read-only close, then provision an isolated daily Cash Close deployment after owner acceptance.',
    modules: ['paypal_settlement_read', 'cash_close_reconciliation', 'fee_and_net_summary', 'exception_queue', 'source_trace'],
    requires_clickup_list: false,
    provider_secret_inputs: ['SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_ID', 'SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET'],
  },
  'pipeline-control': {
    template_id: 'pipeline-control',
    package_name: 'Pipeline Control',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'pipeline_control_workcell',
    keywords: ['pipeline control', 'pipeline', 'pipedrive', 'clickup', 'deal', 'revenue risk', 'delivery queue'],
    first_proof_target: 'One read-only revenue-control preview with ranked risks, exact deal and task evidence, and one owner action.',
    source_requests: [
      'Pipedrive account owner and pipeline scope; load credentials only during isolated provisioning, never in this form or email',
      'ClickUp workspace owner and the exact delivery list ID',
      'owner who approves any proposed ClickUp task',
    ],
    sales_motion: 'Prove one read-only revenue-risk brief, then provision an isolated scheduled Pipeline Control deployment after owner acceptance.',
    modules: ['pipedrive_open_deals_read', 'clickup_work_queue_read', 'revenue_risk_ranking', 'evidence_matching', 'approval_only_task_draft'],
    requires_clickup_list: true,
    provider_secret_inputs: [
      'SUPERMEGA_NEW_CLIENT_PIPEDRIVE_ACCESS_TOKEN|SUPERMEGA_NEW_CLIENT_PIPEDRIVE_API_TOKEN',
      'SUPERMEGA_NEW_CLIENT_CLICKUP_ACCESS_TOKEN|SUPERMEGA_NEW_CLIENT_CLICKUP_API_TOKEN',
    ],
  },
  'owner-command': {
    template_id: 'owner-command',
    package_name: 'Owner Command',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'owner_command_workcell',
    keywords: ['owner command', 'owner brief', 'daily command', 'telegram', 'messages', 'updates', 'cash', 'sales', 'delivery', 'issues'],
    first_proof_target: 'One source-traced owner brief from three representative owner-forwarded Telegram updates, with stated money, deadlines, exceptions, missing evidence, and one owner action.',
    source_requests: [
      'three representative sales, cash, delivery, or issue updates with sensitive details removed for the first proof',
      'owner approval to create a private Telegram bot; load its token only during isolated provisioning, never in this form or email',
      'daily delivery time, reporting timezone, and the exact private owner chat',
    ],
    sales_motion: 'Prove one owner brief from three representative updates, then provision an isolated daily Owner Command bot after owner acceptance.',
    modules: ['telegram_owner_updates_read', 'owner_command_brief', 'source_trace', 'owner_delivery', 'optional_approval_task_draft'],
    requires_clickup_list: false,
    provider_secret_inputs: [],
  },
}

const solutionRouteCatalog = [
  ...Object.values(runtimeWorkcellCatalog),
  {
    template_id: 'deskpos-quickstart',
    package_name: 'Shop Quickstart',
    product_area: 'Shop',
    delivery_lane: 'pos_launch_workcell',
    keywords: ['pos', 'point of sale', 'restaurant', 'cafe', 'shop', 'store', 'retail', 'spa', 'salon', 'clinic', 'booking', 'checkout', 'receipt', 'inventory', 'stock'],
    first_proof_target: 'Working checkout, booking flow, receipt proof, and daily close insight on their starting catalog.',
    source_requests: ['service or product list', 'staff list', 'payment wallet name', 'opening hours'],
    sales_motion: 'Sell a fixed-scope Shop setup after one checkout or booking proof is accepted.',
  },
  {
    template_id: 'chat-ledger',
    package_name: 'Viber / WhatsApp Business Ledger',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'chat_to_ledger_workcell',
    keywords: ['viber', 'whatsapp', 'messenger', 'chat', 'orders', 'customer messages', 'invoice', 'delivery', 'unpaid', 'balance', 'follow up'],
    first_proof_target: 'Clean table of recent orders, who owes money, and which customers need follow-up today.',
    source_requests: ['ten order screenshots or export rows', 'product list', 'payment proof examples', 'delivery rules'],
    sales_motion: 'Sell a managed chat-to-ledger pilot after the buyer sees unpaid balances and follow-up drafts.',
  },
  {
    template_id: 'inbox-calendar-operator',
    package_name: 'Inbox & Calendar Operator',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'inbox_calendar_workcell',
    keywords: ['gmail', 'email', 'inbox', 'calendar', 'meeting', 'reply', 'assistant', 'followup', 'follow-up', 'schedule', 'appointment'],
    first_proof_target: 'Morning action brief with drafted replies, meeting prep, and follow-up tasks waiting for approval.',
    source_requests: ['approved inbox labels or sample emails', 'calendar categories', 'reply examples', 'VIP contacts'],
    sales_motion: 'Sell a read-only inbox/calendar operator first, then add approval-gated sending after trust is proven.',
  },
  {
    template_id: 'daily-intelligence-brief',
    package_name: 'Daily Intelligence Brief Agent',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'decision_brief_workcell',
    keywords: ['brief', 'daily', 'morning', 'news', 'watch', 'monitor', 'supplier', 'competitor', 'market', 'research', 'decision', 'report'],
    first_proof_target: 'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
    source_requests: ['watchlist URLs', 'company names or keywords', 'inbox labels', 'decision categories'],
    sales_motion: 'Sell a recurring owner brief after one source-traced decision packet is accepted.',
  },
  {
    template_id: 'factory-ops-ledger',
    package_name: 'Factory Ops Ledger',
    product_area: 'Plant',
    delivery_lane: 'factory_ops_workcell',
    keywords: ['factory', 'production', 'quality', 'maintenance', 'machine', 'line', 'plant', 'warehouse', 'receiving', 'capa', 'issue', 'defect'],
    first_proof_target: 'Dashboard showing production, quality claims, open issues, and the top risks to review today.',
    source_requests: ['daily production sheet', 'quality claim log', 'maintenance notes', 'machine or line list'],
    sales_motion: 'Sell a plant ledger pilot after the buyer accepts one read-only risk queue.',
  },
  {
    template_id: 'data-clean-report-agent',
    package_name: 'Data Cleanup & Reporting Agent',
    product_area: 'Custom Solutions & AI Agents',
    delivery_lane: 'data_cleanup_workcell',
    keywords: ['excel', 'spreadsheet', 'sheet', 'pdf', 'file', 'files', 'data', 'clean', 'cleanup', 'report', 'reconcile', 'extract', 'ocr', 'dashboard'],
    first_proof_target: 'One messy file cleaned into the target table with exceptions highlighted and a short summary report.',
    source_requests: ['one messy source file', 'target report format', 'validation rules', 'known exception examples'],
    sales_motion: 'Sell a repeatable cleanup/reporting agent after one messy source becomes a clean, reviewed output.',
  },
]

function buildSolutionRoute(record = {}) {
  const explicitTemplate = text(record.template_id)
  const blob = [
    record.requested_package,
    record.public_package,
    record.product_area,
    record.workflow,
    record.goal,
    record.data,
    record.company,
    record.source_links,
    record.page_path,
    record.source_url,
  ].join(' ').toLowerCase()
  const ranked = solutionRouteCatalog
    .map((route) => {
      let score = route.template_id === explicitTemplate ? 80 : 0
      if (text(record.public_package).toLowerCase() === route.package_name.toLowerCase()) score += 45
      if (text(record.requested_package).toLowerCase() === route.package_name.toLowerCase()) score += 35
      if (text(record.product_area).toLowerCase() === route.product_area.toLowerCase()) score += 18
      const matched_keywords = route.keywords.filter((keyword) => blob.includes(keyword.toLowerCase()))
      score += Math.min(42, matched_keywords.length * 7)
      return { route, score, matched_keywords }
    })
    .sort((a, b) => b.score - a.score)
  const winner = ranked[0]
  const route = winner?.route || solutionRouteCatalog[solutionRouteCatalog.length - 1]
  const matchedKeywords = winner?.matched_keywords || []
  const fitScore = Math.max(20, Math.min(100, winner?.score || 20))
  const templateId = explicitTemplate || route.template_id
  const runtimeWorkcell = runtimeWorkcellCatalog[templateId] || null
  const requestedPackage = text(record.requested_package)
  const publicPackage = text(record.public_package)
  const genericPackage = /^(first output request|first useful output|general enquiry|general inquiry|custom supermega template)$/i
  const packageName = publicPackage && !genericPackage.test(publicPackage)
    ? publicPackage
    : requestedPackage && !genericPackage.test(requestedPackage)
      ? requestedPackage
      : route.package_name
  const firstProofTarget = text(record.first_proof_target) || text(record.first_output) || route.first_proof_target
  const starterKitUrl = text(record.starter_kit_url) || (runtimeWorkcell ? '' : `/site/agent-templates/${templateId}.json`)
  const priceHint = text(record.price_hint) || 'quote after first proof review'
  const status = fitScore >= 55 || explicitTemplate ? 'route_ready' : 'needs_operator_review'
  const sourceRequests = route.source_requests
  const deliveryPath = [
    'Confirm buyer goal and first proof target.',
    'Use only buyer-approved source samples.',
    'Build the first proof with source trace.',
    'Review acceptance tests and buyer usefulness.',
    'Only then approve pilot scope, payment route, and private workspace.',
  ]
  const packet = [
    `# ${packageName} solution route`,
    '',
    `Status: ${status}`,
    `Lead: ${record.lead_id || 'not set'}`,
    `Recommended template: ${templateId}`,
    `Product area: ${text(record.product_area) || route.product_area}`,
    `Delivery lane: ${route.delivery_lane}`,
    `Fit score: ${fitScore}`,
    `Matched keywords: ${matchedKeywords.length ? matchedKeywords.join(', ') : 'operator review required'}`,
    `Price hint: ${priceHint}`,
    '',
    '## First proof',
    firstProofTarget,
    '',
    '## What to request',
    ...sourceRequests.map((item) => `- ${item}`),
    '',
    '## Sales motion',
    route.sales_motion,
    '',
    '## Premium delivery controls',
    '- Source trace on important outputs.',
    '- Role separation: buyer owner, buyer operator, SuperMega operator, agent worker.',
    '- Approval queue before external sends, connector writes, credentialed browser actions, or payment requests.',
    '- Value ledger before any recurring revenue claim.',
    '',
    '## First 48 hours',
    ...deliveryPath.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Guardrails',
    '- No external send without owner approval.',
    '- No connector write without owner approval.',
    '- No payment action without owner approval.',
    '- Real MRR remains 0 until payment proof is recorded.',
  ].join('\n')

  return {
    status,
    route_type: 'autopilot_solution_router',
    template_id: templateId,
    package_name: packageName,
    product_area: text(record.product_area) || route.product_area,
    delivery_lane: route.delivery_lane,
    fit_score: fitScore,
    matched_keywords: matchedKeywords,
    starter_kit_url: starterKitUrl,
    first_proof_target: firstProofTarget,
    price_hint: priceHint,
    source_requests: sourceRequests,
    sales_motion: route.sales_motion,
    delivery_path: deliveryPath,
    service_model: 'managed_ai_workcell',
    runtime_workcell_slug: runtimeWorkcell?.template_id || null,
    provisioner_handoff_supported: Boolean(runtimeWorkcell),
    enterprise_controls: ['source_trace', 'role_separation', 'approval_queue', 'value_ledger'],
    approval_boundary: 'owner approval before send/write/payment actions',
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    payment_action_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
    packet,
  }
}

function runtimeWorkcellClientSlug(record = {}) {
  let base = text(record.company || record.name || 'client')
  try { base = base.normalize('NFKD') } catch { /* use source text */ }
  base = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (base.length < 3) base = 'client'
  const identity = text(record.lead_id || record.email || record.company || record.name || 'pending-client')
  const suffix = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 6)
  return `${base.slice(0, 33).replace(/-+$/g, '')}-${suffix}`
}

function buildRuntimeWorkcellActivationHandoff(record = {}, solutionRoute = {}, intakeJob = {}) {
  const runtime = runtimeWorkcellCatalog[text(record.template_id || solutionRoute.runtime_workcell_slug)]
  if (!runtime) return null

  const clientSlug = runtimeWorkcellClientSlug(record)
  const projectName = `supermega-wc-${clientSlug}`
  const manifestFile = `workcells/${clientSlug}.json`
  const missingManifestFields = runtime.requires_clickup_list ? ['clickupListId'] : []
  const sharedSecretInputs = [
    'SUPERMEGA_NEW_CLIENT_OPS_KEY',
    'SUPERMEGA_NEW_CLIENT_ANTHROPIC_API_KEY|SUPERMEGA_NEW_CLIENT_CLAUDE_API_KEY|SUPERMEGA_NEW_CLIENT_OPENROUTER_API_KEY',
    'SUPERMEGA_NEW_CLIENT_SUPABASE_URL',
    'SUPERMEGA_NEW_CLIENT_SUPABASE_SERVICE_ROLE_KEY',
    'SUPERMEGA_NEW_CLIENT_TELEGRAM_BOT_TOKEN',
    'SUPERMEGA_NEW_CLIENT_TELEGRAM_ALERT_CHAT_ID|SUPERMEGA_NEW_CLIENT_TELEGRAM_CHAT_ID',
  ]
  const requiredSecretInputs = [...sharedSecretInputs, ...runtime.provider_secret_inputs]
  const optionalBootstrapInputs = [
    'SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL',
    'SUPERMEGA_NEW_CLIENT_CRON_SECRET',
  ]
  const manifestDraft = {
    version: 1,
    clientSlug,
    clientName: truncate(record.company || record.name || 'Client', 120).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() || 'Client',
    clientId: `workcell-${clientSlug}`,
    projectName,
    workcells: [runtime.template_id],
    timeZone: 'Asia/Yangon',
    currency: 'MMK',
    lookbackHours: 24,
    clickupListId: '',
    deliveryUtc: '01:30',
    tokenCap: 150000,
  }
  const status = missingManifestFields.length ? 'needs_manifest_inputs' : 'needs_client_credentials'
  const operatorSteps = [
    'Confirm the buyer accepted the first proof and approved isolated activation.',
    ...(runtime.requires_clickup_list ? ['Collect the exact client-owned ClickUp list ID and place it in the manifest draft.'] : []),
    'Create or confirm the client-owned Supabase project; never reuse the shared console or another client project.',
    'Load every required credential through the isolated provisioning environment, never through the public form, email, logs, or the manifest file.',
    `Run the plan command and review the normalized manifest, missing inputs, project target, and schedule before applying.`,
    `Apply only with the exact confirmation PROVISION ${projectName}.`,
    'Use client-owned test data for the first authenticated read-only run and keep every proposed write in the Approval Inbox.',
  ]
  const packet = [
    `# ${runtime.package_name} isolated activation handoff`,
    '',
    `Status: ${status}`,
    `Lead: ${record.lead_id || 'not set'}`,
    `Runtime workcell: ${runtime.template_id}`,
    `Manifest file: ${manifestFile}`,
    `Project: ${projectName}`,
    `Apply allowed: false`,
    '',
    '## Missing manifest fields',
    ...(missingManifestFields.length ? missingManifestFields.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Required secret input names',
    ...requiredSecretInputs.map((item) => `- ${item}`),
    '',
    '## Bootstrap-only optional inputs',
    ...optionalBootstrapInputs.map((item) => `- ${item}`),
    '',
    '## Operator steps',
    ...operatorSteps.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Boundary',
    '- No credential value belongs in this packet or manifest.',
    '- No project creation, schema write, provider action, send, or payment occurs from intake.',
    '- Apply remains blocked until client-owned inputs and exact owner confirmation are present.',
  ].join('\n')

  return {
    status,
    handoff_type: 'isolated_workcell_provisioner',
    runtime_workcell_slug: runtime.template_id,
    lead_id: record.lead_id || '',
    manifest_file: manifestFile,
    manifest_draft: manifestDraft,
    missing_manifest_fields: missingManifestFields,
    required_secret_input_names: requiredSecretInputs,
    optional_bootstrap_input_names: optionalBootstrapInputs,
    plan_command: `npm run workcell:provision -- --manifest ${manifestFile} --scope <vercel-team>`,
    apply_command: `npm run workcell:provision -- --apply --manifest ${manifestFile} --scope <vercel-team> --confirm "PROVISION ${projectName}"`,
    exact_apply_confirmation: `PROVISION ${projectName}`,
    provisioner_source: 'kernel/workcell-provision.mjs',
    schema_source: 'kernel/supabase/workcell-client.sql',
    operator_steps: operatorSteps,
    intake_status: intakeJob.status || null,
    manifest_ready: missingManifestFields.length === 0,
    credentials_present: false,
    apply_allowed: false,
    external_action_state: 'blocked_until_owner_approval_and_client_inputs',
    real_mrr_delta: 0,
    packet,
  }
}

function recordWithSolutionRoute(record, solutionRoute) {
  const genericPackage = /^(first output request|first useful output|general enquiry|general inquiry|custom supermega template)$/i
  return {
    ...record,
    template_id: record.template_id || solutionRoute.template_id,
    public_package: record.public_package && !genericPackage.test(record.public_package) ? record.public_package : solutionRoute.package_name,
    requested_package: record.requested_package && !genericPackage.test(record.requested_package) ? record.requested_package : solutionRoute.package_name,
    product_area: record.product_area || solutionRoute.product_area,
    starter_kit_url: record.starter_kit_url || solutionRoute.starter_kit_url,
    price_hint: record.price_hint || solutionRoute.price_hint,
    first_proof_target: record.first_proof_target || solutionRoute.first_proof_target,
  }
}

function implementationModulesForRoute(solutionRoute = {}) {
  const lane = text(solutionRoute.delivery_lane)
  const defaults = ['buyer_goal', 'approved_sources', 'source_trace', 'first_proof', 'approval_queue', 'delivery_packet']
  const runtime = runtimeWorkcellCatalog[text(solutionRoute.runtime_workcell_slug || solutionRoute.template_id)]
  if (runtime) return [...new Set([...defaults, ...runtime.modules])]
  const byLane = {
    pos_launch_workcell: ['business_profile', 'catalog', 'staff_roles', 'checkout_or_booking', 'payment_proof', 'receipt', 'daily_close'],
    chat_to_ledger_workcell: ['chat_sources', 'customer_match', 'order_ledger', 'open_balance_queue', 'delivery_queue', 'approval_only_followups'],
    inbox_calendar_workcell: ['allowed_inbox_scope', 'calendar_scope', 'priority_rules', 'meeting_prep', 'reply_drafts', 'approval_queue'],
    decision_brief_workcell: ['watchlist', 'source_change_log', 'decision_brief', 'risk_flags', 'followup_queue'],
    factory_ops_workcell: ['production_sources', 'quality_claims', 'maintenance_notes', 'asset_or_line_map', 'risk_queue', 'read_only_dashboard'],
    data_cleanup_workcell: ['source_file_parser', 'column_mapping', 'validation_rules', 'exception_report', 'clean_export'],
  }
  return [...defaults, ...(byLane[lane] || ['custom_source_map', 'custom_work_queue', 'custom_output_screen'])]
}

function buildImplementationBlueprintPack(record, solutionRoute = {}, intakeJob = {}) {
  const templateName = record.public_package || record.requested_package || solutionRoute.package_name || 'SUPERMEGA agent'
  const proofTarget = record.first_proof_target || solutionRoute.first_proof_target || record.first_output || 'First useful output'
  const sourceRequests = Array.isArray(solutionRoute.source_requests) && solutionRoute.source_requests.length
    ? solutionRoute.source_requests
    : ['one approved sample source']
  const modules = implementationModulesForRoute(solutionRoute)
  const roleMatrix = [
    { role: 'client_owner', responsibility: 'approve scope, sources, payment route, external sends, connector writes, and acceptance evidence' },
    { role: 'client_operator', responsibility: 'provide source samples, review drafts, request corrections, and confirm daily workflow fit' },
    { role: 'supermega_operator', responsibility: 'configure the workcell, run proofs, maintain source trace, and prepare client-safe packets' },
    { role: 'agent_worker', responsibility: 'draft from approved sources only; no credentials, no autonomous sends, no live writes' },
  ]
  const dataContract = sourceRequests.map((item) => ({
    source: item,
    access_state: 'buyer_approved_sample_required',
    use: 'first_proof_and_blueprint_only',
    writeback: 'blocked_until_owner_approval',
  }))
  const deliveryPlan = [
    { phase: 'day_0', output: 'Confirm buyer goal, first proof target, source samples, role owner, and approval boundary.' },
    { phase: 'day_1', output: `Build the first proof: ${proofTarget}` },
    { phase: 'day_2', output: 'Review source trace, acceptance checks, delivery risk, and buyer usefulness.' },
    { phase: 'day_3_to_7', output: 'Turn accepted proof into a private approval-gated pilot workspace after scope and payment proof.' },
  ]
  const acceptanceGates = [
    'Buyer confirms the first proof is useful.',
    'Important claims include source trace.',
    'Owner approves scope, price, and payment route before payment request.',
    'Private workspace starts only after payment proof.',
    'External sends, connector writes, credentialed browser actions, and payment actions stay approval-gated.',
  ]
  const nonIncluded = [
    'No unmanaged autonomous external actions.',
    'No production connector writeback before owner acceptance.',
    'No revenue claim before payment proof.',
    'No private client workspace before approved scope and payment proof.',
  ]
  const packet = [
    `# ${templateName} implementation blueprint`,
    '',
    'Status: implementation_blueprint_ready',
    `Lead: ${record.lead_id || 'not set'}`,
    `Template: ${record.template_id || solutionRoute.template_id || 'custom'}`,
    `Delivery lane: ${solutionRoute.delivery_lane || 'custom_workcell'}`,
    `First proof: ${proofTarget}`,
    `Price hint: ${record.price_hint || solutionRoute.price_hint || 'quote after proof review'}`,
    '',
    '## Modules',
    ...modules.map((item) => `- ${item}`),
    '',
    '## Roles',
    ...roleMatrix.map((item) => `- ${item.role}: ${item.responsibility}`),
    '',
    '## Source contract',
    ...dataContract.map((item) => `- ${item.source}: ${item.access_state}; ${item.writeback}`),
    '',
    '## Delivery plan',
    ...deliveryPlan.map((item) => `- ${item.phase}: ${item.output}`),
    '',
    '## Acceptance gates',
    ...acceptanceGates.map((item) => `- [ ] ${item}`),
    '',
    '## Not included until approved',
    ...nonIncluded.map((item) => `- ${item}`),
    '',
    '## Enterprise controls',
    '- Source trace on important outputs.',
    '- Role separation for owner, operator, SuperMega operator, and agent worker.',
    '- Approval queue before send/write/payment/browser actions.',
    '- Value ledger before recurring revenue claims.',
    '',
    '## Guardrails',
    '- No external send without owner approval.',
    '- No connector write without owner approval.',
    '- No payment action without owner approval.',
    '- Real MRR remains 0 until payment proof is recorded.',
  ].join('\n')

  return {
    status: 'implementation_blueprint_ready',
    pack_type: 'implementation_blueprint_pack',
    lead_id: record.lead_id || '',
    template_id: record.template_id || solutionRoute.template_id || '',
    template_name: templateName,
    delivery_lane: solutionRoute.delivery_lane || 'custom_workcell',
    service_model: 'managed_ai_workcell',
    first_proof_target: proofTarget,
    source_requests: sourceRequests,
    modules,
    role_matrix: roleMatrix,
    data_contract: dataContract,
    delivery_plan: deliveryPlan,
    acceptance_gates: acceptanceGates,
    non_included: nonIncluded,
    approval_boundary: 'owner approval before send/write/payment actions',
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    payment_action_state: 'blocked_until_owner_approval',
    workspace_state: 'not_created_until_payment_proof',
    real_mrr_delta: 0,
    intake_status: intakeJob.status || null,
    packet,
  }
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

function deskposPipelineTarget() {
  return envText('DESKPOS_PIPELINE_URL') || 'https://pos.supermega.dev/api/pipeline-leads'
}

function deskposPipelineStatus() {
  return {
    status: 'ready',
    mode: 'public_contact_to_deskpos_queue',
    target: deskposPipelineTarget(),
  }
}

function isSafeDeskposPipelineUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.pathname === '/api/pipeline-leads' &&
      ['pos.supermega.dev', 'spa-desk-pilot.vercel.app'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

function isDeskposLead(record) {
  const productText = [
    record.requested_package,
    record.public_package,
    record.product_area,
    record.first_output,
    record.workflow,
    record.page_path,
    record.source_url,
  ].join(' ').toLowerCase()
  return /deskpos|point of sale|pos \+ inventory|restaurant pos|restaurant-pos|storedesk|counterline|counter app|service-desk-pos|easypos/.test(productText)
}

function deskposVertical(record) {
  const blob = [
    record.company,
    record.requested_package,
    record.product_area,
    record.workflow,
    record.goal,
    record.data,
  ].join(' ').toLowerCase()
  for (const [vertical, pattern] of [
    ['spa', /\bspa\b/],
    ['salon', /\bsalon\b/],
    ['retail', /\b(retail|shop|store)\b/],
    ['cafe', /\b(cafe|coffee)\b/],
    ['restaurant', /\b(restaurant|bar|food|menu)\b/],
    ['clinic', /\bclinic\b/],
    ['gym', /\bgym\b/],
    ['pharmacy', /\bpharmacy\b/],
    ['school', /\bschool\b/],
    ['laundry', /\blaundry\b/],
    ['repair', /\brepair\b/],
  ]) {
    if (pattern.test(blob)) return vertical
  }
  return 'other'
}

function deskposPipelinePayload(record) {
  return {
    businessName: record.company || record.name,
    contact: [record.email, record.phone].filter(Boolean).join(' / '),
    notes: truncate([
      record.lead_id ? `Lead ${record.lead_id}` : '',
      record.requested_package,
      record.goal,
      record.source_links ? `Source: ${record.source_links}` : '',
    ].filter(Boolean).join(' | '), 500),
    source: 'supermega-public-site',
    stage: 'lead',
    submittedAt: record.submitted_at,
    vertical: deskposVertical(record),
  }
}

async function forwardDeskposPipeline({ record }) {
  if (!isDeskposLead(record)) {
    return { status: 'skipped', reason: 'not_deskpos_lead' }
  }
  const target = deskposPipelineTarget()
  if (!isSafeDeskposPipelineUrl(target)) {
    return { status: 'skipped', reason: 'unsafe_deskpos_pipeline_url' }
  }
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(deskposPipelinePayload(record)),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.accepted === false) {
      return { status: 'error', reason: `deskpos_${response.status}`, target }
    }
    return {
      status: 'ready',
      target,
      lead_count: body.leadCount ?? null,
      deskpos_lead_id: body.lead?.id || null,
    }
  } catch (error) {
    return { status: 'error', reason: text(error?.message) || 'deskpos_forward_failed', target }
  }
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

function listFromText(value) {
  return text(value)
    .split(/\r?\n|[|;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function defaultProofAcceptanceTests(record) {
  return [
    `Produces: ${record.first_proof_target || record.first_output || record.requested_package || 'First useful output'}`,
    'Uses only approved sample sources on the first run.',
    'Shows source trace for every important number, record, or recommendation.',
    'Keeps every external action in approval-only mode until the owner signs off.',
  ]
}

function buildSourceToScreenOrder(record = {}) {
  const workcellId = text(record.source_to_screen_workcell_id)
  const workcellName = text(record.source_to_screen_workcell_name)
  const sourceHash = text(record.source_to_screen_source_hash)
  const proofTarget = text(record.source_to_screen_proof_target)
  const orderPacket = text(record.source_to_screen_order_packet)
  const freeLoadPolicy = text(record.source_to_screen_free_load_policy) || 'browser_only_until_contact'
  if (!workcellId && !workcellName && !sourceHash && !proofTarget && !orderPacket) return null
  const costBoundary = {
    plan: 'free',
    execution_mode: freeLoadPolicy,
    server_run_allowed: false,
    llm_calls_allowed: false,
    model_tier_allowed: 'none',
    customer_pii_to_model: false,
    tenant_training_allowed: false,
    external_action_allowed: false,
    paid_upgrade_trigger: 'owner_approves_first_proof_pilot',
    approval_gate: 'owner_approval_required_before_send_write_payment',
  }
  const executionRoute = {
    crew_slug: 'source-to-screen-pilot',
    crew_name: 'Source-to-Screen Pilot',
    minimum_plan: 'pilot',
    route_status: 'paid_pilot_required',
    free_fallback: 'browser-only draft and order packet',
    paid_pilot_scope: 'Turn the approved Source-to-Screen packet into a source-traced first proof with an owner approval queue.',
    first_run_mode: 'approval_only',
  }
  const resolvedWorkcellName = workcellName || workcellId || 'Source-to-Screen workcell'
  const resolvedProofTarget = proofTarget || record.first_proof_target || record.first_output || 'Confirm first proof target from Source-to-Screen draft.'
  const resolvedPacket = orderPacket || [
    '# AI Workcell Pilot order packet',
    '',
    `workcell_template: ${resolvedWorkcellName}`,
    `workcell_id: ${workcellId || 'unknown'}`,
    `source_hash: ${sourceHash || 'missing'}`,
    `free_load_policy: ${freeLoadPolicy}`,
    'real_mrr_delta: 0',
    '',
    `proof_target: ${resolvedProofTarget}`,
  ].join('\n')
  return {
    status: 'source_to_screen_order_attached',
    workcell_id: workcellId || '',
    workcell_name: resolvedWorkcellName,
    source_hash: sourceHash || '',
    proof_target: resolvedProofTarget,
    free_load_policy: freeLoadPolicy,
    cost_boundary: costBoundary,
    execution_route: executionRoute,
    order_packet: resolvedPacket,
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    payment_request_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
  }
}

function buildPilotCrewRunSheet(sourceToScreenOrder) {
  if (!sourceToScreenOrder) return null
  return {
    status: 'pilot_run_sheet_ready',
    crew_slug: 'source-to-screen-pilot',
    crew_name: 'Source-to-Screen Pilot',
    minimum_plan: 'pilot',
    execution_mode: 'approval_only',
    source_hash: sourceToScreenOrder.source_hash || '',
    workcell_id: sourceToScreenOrder.workcell_id || '',
    workcell_name: sourceToScreenOrder.workcell_name || 'Source-to-Screen workcell',
    proof_target: sourceToScreenOrder.proof_target || 'Build one source-traced first proof.',
    role_sequence: ['intake', 'proof-builder', 'approval-pack'],
    input_contract: ['source-to-screen order packet', 'approved sample source', 'source hash', 'proof target', 'owner acceptance rule'],
    output_contract: ['source_trace', 'first_proof', 'approval_queue', 'required_sources', 'blocked_actions', 'paid_pilot_scope'],
    blocked_actions: ['external_send', 'connector_write', 'browser_or_mobile_action', 'payment_request', 'workspace_activation'],
    operator_steps: [
      'Verify the source pack is owner-approved and matches the source hash.',
      'Build one source-traced first proof from approved sources only.',
      'Prepare the owner approval queue with blocked actions separated from draft outputs.',
      'Wait for owner acceptance before send/write/payment/workspace activation.',
    ],
    real_mrr_delta: 0,
  }
}

function buildIntakeJob(record, acceptanceTests = []) {
  const templateName = record.public_package || record.requested_package || record.template_id || 'Custom SUPERMEGA template'
  const sourceToScreenOrder = buildSourceToScreenOrder(record)
  const runtimeWorkcell = runtimeWorkcellCatalog[text(record.template_id)] || null
  const proofTarget = sourceToScreenOrder?.proof_target || record.first_proof_target || record.first_output || record.requested_package || 'First useful output'
  const sourceManifest = [
    {
      source_type: 'buyer_goal',
      status: record.goal ? 'provided' : 'missing',
      value: record.goal || 'ASK_BUYER_FOR_FIRST_WORKFLOW_GOAL',
    },
    {
      source_type: 'sample_sources',
      status: record.source_links || record.source_file_names ? 'provided' : 'missing',
      value: record.source_links || record.source_file_names || 'ASK_BUYER_FOR_ONE_SAMPLE_FILE_FOLDER_SCREENSHOT_EXPORT_OR_EMAIL_THREAD',
    },
    ...(sourceToScreenOrder ? [{
      source_type: 'source_to_screen_order_packet',
      status: 'provided',
      value: sourceToScreenOrder.order_packet,
      source_hash: sourceToScreenOrder.source_hash,
      workcell_id: sourceToScreenOrder.workcell_id,
    }] : []),
    {
      source_type: runtimeWorkcell ? 'runtime_contract' : 'starter_kit',
      status: record.starter_kit_url || runtimeWorkcell ? 'provided' : 'missing',
      value: record.starter_kit_url || (runtimeWorkcell ? `runtime-workcell:${runtimeWorkcell.template_id}` : (record.template_id ? `/site/agent-templates/${record.template_id}.json` : 'SELECT_TEMPLATE_STARTER_KIT')),
    },
    {
      source_type: 'approval_boundary',
      status: 'provided',
      value: record.automation_boundary || 'Approval required before external sends, connector writes, payment actions, or live record edits.',
    },
  ]
  const missingInputs = sourceManifest
    .filter((item) => item.status === 'missing')
    .map((item) => item.source_type)
  const firstRunSteps = [
    'Read the starter kit and buyer goal.',
    'Open only the approved sample sources.',
    'Extract the minimum facts needed for the first proof.',
    `Draft the first proof: ${proofTarget}`,
    'Attach source trace and acceptance-test status.',
    'Queue buyer reply and pilot close packet for owner review.',
  ]
  const packet = [
    `# ${templateName} intake-to-first-proof job`,
    '',
    `Lead: ${record.lead_id || 'not set'}`,
    `Company: ${record.company || record.name || 'not set'}`,
    `Template: ${record.template_id || 'custom'}`,
    `First proof: ${proofTarget}`,
    `Job state: ${missingInputs.length ? 'needs_source_before_build' : 'ready_for_first_proof_build'}`,
    '',
    '## Source manifest',
    ...sourceManifest.map((item) => `- ${item.source_type}: ${item.status} - ${item.value}`),
    '',
    '## First run steps',
    ...firstRunSteps.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Acceptance tests',
    ...(acceptanceTests.length ? acceptanceTests : defaultProofAcceptanceTests(record)).map((item) => `- [ ] ${item}`),
    '',
    '## Approval boundary',
    '- No external send without owner approval.',
    '- No connector write without owner approval.',
    '- No payment action without owner approval.',
    '- Real MRR stays 0 until payment proof is recorded.',
  ].join('\n')

  return {
    status: missingInputs.length ? 'needs_source_before_build' : 'ready_for_first_proof_build',
    job_type: 'intake_to_first_proof',
    lead_id: record.lead_id || '',
    template_id: record.template_id || '',
    template_name: templateName,
    product_area: record.product_area || '',
    first_proof_target: proofTarget,
    owner: record.owner || 'Revenue Pod',
    source_manifest: sourceManifest,
    missing_inputs: missingInputs,
    first_run_steps: firstRunSteps,
    acceptance_tests: acceptanceTests.length ? acceptanceTests : defaultProofAcceptanceTests(record),
    approval_boundary: 'owner approval before send/write/payment actions',
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    payment_action_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
    packet,
  }
}

function buildClientKickoffPack(record, intakeJob = {}) {
  const templateName = record.public_package || record.requested_package || record.template_id || 'Custom SUPERMEGA template'
  const proofTarget = record.first_proof_target || record.first_output || record.requested_package || 'First useful output'
  const missingInputs = Array.isArray(intakeJob.missing_inputs) ? intakeJob.missing_inputs : []
  const sourceRequests = missingInputs.length
    ? missingInputs.map((item) => `Provide ${item.replace(/_/g, ' ')} before the first proof run.`)
    : ['Approved sample source is enough to start the first proof run.']
  const kickoffSteps = [
    'Confirm the first proof target.',
    'Use only buyer-approved sample sources.',
    'Produce the first proof with source trace.',
    'Review acceptance tests with the owner.',
    'Only then discuss pilot scope, payment route, and private workspace.',
  ]
  const buyerMessage = [
    `Hi ${record.name || 'there'},`,
    '',
    `I received the ${templateName} setup for ${record.company || 'your business'}.`,
    '',
    `First proof: ${proofTarget}.`,
    '',
    'To start cleanly, please make sure the approved sample source is available. I will use it only for the first proof and will not send messages, write records, connect accounts, or take payment actions without owner approval.',
    '',
    'Next step: I will prepare the first proof packet with source trace and acceptance-test status for review.',
    '',
    'Swan',
    'SUPERMEGA.dev',
  ].join('\n')
  const operatorChecklist = [
    'Open the intake job packet.',
    ...sourceRequests,
    `Build the first proof: ${proofTarget}`,
    'Attach source trace for important claims.',
    'Copy buyer reply only after owner review.',
    'Keep payment and workspace actions blocked until explicit approval.',
  ]
  const packet = [
    `# ${templateName} client kickoff pack`,
    '',
    `Lead: ${record.lead_id || 'not set'}`,
    `Company: ${record.company || record.name || 'not set'}`,
    `Template: ${record.template_id || 'custom'}`,
    `Status: ${missingInputs.length ? 'waiting_for_minimum_source' : 'ready_for_first_proof'}`,
    `Price hint: ${record.price_hint || 'quote after proof review'}`,
    '',
    '## Buyer promise',
    `First useful output: ${proofTarget}`,
    '',
    '## What we need',
    ...sourceRequests.map((item) => `- ${item}`),
    '',
    '## First 48 hours',
    ...kickoffSteps.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Operator checklist',
    ...operatorChecklist.map((item) => `- [ ] ${item}`),
    '',
    '## Buyer reply draft',
    buyerMessage,
    '',
    '## Guardrails',
    '- No external send without owner approval.',
    '- No connector write without owner approval.',
    '- No payment action without owner approval.',
    '- No private workspace before payment proof.',
    '- Real MRR remains 0 until payment proof is recorded.',
  ].join('\n')

  return {
    status: missingInputs.length ? 'waiting_for_minimum_source' : 'ready_for_first_proof',
    pack_type: 'client_kickoff_pack',
    lead_id: record.lead_id || '',
    template_id: record.template_id || '',
    template_name: templateName,
    company: record.company || '',
    first_proof_target: proofTarget,
    price_hint: record.price_hint || '',
    source_requests: sourceRequests,
    first_48_hours: kickoffSteps,
    operator_checklist: operatorChecklist,
    buyer_reply_draft: buyerMessage,
    approval_boundary: 'owner approval before send/write/payment actions',
    payment_state: 'not_requested',
    workspace_state: 'not_created_until_payment_proof',
    real_mrr_delta: 0,
    packet,
  }
}

function buildContactSourcePackRequest(record) {
  const templateName = record.public_package || record.requested_package || 'AI Workcell Pilot'
  const company = record.company || record.name || 'client'
  const sourceToScreenOrder = buildSourceToScreenOrder(record)
  const firstProofTarget = sourceToScreenOrder?.proof_target || record.first_proof_target || record.first_output || record.requested_package || 'first useful proof'
  const intakeUrl = sourcePackIntakeUrl(record)
  const minimumSources = [
    ...(sourceToScreenOrder ? [{
      source_type: 'source_to_screen_order_packet',
      label: 'Source-to-Screen order packet',
      examples: ['free Source-to-Screen proof order packet'],
      required: false,
      already_provided: true,
      source_hash: sourceToScreenOrder.source_hash,
    }] : []),
    {
      source_type: 'gmail_or_chat',
      label: 'Customer messages',
      examples: ['Gmail thread', 'WhatsApp chat', 'Viber chat', 'Messenger screenshot'],
      required: true,
    },
    {
      source_type: 'spreadsheet_or_pos_export',
      label: 'Orders, sales, POS, or work list',
      examples: ['POS export', 'Google Sheet', 'Excel file', 'CSV sample'],
      required: true,
    },
    {
      source_type: 'process_note_or_screenshot',
      label: 'How the work is done today',
      examples: ['process note', 'screenshot', 'manual checklist', 'voice-note transcript'],
      required: true,
    },
  ]
  const clientMessage = [
    `Please send 3 approved source samples for the ${templateName} first proof.`,
    '',
    `Client: ${company}`,
    `First proof target: ${firstProofTarget}`,
    sourceToScreenOrder ? `Source-to-Screen workcell: ${sourceToScreenOrder.workcell_name}` : '',
    sourceToScreenOrder?.source_hash ? `Source hash: ${sourceToScreenOrder.source_hash}` : '',
    `Source-pack intake link: ${intakeUrl}`,
    '',
    'Minimum source pack:',
    '1. One customer message/thread.',
    '2. One order, sales, POS, spreadsheet, or work-list export.',
    '3. One process note, screenshot, checklist, or example of how the work is done today.',
    '',
    'This creates a first-proof packet only. No external sends, connector writes, browser/mobile actions, payment requests, workspace access, or revenue claims happen without owner approval.',
  ].join('\n')

  return {
    status: 'source_pack_request_ready',
    request_type: 'client_source_pack_intake',
    lead_id: record.lead_id,
    action_id: record.task_id,
    template_name: templateName,
    company,
    first_proof_target: firstProofTarget,
    source_to_screen_order: sourceToScreenOrder,
    intake_url: intakeUrl,
    minimum_sources: minimumSources,
    client_message: clientMessage,
    source_pack_json_template: {
      source_pack_name: `${company} source pack`,
      lead_id: record.lead_id,
      action_id: record.task_id,
      sources: minimumSources.map((item, index) => ({
        source_id: `SRC-${String(index + 1).padStart(2, '0')}`,
        source_type: item.source_type,
        reference: item.label,
        content: '',
        approved: true,
      })),
    },
    external_action_state: 'blocked_until_owner_approval',
    connector_write_state: 'blocked_until_owner_approval',
    browser_action_state: 'blocked_until_owner_approval',
    payment_request_state: 'blocked_until_owner_approval',
    approval_required: true,
    human_gate: 'owner approval before send/write/payment/browser actions',
    real_mrr_delta: 0,
  }
}

function buildOwnerOnboardingAlert(record, sourcePackRequest) {
  const route = buildSolutionRoute(record)
  const intakeUrl = sourcePackRequest?.intake_url || sourcePackIntakeUrl(record)
  const sourceToScreenOrder = buildSourceToScreenOrder(record)
  const pilotCrewRunSheet = buildPilotCrewRunSheet(sourceToScreenOrder)
  const message = [
    `New AI Workcell Pilot lead: ${record.lead_id}`,
    `Buyer: ${record.name || 'Unknown'} - ${record.company || 'Unknown company'}`,
    `Package: ${record.public_package || record.requested_package || 'AI Workcell Pilot'}`,
    `Route: ${route.package_name} / ${route.delivery_lane}`,
    `First proof: ${record.first_proof_target || record.first_output || 'First useful proof'}`,
    pilotCrewRunSheet ? `Pilot crew: ${pilotCrewRunSheet.crew_slug} (${pilotCrewRunSheet.minimum_plan})` : '',
    pilotCrewRunSheet ? `Run sheet: ${pilotCrewRunSheet.role_sequence.join(' -> ')} / ${pilotCrewRunSheet.execution_mode}` : '',
    pilotCrewRunSheet ? `Blocked actions: ${pilotCrewRunSheet.blocked_actions.join(', ')}` : '',
    `Source pack room: ${intakeUrl}`,
    `Operator: ${operatorConsoleUrl()}`,
    'Owner action: send source request only after approval.',
    'Guardrail: no external sends, connector writes, payment requests, workspace access, or revenue claims until owner/payment proof gates pass.',
  ].join('\n')

  return {
    status: 'owner_alert_ready',
    alert_type: 'ai_workcell_source_pack_room',
    lead_id: record.lead_id,
    action_id: record.task_id,
    source_pack_intake_url: intakeUrl,
    operator_console_url: operatorConsoleUrl(),
    pilot_crew_run_sheet: pilotCrewRunSheet,
    message,
    external_action_state: 'draft_only_no_send',
    connector_write_state: 'blocked_until_owner_approval',
    payment_request_state: 'blocked_until_owner_approval',
    real_mrr_delta: 0,
  }
}

function buildFirstProofTaskPayload(record) {
  const solutionRoute = buildSolutionRoute(record)
  const routedRecord = recordWithSolutionRoute(record, solutionRoute)
  const runtimeWorkcell = runtimeWorkcellCatalog[text(routedRecord.template_id)] || null
  const sourceToScreenOrder = buildSourceToScreenOrder(routedRecord)
  const acceptanceTests = listFromText(routedRecord.acceptance_tests)
  const proofTarget = sourceToScreenOrder?.proof_target || routedRecord.first_proof_target || routedRecord.first_output || routedRecord.requested_package || 'First useful output'
  const starterKitUrl = routedRecord.starter_kit_url || (!runtimeWorkcell && routedRecord.template_id ? `/site/agent-templates/${routedRecord.template_id}.json` : '')
  const templateName = routedRecord.public_package || routedRecord.requested_package || routedRecord.template_id || 'Custom SUPERMEGA template'
  const intakeJob = buildIntakeJob(routedRecord, acceptanceTests)
  const workcellActivationHandoff = buildRuntimeWorkcellActivationHandoff(routedRecord, solutionRoute, intakeJob)
  const clientKickoffPack = buildClientKickoffPack(routedRecord, intakeJob)
  const implementationBlueprintPack = buildImplementationBlueprintPack(routedRecord, solutionRoute, intakeJob)
  const sourcePackRequest = buildContactSourcePackRequest(routedRecord)
  const ownerOnboardingAlert = buildOwnerOnboardingAlert(routedRecord, sourcePackRequest)
  const pilotCrewRunSheet = buildPilotCrewRunSheet(sourceToScreenOrder)
  const sourceSummary = [
    routedRecord.source_links ? `source links: ${routedRecord.source_links}` : '',
    routedRecord.source_file_count ? `file count: ${routedRecord.source_file_count}` : '',
    routedRecord.source_file_names ? `files: ${routedRecord.source_file_names}` : '',
  ].filter(Boolean).join('; ')
  const operatorBrief = [
    `${templateName} first proof for ${routedRecord.company || routedRecord.name || routedRecord.email}.`,
    `Goal: ${routedRecord.goal || 'Confirm the workflow and produce the first proof.'}`,
    `Recommended route: ${solutionRoute.package_name} (${solutionRoute.delivery_lane}).`,
    sourceToScreenOrder ? `Source-to-Screen: ${sourceToScreenOrder.workcell_name}.` : '',
    sourceToScreenOrder?.source_hash ? `Source hash: ${sourceToScreenOrder.source_hash}.` : '',
    `First proof: ${proofTarget}.`,
    starterKitUrl ? `Starter kit: ${starterKitUrl}.` : '',
    workcellActivationHandoff ? `Activation handoff: ${workcellActivationHandoff.status}; ${workcellActivationHandoff.manifest_file}.` : '',
    sourceSummary ? `Sources: ${sourceSummary}.` : 'Sources: request the minimum sample sources before building.',
    `Boundary: ${routedRecord.automation_boundary || 'Approval required before external sends, connector writes, payment actions, or live record edits.'}`,
  ].filter(Boolean).join('\n')

  return {
    type: 'first_proof_build',
    status: 'queued',
    template_id: routedRecord.template_id || '',
    template_status: routedRecord.template_status || '',
    template_name: templateName,
    starter_kit_url: starterKitUrl,
    product_area: routedRecord.product_area || '',
    source_category: routedRecord.template_source_category || '',
    source_area: routedRecord.template_source_area || '',
    price_hint: routedRecord.price_hint || '',
    first_proof_target: proofTarget,
    operator_brief: truncate(operatorBrief, 2200),
    solution_route: solutionRoute,
    intake_job: intakeJob,
    client_kickoff_pack: clientKickoffPack,
    implementation_blueprint_pack: implementationBlueprintPack,
    workcell_activation_handoff: workcellActivationHandoff,
    source_pack_request: sourcePackRequest,
    source_pack_request_packet: sourcePackRequest.client_message,
    source_pack_request_json: JSON.stringify(sourcePackRequest, null, 2),
    source_to_screen_order: sourceToScreenOrder,
    pilot_crew_run_sheet: pilotCrewRunSheet,
    owner_onboarding_alert: ownerOnboardingAlert,
    source_trace: intakeJob.source_manifest
      .filter((item) => item.status === 'provided')
      .map((item) => `${item.source_type}: ${item.value}`),
    checklist: [
      starterKitUrl ? `Open starter kit: ${starterKitUrl}` : 'Confirm the selected template and starter kit.',
      'Review buyer goal, company context, source links, and attached file manifest.',
      'Request the smallest missing sample needed to prove the first output.',
      `Build the first proof: ${proofTarget}`,
      'Return the proof with source trace, acceptance-test status, and exact next approval request.',
      'Do not send, write, charge, or edit live business records without owner approval.',
    ],
    acceptance_tests: acceptanceTests.length ? acceptanceTests : defaultProofAcceptanceTests(record),
    approval_required: true,
    human_gate: 'owner approval before send/write/payment actions',
    real_mrr_delta: 0,
  }
}

function pipelineActionPayload(record) {
  const firstProofTask = buildFirstProofTaskPayload(record)
  return {
    action_id: record.task_id,
    lead_id: record.lead_id,
    task_id: record.task_id,
    action_type: 'lead_followup',
    status: 'queued',
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
      lead: {
        lead_id: record.lead_id,
        task_id: record.task_id,
        submitted_at: record.submitted_at,
        name: record.name,
        email: record.email,
        phone: record.phone,
        company: record.company,
        workflow: record.workflow,
        goal: record.goal,
        requested_package: record.requested_package,
        first_output: record.first_output,
        lead_score: record.lead_score,
        lead_stage: record.lead_stage,
        status: record.status || 'new',
        next_step: record.next_step,
      },
      lead_score: record.lead_score,
      lead_stage: record.lead_stage,
      requested_package: record.requested_package,
      first_output: record.first_output,
      product_area: record.product_area,
      solution_route: firstProofTask.solution_route,
      template_id: record.template_id,
      template_status: record.template_status,
      template_source_category: record.template_source_category,
      template_source_area: record.template_source_area,
      starter_kit_url: record.starter_kit_url,
      price_hint: record.price_hint,
      entitlement_free_core: record.entitlement_free_core,
      entitlement_paid_pilot: record.entitlement_paid_pilot,
      entitlement_premium: record.entitlement_premium,
      entitlement_gated_hands: record.entitlement_gated_hands,
      entitlement_gate: record.entitlement_gate,
      source_file_count: record.source_file_count,
      public_package: record.public_package,
      first_proof_target: record.first_proof_target,
      source_to_screen_order: firstProofTask.source_to_screen_order,
      pilot_crew_run_sheet: firstProofTask.pilot_crew_run_sheet,
      implementation_blueprint_pack: firstProofTask.implementation_blueprint_pack,
      workcell_activation_handoff: firstProofTask.workcell_activation_handoff,
      source_pack_request: firstProofTask.source_pack_request,
      source_pack_request_packet: firstProofTask.source_pack_request_packet,
      source_pack_request_json: firstProofTask.source_pack_request_json,
      owner_onboarding_alert: firstProofTask.owner_onboarding_alert,
      acceptance_tests: record.acceptance_tests,
      launch_blockers: record.launch_blockers,
      automation_boundary: record.automation_boundary,
      access_policy: record.access_policy,
      workspace_status: record.workspace_status,
      utm_source: record.utm_source,
      utm_medium: record.utm_medium,
      utm_campaign: record.utm_campaign,
      first_proof_task: firstProofTask,
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
      const blobFallback = await blobQueue.savePipelineAction(payload)
      if (blobFallback.status === 'ready') return { ...blobFallback, primary_error: postgres }
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
    return blobQueue.savePipelineAction(payload)
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

    const blobFallback = await blobQueue.savePipelineAction(payload)
    if (blobFallback.status === 'ready') return { ...blobFallback, primary_error: { status: 'error', reason: `supabase_${response.status}` } }
    return {
      status: 'error',
      reason: `supabase_${response.status}`,
      table: 'supermega_pipeline_actions',
      hint: 'run_supermega_pipeline_actions_schema',
    }
  } catch (error) {
    const blobFallback = await blobQueue.savePipelineAction(payload)
    if (blobFallback.status === 'ready') return { ...blobFallback, primary_error: { status: 'error', reason: error.message || 'supabase_failed' } }
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
  const templateId = truncate(payload.template_id, 100)
  const templateStatus = truncate(payload.template_status, 80)
  const templateSourceCategory = truncate(payload.template_source_category, 120)
  const templateSourceArea = truncate(payload.template_source_area, 160)
  const starterKitUrl = truncate(payload.starter_kit_url, 240)
  const priceHint = truncate(payload.price_hint, 120)
  const entitlementFreeCore = truncate(payload.entitlement_free_core, 700)
  const entitlementPaidPilot = truncate(payload.entitlement_paid_pilot, 700)
  const entitlementPremium = truncate(payload.entitlement_premium, 700)
  const entitlementGatedHands = truncate(payload.entitlement_gated_hands, 700)
  const entitlementGate = truncate(payload.entitlement_gate, 700)
  const sourceFileNames = truncate(payload.source_file_names, 1200)
  const sourceFileCount = truncate(payload.source_file_count, 20)
  const onboardingStage = truncate(payload.onboarding_stage, 80) || 'source_review'
  const accessPolicy = truncate(payload.access_policy, 120) || 'approval_required'
  const workspaceStatus = truncate(payload.workspace_status, 120) || 'not_created_until_approved'
  const urgency = truncate(payload.urgency, 120)
  const team = truncate(payload.team, 500) || truncate(payload.first_team, 500) || truncate(payload.team_size, 500)
  const intakeData = [
    truncate(payload.data, 500),
    templateId ? `Template: ${templateId}` : '',
    templateStatus ? `Template status: ${templateStatus}` : '',
    templateSourceCategory ? `Template source category: ${templateSourceCategory}` : '',
    templateSourceArea ? `Template source area: ${templateSourceArea}` : '',
    starterKitUrl ? `Starter kit: ${starterKitUrl}` : '',
    priceHint ? `Price hint: ${priceHint}` : '',
    entitlementFreeCore ? `Entitlement free core: ${entitlementFreeCore}` : '',
    entitlementPaidPilot ? `Entitlement paid pilot: ${entitlementPaidPilot}` : '',
    entitlementPremium ? `Entitlement premium: ${entitlementPremium}` : '',
    entitlementGatedHands ? `Entitlement gated hands: ${entitlementGatedHands}` : '',
    entitlementGate ? `Entitlement gate: ${entitlementGate}` : '',
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
    template_id: templateId,
    template_status: templateStatus,
    template_source_category: templateSourceCategory,
    template_source_area: templateSourceArea,
    starter_kit_url: starterKitUrl,
    price_hint: priceHint,
    entitlement_free_core: entitlementFreeCore,
    entitlement_paid_pilot: entitlementPaidPilot,
    entitlement_premium: entitlementPremium,
    entitlement_gated_hands: entitlementGatedHands,
    entitlement_gate: entitlementGate,
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
  const route = buildSolutionRoute(record)
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
    ['Template', record.template_id],
    ['Recommended route', `${route.package_name} / ${route.delivery_lane}`],
    ['Route first proof', route.first_proof_target],
    ['Template source', [record.template_source_category, record.template_source_area].filter(Boolean).join(' / ')],
    ['Starter kit', record.starter_kit_url],
    ['Source pack room', sourcePackIntakeUrl(record)],
    ['Operator console', operatorConsoleUrl()],
    ['Owner action', 'Open the operator console, run the queue, then produce the first proof before any external send/write/payment action.'],
    ['Price hint', record.price_hint],
    ['Free core entitlement', record.entitlement_free_core],
    ['Paid pilot entitlement', record.entitlement_paid_pilot],
    ['Premium maintained entitlement', record.entitlement_premium],
    ['Gated hands entitlement', record.entitlement_gated_hands],
    ['Entitlement gate', record.entitlement_gate],
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
      signal: AbortSignal.timeout(8000),
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

  try {
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
      signal: AbortSignal.timeout(8000),
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
  } catch {
    return { status: 'error', reason: 'confirmation_timeout', to: record.email }
  }
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
      signal: AbortSignal.timeout(8000),
    })
    await response.text()
    // Do not echo raw upstream webhook response back to the client.
    return response.ok ? { status: 'ready', code: response.status } : { status: 'error', reason: `webhook_${response.status}` }
  } catch (error) {
    return { status: 'error', reason: error.message || 'webhook_failed' }
  }
}

function opsIntakeTarget() {
  return envText('SUPERMEGA_OPS_INTAKE_URL') || 'https://supermega-machine.vercel.app/api/intake'
}

function isSafeOpsIntakeUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'supermega-machine.vercel.app' &&
      url.pathname === '/api/intake' &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function opsIntakeStatus() {
  const target = opsIntakeTarget()
  const configured = Boolean(envText('SUPERMEGA_INTAKE_SECRET'))
  return {
    status: configured && isSafeOpsIntakeUrl(target) ? 'ready' : 'needs_configuration',
    target,
    contract: 'body_secret',
  }
}

async function forwardOpsIntake({ record }) {
  const intakeSecret = envText('SUPERMEGA_INTAKE_SECRET')
  if (!intakeSecret) return { status: 'skipped', reason: 'ops_intake_not_configured' }

  const target = opsIntakeTarget()
  if (!isSafeOpsIntakeUrl(target)) {
    return { status: 'skipped', reason: 'unsafe_ops_intake_url' }
  }

  const workflow = truncate([
    record.template_id ? `Template: ${record.template_id}` : '',
    record.starter_kit_url ? `Starter kit: ${record.starter_kit_url}` : '',
    record.requested_package ? `Package: ${record.requested_package}` : '',
    record.first_proof_target ? `First proof: ${record.first_proof_target}` : '',
    record.price_hint ? `Price hint: ${record.price_hint}` : '',
    record.entitlement_free_core ? `Free core entitlement: ${record.entitlement_free_core}` : '',
    record.entitlement_paid_pilot ? `Paid pilot entitlement: ${record.entitlement_paid_pilot}` : '',
    record.entitlement_premium ? `Premium maintained entitlement: ${record.entitlement_premium}` : '',
    record.entitlement_gated_hands ? `Gated hands entitlement: ${record.entitlement_gated_hands}` : '',
    record.entitlement_gate ? `Entitlement gate: ${record.entitlement_gate}` : '',
    record.goal || '',
    record.data || '',
  ].filter(Boolean).join('\n'), 2400)

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${intakeSecret}`,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        secret: intakeSecret,
        source: 'website',
        external_id: record.lead_id,
        name: record.name,
        email: record.email,
        phone: record.phone,
        company: record.company,
        business_type: record.template_source_category || record.product_area || record.requested_package || 'inbound',
        template_id: record.template_id,
        starter_kit_url: record.starter_kit_url,
        price_hint: record.price_hint,
        workflow,
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.ok === false) {
      return { status: 'error', reason: `ops_intake_${response.status}`, target }
    }
    return {
      status: 'ready',
      target,
      lead_id: text(body.lead_id) || null,
      duplicate: body.duplicate === true,
      fit_score: Number.isFinite(Number(body.fit_score)) ? Number(body.fit_score) : null,
    }
  } catch (error) {
    return { status: 'error', reason: text(error?.message) || 'ops_intake_failed', target }
  }
}

// Build the concise CEO lead-alert text, then push it via the shared Telegram helper.
// Best-effort: the helper never throws and skips cleanly when TELEGRAM_* isn't configured.
function telegramLeadMessage(record) {
  const route = buildSolutionRoute(record)
  const sourceToScreenOrder = buildSourceToScreenOrder(record)
  const pilotCrewRunSheet = buildPilotCrewRunSheet(sourceToScreenOrder)
  const company = record.company || record.name || 'Unknown'
  const goal = (record.goal || record.workflow || '').slice(0, 280)
  const score = record.lead_score || 0
  const pkg = record.requested_package || ''
  const proofTarget = record.first_proof_target || record.first_output || record.requested_package || 'First useful proof'
  const starterKitUrl = absolutePublicUrl(record.starter_kit_url)
  const setupUrl = absolutePublicUrl(record.page_path || record.source_url)
  const sourcePackUrl = sourcePackIntakeUrl(record)
  const consoleUrl = operatorConsoleUrl()
  const sheetUrl = text(process.env.SUPERMEGA_LEAD_SHEET_URL)
  return [
    `New setup lead - ${record.lead_id}`,
    `Buyer: ${record.name} - ${company}`,
    `Contact: ${record.email}${record.phone ? ' / ' + record.phone : ''}`,
    pkg && pkg !== 'General enquiry' ? `Package: ${pkg}` : '',
    record.template_id ? `Template: ${record.template_id}` : '',
    `Route: ${route.package_name} / ${route.delivery_lane}`,
    `Score: ${score} - ${record.lead_stage || 'needs_discovery'}`,
    `Goal: ${goal}`,
    `First proof: ${proofTarget}`,
    pilotCrewRunSheet ? `Pilot crew: ${pilotCrewRunSheet.crew_slug}` : '',
    sourceToScreenOrder?.source_hash ? `Source hash: ${sourceToScreenOrder.source_hash}` : '',
    pilotCrewRunSheet ? `Blocked: ${pilotCrewRunSheet.blocked_actions.join(', ')}` : '',
    starterKitUrl ? `Starter kit: ${starterKitUrl}` : '',
    setupUrl ? `Setup page: ${setupUrl}` : '',
    `Source pack room: ${sourcePackUrl}`,
    `Operator: ${consoleUrl}`,
    sheetUrl ? `Sheet: ${sheetUrl}` : '',
    `Next: ${record.next_step || 'Open operator console and build the first proof.'}`,
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

async function handler(req, res) {
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
        deskpos_pipeline: deskposPipelineStatus(),
        ops_intake: opsIntakeStatus(),
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
  const solutionRoute = buildSolutionRoute(record)
  const firstProofTask = buildFirstProofTaskPayload(record)
  const ledger = await saveLeadLedger({ record })
  const pipelineAction = await savePipelineAction({ record })
  const [webhook, deskposPipeline, opsIntake] = await Promise.all([
    postLeadWebhook({ record }),
    forwardDeskposPipeline({ record }),
    forwardOpsIntake({ record }),
  ])
  const [delivery, confirmation, telegram, sheets] = await Promise.all([
    sendEmail({ record }),
    sendConfirmationEmail({ record }),
    notifyTelegram({ record }),
    appendToGoogleSheet({ record }),
  ])

  // Email is a notification layer — only fail hard if the lead was not saved anywhere
  const leadSaved = ledger.status === 'ready' || pipelineAction.status === 'ready'
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
    solution_route: solutionRoute,
    source_pack_request: firstProofTask.source_pack_request,
    owner_onboarding_alert: firstProofTask.owner_onboarding_alert,
    delivery,
    ledger,
    pipeline_action: pipelineAction,
    deskpos_pipeline: deskposPipeline,
    ops_intake: opsIntake,
    webhook,
    confirmation,
    telegram,
    sheets,
    pipeline: {
      saved_count: ledger.status === 'ready' ? 1 : 0,
      saved_task_count: pipelineAction.status === 'ready' ? 1 : 0,
      email_routed_count: delivery.status === 'ready' ? 1 : 0,
      management_mode: ledger.status === 'ready' && pipelineAction.status === 'ready'
        ? 'database_queue'
        : pipelineAction.status === 'ready' && pipelineAction.adapter === 'vercel_blob'
          ? 'blob_action_queue'
          : 'email_fallback',
      datastore: pipelineAction.adapter || ledger.adapter || 'email_fallback',
      deskpos: deskposPipeline,
      ops_intake: opsIntake,
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
      solution_route: solutionRoute,
    },
  })
}

handler.__test = {
  buildSolutionRoute,
  buildRuntimeWorkcellActivationHandoff,
  buildImplementationBlueprintPack,
  buildFirstProofTaskPayload,
  buildClientKickoffPack,
  buildIntakeJob,
  buildContactSourcePackRequest,
  buildOwnerOnboardingAlert,
  pipelineActionPayload,
  telegramLeadMessage,
  operatorConsoleUrl,
  forwardOpsIntake,
  isSafeOpsIntakeUrl,
  opsIntakeStatus,
}

module.exports = handler
