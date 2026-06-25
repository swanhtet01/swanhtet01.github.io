const { existsSync, readFileSync } = require('fs')
const { join, resolve } = require('path')
const { createHash, timingSafeEqual } = require('crypto')

// Constant-time secret comparison. Hashes both sides to fixed-length buffers so
// timingSafeEqual never throws on length mismatch and no length is leaked.
function safeEqual(a, b) {
  const ah = createHash('sha256').update(String(a)).digest()
  const bh = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ah, bh)
}

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

function boolEnv(...names) {
  return names.some((name) => Boolean(text(process.env[name])))
}

function paymentLinkEnvCount() {
  return Object.entries(process.env).filter(([key, value]) => /^STRIPE_PAYMENT_LINK_/i.test(key) && /^https:\/\/(?:buy|checkout|pay)\.stripe\.com\//i.test(text(value))).length
}

function readActivationPacket() {
  const candidates = [
    join(__dirname, 'product-activation-readiness.json'),
    resolve(process.cwd(), 'api-static', 'site', 'product-activation-readiness.json'),
    resolve(process.cwd(), 'showroom', 'public', 'site', 'product-activation-readiness.json'),
    resolve(process.cwd(), '.vercel', 'output', 'static', 'site', 'product-activation-readiness.json'),
  ]

  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return null
    }
  }
  return null
}

function fallbackPacket() {
  return {
    status: 'ready',
    activation_state: 'quote_ready_runtime_activation_pending',
    readiness: {
      client_setup: { status: 'ready' },
      quote_and_checkout: { status: 'ready', quote_ready: true, checkout_ready: false },
      pipeline_and_ledger: { status: 'blocked', runtime_status: 'not_configured' },
      agent_safety: { status: 'ready', policy: 'approval_required_before_external_send_write_payment_connector_or_deploy' },
    },
    product_activation_matrix: [
      { id: 'build-app-from-workflow', product_name: 'Custom Workflow App', setup_route: '/contact/?package=build-app-from-workflow' },
      { id: 'factory-issues-maintenance-quality', product_name: 'Factory Operations App', setup_route: '/contact/?package=factory-issues-maintenance-quality' },
      { id: 'restaurant-pos-menu-inventory', product_name: 'Restaurant POS + Inventory', setup_route: '/contact/?package=restaurant-pos-menu-inventory' },
    ],
  }
}

function deriveActivationQueue(packet) {
  if (Array.isArray(packet.product_activation_queue)) return packet.product_activation_queue
  return (Array.isArray(packet.product_activation_matrix) ? packet.product_activation_matrix : []).map((product) => ({
    id: product.id,
    product_name: product.product_name,
    status: product.status,
    setup_route: product.setup_route,
    next_operator_action: 'Collect source examples, owner approval rule, rollback/export path, and first proof packet before production rollout.',
    required_sources: product.first_sources || [],
    setup_questions: product.setup_questions || [],
    acceptance_tests: product.acceptance_tests || [],
    proof_required: product.first_proof_target || 'One source-first proof packet and one working screen.',
    go_live_blockers: product.launch_blockers || [],
  }))
}

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    res.end()
    return
  }

  // Auth guard — fail CLOSED. Deny when the ops key is unset (misconfiguration)
  // and require a constant-time match when it is set.
  const opsKey = text(process.env.SUPERMEGA_OPS_KEY)
  if (!opsKey) {
    json(res, 503, { status: 'error', reason: 'auth_not_configured' })
    return
  }
  const authHeader = req.headers['authorization'] || ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!provided || !safeEqual(provided, opsKey)) {
    json(res, 401, { status: 'error', reason: 'unauthorized' })
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { status: 'error', reason: 'method_not_allowed' })
    return
  }

  const packet = readActivationPacket() || fallbackPacket()
  const postgresConfigured = boolEnv(
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'DATABASE_URL_POSTGRES_URL',
    'DATABASE_URL_POSTGRES_URL_NON_POOLING',
    'DATABASE_URL_POSTGRES_PRISMA_URL',
    'SUPERMEGA_DATABASE_URL',
  )
  const paymentLinks = paymentLinkEnvCount()
  const fallbackConfigured = boolEnv('RESEND_API_KEY', 'SUPERMEGA_LEAD_WEBHOOK_URL')
  const activationQueue = deriveActivationQueue(packet)
  const runtimeBlockers = [
    postgresConfigured ? '' : 'Set POSTGRES_URL or DATABASE_URL for the lead ledger and product activation queue.',
    fallbackConfigured ? '' : 'Set RESEND_API_KEY or SUPERMEGA_LEAD_WEBHOOK_URL for fallback lead notification.',
    ...activationQueue.flatMap((item) => (Array.isArray(item.go_live_blockers) ? item.go_live_blockers.map((blocker) => `${item.product_name}: ${blocker}`) : [])),
  ].filter(Boolean)

  json(res, 200, {
    status: 'ready',
    endpoint: 'product-activation',
    generated_at: new Date().toISOString(),
    activation_state: packet.activation_state,
    product_count: Array.isArray(packet.product_activation_matrix) ? packet.product_activation_matrix.length : 0,
    product_activation_matrix: packet.product_activation_matrix,
    product_activation_queue: activationQueue,
    readiness: packet.readiness,
    integration_contract: packet.integration_contract,
    runtime_activation: {
      state: runtimeBlockers.length ? 'blocked_until_setup_complete' : 'ready_for_approved_go_live',
      blocker_count: runtimeBlockers.length,
      blockers: runtimeBlockers,
      next_command: postgresConfigured ? 'npm run smoke:checkout' : 'npm run db:lead-ledger:schema',
    },
    runtime_environment: {
      postgres_configured: postgresConfigured,
      stripe_payment_link_env_count: paymentLinks,
      stripe_secret_configured: boolEnv('STRIPE_SECRET_KEY', 'STRIPE_API_KEY'),
      lead_fallback_configured: fallbackConfigured,
      secret_values_redacted: true,
    },
    public_files: packet.public_urls || {
      readiness_json: 'https://supermega.dev/site/product-activation-readiness.json',
      products: 'https://supermega.dev/products',
      contact: 'https://supermega.dev/contact',
    },
  })
}
