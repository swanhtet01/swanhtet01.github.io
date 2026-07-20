const crypto = require('crypto')

const defaultAllowedOrigins = 'https://supermega.dev,https://www.supermega.dev'
const rateLimitWindowMs = Number(process.env.SUPERMEGA_CHECKOUT_RATE_WINDOW_MS || 15 * 60 * 1000)
const rateLimitMax = Number(process.env.SUPERMEGA_CHECKOUT_RATE_MAX || 10)
const rateStore = globalThis.__supermegaCheckoutRateStore || new Map()
globalThis.__supermegaCheckoutRateStore = rateStore

const agentOpsCheckoutPlanIds = new Set([
  'agentops-readiness-audit',
  'single-agent-tool-deployment',
  'agentops-deployment-sprint',
  'managed-agentops',
  'agency-white-label-agentops',
  'enterprise-agent-control-layer',
])

// Mirrors workspace pricing.json public display: MMK only on public SuperMega surfaces.
const priceLabels = {
  toolWeek: '2,500,000 MMK',
  dashboard: '8,000,000 MMK',
  aiAgent: '11,000,000 MMK',
  designShip: '25,000,000 MMK',
  managedYear: '3,900,000 MMK / yr',
  quoteAfterProof: 'Quote after proof review',
}

const plans = [
  ['workflow-diagnostic', 'Workflow Diagnostic', priceLabels.toolWeek, ['workflow-scan', 'diagnostic']],
  [
    'agentops-readiness-audit',
    'AgentOps Readiness Audit',
    priceLabels.toolWeek,
    ['agentops', 'agentops-toolbox', 'agent-readiness-audit', 'ai-back-office', 'ai-agent-operator', 'back-office-operator', 'openclaw'],
  ],
  [
    'single-agent-tool-deployment',
    'Single Agent Tool Deployment',
    priceLabels.aiAgent,
    ['agent-tool-deployment', 'single-agent-deployment', 'one-agent-tool'],
  ],
  [
    'agentops-deployment-sprint',
    'AgentOps Toolbox Deployment Sprint',
    priceLabels.aiAgent,
    ['agentops-sprint', 'agentops-toolbox-deployment', 'deployment-sprint'],
  ],
  [
    'managed-agentops',
    'Managed AgentOps',
    priceLabels.managedYear,
    ['managed-agentops-retainer', 'agentops-retainer'],
  ],
  [
    'agency-white-label-agentops',
    'Agency White-Label AgentOps',
    priceLabels.quoteAfterProof,
    ['white-label-agentops', 'agency-agentops'],
  ],
  [
    'enterprise-agent-control-layer',
    'Enterprise Agent Control Layer',
    priceLabels.quoteAfterProof,
    ['agent-control-layer', 'enterprise-agentops'],
  ],
  [
    'starter-sprint',
    'Starter Sprint',
    priceLabels.dashboard,
    [
      'restaurant-os',
      'service-business-os',
      'portal-factory',
      'starter',
      'build-app-from-workflow',
      'custom-workflow-app',
      'workflow-product',
      'workflow-app',
      'restaurant-pos-menu-inventory',
      'restaurant-pos-inventory',
      'restaurant-pos',
      'pos-inventory',
    ],
  ],
  [
    'business-os-pilot',
    'Business OS Pilot',
    priceLabels.designShip,
    [
      'industrial-os',
      'plant-os',
      'business-os',
      'factory-issues-maintenance-quality',
      'factory-operations-app',
      'factory-issue-maintenance-tracker',
      'factory-maintenance-quality-app',
    ],
  ],
  ['enterprise-ai-workspace', 'Enterprise AI Workspace', priceLabels.quoteAfterProof, ['enterprise-workspace', 'ai-workspace']],
  ['managed-ai-ops', 'Managed AI Ops', priceLabels.managedYear, ['managed-ops', 'ai-ops']],
].map(([id, name, priceLabel, aliases = []]) => ({
  id,
  name,
  price_label: priceLabel,
  aliases,
  price_env: `STRIPE_PRICE_${id.toUpperCase().replace(/-/g, '_')}`,
  payment_link_env: `STRIPE_PAYMENT_LINK_${id.toUpperCase().replace(/-/g, '_')}`,
  contact_package: agentOpsCheckoutPlanIds.has(id) ? 'agentops-toolbox' : id,
}))

const publicProductSetupContracts = [
  {
    package: 'build-app-from-workflow',
    product: 'Custom Solutions & AI Agents',
    checkout_plan: 'starter-sprint',
    first_source: 'one messy spreadsheet, inbox, form, or approval queue',
    acceptance_test: 'A client can open the queue, inspect source evidence, change status, and see the next action without SuperMega staff.',
  },
  {
    package: 'factory-issues-maintenance-quality',
    product: 'Factory Operations App',
    checkout_plan: 'business-os-pilot',
    first_source: 'maintenance log, quality issue sheet, receiving record, asset list, or WCM board',
    acceptance_test: 'A manager can move an issue from source to owner decision to evidence-backed closure with approval gates intact.',
  },
  {
    package: 'restaurant-pos-menu-inventory',
    product: 'DeskPOS',
    checkout_plan: 'starter-sprint',
    first_source: 'menu, item list, shift close sheet, payment proof, or stock count',
    acceptance_test: 'A cashier or owner can review menu, orders, payment proof, stock movement, and daily close from one screen.',
  },
  {
    package: 'agentops-toolbox',
    product: 'AI Back Office Operator',
    checkout_plan: 'agentops-readiness-audit',
    first_source: 'inbox, spreadsheet, CRM export, support queue, research task, or admin process',
    acceptance_test: 'An owner can inspect the agent work queue, source proof, blocked actions, approval policy, and first runbook before any external send or system write.',
  },
]

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

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function html(res, statusCode, title, message, href, cta = 'Continue') {
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
  :root { color-scheme: dark; font-family: Aptos, "Segoe UI", system-ui, sans-serif; --line:rgba(255,255,255,.16); --text:#f6fbff; --muted:#a9b8c7; --cyan:#72f3ff; --blue:#4f8cff; --ink:#06101d; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 82% 8%, rgba(114,243,255,.18), transparent 28rem), linear-gradient(135deg, #07111f, #02050b); color:var(--text); }
  main { width:min(620px, calc(100% - 32px)); border:1px solid var(--line); border-radius:28px; background:rgba(255,255,255,.07); padding:clamp(24px,5vw,42px); box-shadow:0 34px 90px rgba(0,0,0,.34); }
  h1 { margin:0 0 14px; font-size:clamp(42px,8vw,82px); line-height:.86; letter-spacing:-.075em; }
  p { margin:0; color:var(--muted); font-size:18px; line-height:1.55; }
  a { display:inline-flex; margin-top:24px; border-radius:999px; background:linear-gradient(135deg,var(--cyan),var(--blue)); color:var(--ink); padding:13px 18px; font-weight:900; text-decoration:none; }
</style>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <a href="${escapeHtml(href)}">${escapeHtml(cta)}</a>
</main>
</html>`)
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
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 50000) {
        reject(new Error('request_too_large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      const contentType = text(req.headers['content-type']).toLowerCase()
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

function isHtmlFormRequest(req) {
  return text(req.headers['content-type']).toLowerCase().includes('application/x-www-form-urlencoded')
}

function clientIp(req) {
  return text(req.headers['x-forwarded-for']).split(',')[0].trim() || text(req.socket?.remoteAddress) || 'unknown'
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

function normalizePlanId(value) {
  return text(value)
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function findPlan(payload) {
  const requested = normalizePlanId(payload.plan_id || payload.package || payload.requested_package || payload.product || payload.offer || 'starter-sprint')
  return (
    plans.find((plan) => plan.id === requested) ||
    plans.find((plan) => normalizePlanId(plan.name) === requested) ||
    plans.find((plan) => (plan.aliases || []).some((alias) => normalizePlanId(alias) === requested)) ||
    plans[1]
  )
}

function publicBaseUrl(req) {
  const configured = envText('SUPERMEGA_PUBLIC_BASE_URL', 'NEXT_PUBLIC_SITE_URL').replace(/\/$/, '')
  if (configured) return configured
  const origin = text(req.headers.origin)
  if (origin && isAllowedOrigin(origin)) return origin.replace(/\/$/, '')
  return 'https://supermega.dev'
}

function quoteUrl(req, plan, payload = {}) {
  const url = new URL('/contact/', publicBaseUrl(req))
  url.searchParams.set('package', contactPackageForPayload(payload, plan))
  url.searchParams.set('source', 'checkout-handoff')
  url.searchParams.set('billing', 'quote')
  const email = text(payload.email)
  const company = text(payload.company)
  if (email) url.searchParams.set('email', email.slice(0, 180))
  if (company) url.searchParams.set('company', company.slice(0, 180))
  return url.toString()
}

function contactPackageForPayload(payload, plan) {
  const requested = normalizePlanId(payload.package || payload.requested_package || payload.product || payload.offer || payload.plan_id || '')
  if (publicProductSetupContracts.some((contract) => contract.package === requested)) {
    return requested
  }
  return plan.contact_package
}

function successUrl(req, plan) {
  const url = new URL('/contact/', publicBaseUrl(req))
  url.searchParams.set('package', plan.contact_package)
  url.searchParams.set('source', 'stripe-success')
  url.searchParams.set('checkout', 'success')
  return url.toString()
}

function cancelUrl(req, plan) {
  const url = new URL('/pricing/', publicBaseUrl(req))
  url.searchParams.set('package', plan.contact_package)
  url.searchParams.set('checkout', 'cancelled')
  return url.toString()
}

function paymentLink(plan) {
  const value = envText(plan.payment_link_env)
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return ''
    if (!['buy.stripe.com', 'checkout.stripe.com', 'pay.stripe.com'].includes(url.hostname)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function priceId(plan) {
  const value = envText(plan.price_env)
  return /^price_[A-Za-z0-9_]+$/.test(value) ? value : ''
}

function stripeSecret() {
  const value = envText('STRIPE_SECRET_KEY', 'STRIPE_API_KEY')
  return /^sk_(test|live)_[A-Za-z0-9_]+$/.test(value) ? value : ''
}

function safeEmail(value) {
  const email = text(value).toLowerCase()
  return email.includes('@') && email.length <= 180 ? email : ''
}

async function createCheckoutSession({ plan, payload, req }) {
  const secret = stripeSecret()
  const price = priceId(plan)
  if (!secret || !price) {
    return { status: 'not_configured' }
  }

  const body = new URLSearchParams()
  body.set('mode', 'payment')
  body.set('line_items[0][price]', price)
  body.set('line_items[0][quantity]', '1')
  body.set('success_url', successUrl(req, plan))
  body.set('cancel_url', cancelUrl(req, plan))
  body.set('client_reference_id', `sm_${plan.id}_${crypto.randomBytes(6).toString('hex')}`)
  body.set('metadata[plan_id]', plan.id)
  body.set('metadata[package]', plan.contact_package)
  body.set('metadata[source]', text(payload.source) || 'public_pricing')
  const requestedPlan = normalizePlanId(payload.plan_id || payload.package || payload.requested_package || payload.product || payload.offer || '')
  if (requestedPlan && requestedPlan !== plan.id) body.set('metadata[requested_plan]', requestedPlan)
  const email = safeEmail(payload.email)
  if (email) body.set('customer_email', email)

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(Number(process.env.SUPERMEGA_STRIPE_TIMEOUT_MS || 15000)),
  })
  const responseText = await response.text()
  let parsed = {}
  try {
    parsed = responseText ? JSON.parse(responseText) : {}
  } catch {
    parsed = {}
  }
  if (!response.ok || !parsed.url) {
    return {
      status: 'error',
      reason: `stripe_${response.status}`,
      detail: text(parsed.error?.message || parsed.error?.type || responseText).slice(0, 180),
    }
  }
  return {
    status: 'ready',
    checkout_url: parsed.url,
    session_id: text(parsed.id),
  }
}

function planStatus(plan) {
  const link = paymentLink(plan)
  const price = priceId(plan)
  return {
    id: plan.id,
    name: plan.name,
    price_label: plan.price_label,
    aliases: plan.aliases || [],
    contact_package: plan.contact_package,
    price_env: plan.price_env,
    payment_link_env: plan.payment_link_env,
    price_configured: Boolean(price),
    payment_link_configured: Boolean(link),
    checkout_capable: Boolean(link || (stripeSecret() && price)),
  }
}

module.exports = async function handler(req, res) {
  cors(req, res)

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
    const planStatuses = plans.map(planStatus)
    json(res, 200, {
      status: 'ready',
      endpoint: 'checkout-start',
      checkout_endpoint_ready: true,
      quote_fallback_ready: true,
      setup_packet_ready: true,
      stripe_secret_configured: Boolean(stripeSecret()),
      payment_link_configured_count: planStatuses.filter((plan) => plan.payment_link_configured).length,
      checkout_capable_count: planStatuses.filter((plan) => plan.checkout_capable).length,
      default_plan_id: 'starter-sprint',
      plans: planStatuses,
      product_setup_contracts: publicProductSetupContracts,
      safety_policy: {
        no_secret_output: true,
        checkout_activation: 'human_approved_price_or_payment_link_required',
        fallback: 'quote_intake',
      },
    })
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
    json(res, 400, { status: 'error', reason: error.message || 'invalid_request' })
    return
  }

  const plan = findPlan(payload)
  const link = paymentLink(plan)
  if (link) {
    if (isHtmlFormRequest(req)) {
      res.statusCode = 303
      res.setHeader('Location', link)
      res.end()
      return
    }
    json(res, 200, {
      status: 'checkout_ready',
      mode: 'stripe_payment_link',
      plan: planStatus(plan),
      checkout_url: link,
    })
    return
  }

  const session = await createCheckoutSession({ plan, payload, req })
  if (session.status === 'ready') {
    if (isHtmlFormRequest(req)) {
      res.statusCode = 303
      res.setHeader('Location', session.checkout_url)
      res.end()
      return
    }
    json(res, 200, {
      status: 'checkout_ready',
      mode: 'stripe_checkout_session',
      plan: planStatus(plan),
      checkout_url: session.checkout_url,
      session_id: session.session_id,
    })
    return
  }

  const fallback = quoteUrl(req, plan, payload)
  if (isHtmlFormRequest(req)) {
    html(
      res,
      200,
      'Quote required first.',
      'This package is ready to sell, but self-serve payment is locked until Stripe price IDs or payment links are approved.',
      fallback,
      'Send workflow request',
    )
    return
  }

  json(res, 200, {
    status: 'quote_required',
    reason: session.status === 'error' ? 'stripe_checkout_failed' : 'stripe_checkout_not_configured',
    plan: planStatus(plan),
    checkout_attempt: session.status === 'error' ? { status: 'error', reason: session.reason, detail: session.detail } : { status: 'not_configured' },
    quote_url: fallback,
    next_step: 'Send the workflow and source sample. SuperMega confirms scope, price, and payment route before checkout.',
  })
}
