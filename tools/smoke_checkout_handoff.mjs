import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const handler = require('../api/checkout-start.js')

const envKeysToClear = [
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'STRIPE_PRICE_WORKFLOW_DIAGNOSTIC',
  'STRIPE_PRICE_AGENTOPS_READINESS_AUDIT',
  'STRIPE_PRICE_SINGLE_AGENT_TOOL_DEPLOYMENT',
  'STRIPE_PRICE_AGENTOPS_DEPLOYMENT_SPRINT',
  'STRIPE_PRICE_MANAGED_AGENTOPS',
  'STRIPE_PRICE_AGENCY_WHITE_LABEL_AGENTOPS',
  'STRIPE_PRICE_ENTERPRISE_AGENT_CONTROL_LAYER',
  'STRIPE_PRICE_STARTER_SPRINT',
  'STRIPE_PRICE_BUSINESS_OS_PILOT',
  'STRIPE_PRICE_ENTERPRISE_AI_WORKSPACE',
  'STRIPE_PRICE_MANAGED_AI_OPS',
  'STRIPE_PAYMENT_LINK_WORKFLOW_DIAGNOSTIC',
  'STRIPE_PAYMENT_LINK_AGENTOPS_READINESS_AUDIT',
  'STRIPE_PAYMENT_LINK_SINGLE_AGENT_TOOL_DEPLOYMENT',
  'STRIPE_PAYMENT_LINK_AGENTOPS_DEPLOYMENT_SPRINT',
  'STRIPE_PAYMENT_LINK_MANAGED_AGENTOPS',
  'STRIPE_PAYMENT_LINK_AGENCY_WHITE_LABEL_AGENTOPS',
  'STRIPE_PAYMENT_LINK_ENTERPRISE_AGENT_CONTROL_LAYER',
  'STRIPE_PAYMENT_LINK_STARTER_SPRINT',
  'STRIPE_PAYMENT_LINK_BUSINESS_OS_PILOT',
  'STRIPE_PAYMENT_LINK_ENTERPRISE_AI_WORKSPACE',
  'STRIPE_PAYMENT_LINK_MANAGED_AI_OPS',
]

for (const key of envKeysToClear) {
  delete process.env[key]
}

function callHandler({ method = 'GET', url = '/api/checkout-start/status', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [body] : [])
    req.method = method
    req.url = url
    req.headers = {
      origin: 'https://supermega.dev',
      'content-type': body ? 'application/json' : '',
      ...headers,
    }
    req.socket = { remoteAddress: '127.0.0.1' }

    let responseBody = ''
    const res = new Writable({
      write(chunk, _encoding, callback) {
        responseBody += chunk.toString()
        callback()
      },
    })
    res.statusCode = 200
    res.headers = {}
    res.setHeader = (name, value) => {
      res.headers[String(name).toLowerCase()] = value
    }
    res.getHeader = (name) => res.headers[String(name).toLowerCase()]
    res.end = (chunk = '') => {
      if (chunk) responseBody += chunk.toString()
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: responseBody,
      })
    }

    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function parseJson(response) {
  try {
    return JSON.parse(response.body)
  } catch {
    throw new Error(`response_not_json=${response.statusCode}:${response.body.slice(0, 120)}`)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const statusResponse = await callHandler()
const status = parseJson(statusResponse)
assert(statusResponse.statusCode === 200, `status_code_unexpected=${statusResponse.statusCode}`)
assert(status.status === 'ready', 'status_endpoint_not_ready')
assert(status.checkout_endpoint_ready === true, 'checkout_endpoint_ready_missing')
assert(status.quote_fallback_ready === true, 'quote_fallback_not_ready')
assert(status.setup_packet_ready === true, 'setup_packet_not_ready')
assert(status.stripe_secret_configured === false, 'smoke_must_not_use_real_stripe_secret')
assert(Array.isArray(status.plans) && status.plans.length >= 5, 'checkout_plans_missing')
assert(status.plans.some((plan) => plan.id === 'agentops-readiness-audit'), 'agentops_readiness_plan_missing')
assert(status.plans.some((plan) => plan.payment_link_env === 'STRIPE_PAYMENT_LINK_AGENTOPS_READINESS_AUDIT'), 'agentops_payment_link_env_missing')
const statusText = JSON.stringify(status)
assert(!/\bUSD\b|\$\s?\d/.test(statusText), 'checkout_status_contains_non_mmk_price_label')
assert(status.plans.some((plan) => plan.price_label === '11,000,000 MMK'), 'checkout_ai_agent_mmk_price_missing')
assert(
  Array.isArray(status.product_setup_contracts) &&
    status.product_setup_contracts.some((contract) => contract.package === 'build-app-from-workflow') &&
    status.product_setup_contracts.some((contract) => contract.package === 'factory-issues-maintenance-quality') &&
    status.product_setup_contracts.some((contract) => contract.package === 'restaurant-pos-menu-inventory') &&
    status.product_setup_contracts.some((contract) => contract.package === 'agentops-toolbox'),
  'product_setup_contracts_missing',
)
assert(
  status.product_setup_contracts.some((contract) => contract.product === 'Custom Solutions & AI Agents') &&
    status.product_setup_contracts.some((contract) => contract.product === 'Shop'),
  'checkout_contract_canonical_product_names_missing',
)
assert(!status.product_setup_contracts.some((contract) => contract.product === 'Custom Workflow App'), 'checkout_contract_retired_product_name_found')

const fallbackResponse = await callHandler({
  method: 'POST',
  url: '/api/checkout-start',
  body: JSON.stringify({
    plan_id: 'starter-sprint',
    email: 'buyer@example.com',
    company: 'Example Buyer',
  }),
})
const fallback = parseJson(fallbackResponse)
assert(fallbackResponse.statusCode === 200, `fallback_status_unexpected=${fallbackResponse.statusCode}`)
assert(fallback.status === 'quote_required', `fallback_status_unexpected=${fallback.status}`)
assert(fallback.reason === 'stripe_checkout_not_configured', `fallback_reason_unexpected=${fallback.reason}`)
assert(fallback.quote_url.includes('/contact/'), 'fallback_quote_url_missing_contact')
assert(!/sk_live_|sk_test_|whsec_/i.test(JSON.stringify(fallback)), 'fallback_leaked_secret_like_value')

const productFallbackResponse = await callHandler({
  method: 'POST',
  url: '/api/checkout-start',
  body: JSON.stringify({
    package: 'build-app-from-workflow',
    email: 'buyer@example.com',
    company: 'Example Buyer',
  }),
})
const productFallback = parseJson(productFallbackResponse)
assert(productFallbackResponse.statusCode === 200, `product_fallback_status_unexpected=${productFallbackResponse.statusCode}`)
assert(productFallback.status === 'quote_required', `product_fallback_status_unexpected=${productFallback.status}`)
assert(productFallback.plan.id === 'starter-sprint', `product_fallback_plan_unexpected=${productFallback.plan.id}`)
assert(productFallback.quote_url.includes('package=build-app-from-workflow'), 'product_fallback_lost_public_package')
assert(!/sk_live_|sk_test_|whsec_/i.test(JSON.stringify(productFallback)), 'product_fallback_leaked_secret_like_value')

const agentOpsFallbackResponse = await callHandler({
  method: 'POST',
  url: '/api/checkout-start',
  body: JSON.stringify({
    package: 'agentops-toolbox',
    email: 'operator@example.com',
    company: 'Example Operator',
  }),
})
const agentOpsFallback = parseJson(agentOpsFallbackResponse)
assert(agentOpsFallbackResponse.statusCode === 200, `agentops_fallback_status_unexpected=${agentOpsFallbackResponse.statusCode}`)
assert(agentOpsFallback.status === 'quote_required', `agentops_fallback_status_unexpected=${agentOpsFallback.status}`)
assert(agentOpsFallback.plan.id === 'agentops-readiness-audit', `agentops_fallback_plan_unexpected=${agentOpsFallback.plan.id}`)
assert(agentOpsFallback.quote_url.includes('package=agentops-toolbox'), 'agentops_fallback_lost_public_package')
assert(!/sk_live_|sk_test_|whsec_/i.test(JSON.stringify(agentOpsFallback)), 'agentops_fallback_leaked_secret_like_value')

process.env.STRIPE_PAYMENT_LINK_STARTER_SPRINT = 'https://buy.stripe.com/test_supermega_handoff'
process.env.STRIPE_PAYMENT_LINK_BUSINESS_OS_PILOT = 'https://buy.stripe.com/test_supermega_business_os'
process.env.STRIPE_PAYMENT_LINK_AGENTOPS_READINESS_AUDIT = 'https://buy.stripe.com/test_agentops_readiness'
const paymentLinkResponse = await callHandler({
  method: 'POST',
  url: '/api/checkout-start',
  body: JSON.stringify({ plan_id: 'starter-sprint' }),
})
const paymentLink = parseJson(paymentLinkResponse)
assert(paymentLink.status === 'checkout_ready', `payment_link_status_unexpected=${paymentLink.status}`)
assert(paymentLink.mode === 'stripe_payment_link', `payment_link_mode_unexpected=${paymentLink.mode}`)
assert(paymentLink.checkout_url === 'https://buy.stripe.com/test_supermega_handoff', 'payment_link_url_unexpected')

const productAliasResponse = await callHandler({
  method: 'POST',
  url: '/api/checkout-start',
  body: JSON.stringify({ plan_id: 'industrial-os' }),
})
const productAlias = parseJson(productAliasResponse)
assert(productAlias.status === 'checkout_ready', `alias_status_unexpected=${productAlias.status}`)
assert(productAlias.plan.id === 'business-os-pilot', `alias_plan_unexpected=${productAlias.plan.id}`)
assert(productAlias.checkout_url === 'https://buy.stripe.com/test_supermega_business_os', 'alias_payment_link_unexpected')

const agentOpsPaymentLinkResponse = await callHandler({
  method: 'POST',
  url: '/api/checkout-start',
  body: JSON.stringify({ package: 'agentops-toolbox' }),
})
const agentOpsPaymentLink = parseJson(agentOpsPaymentLinkResponse)
assert(agentOpsPaymentLink.status === 'checkout_ready', `agentops_payment_link_status_unexpected=${agentOpsPaymentLink.status}`)
assert(agentOpsPaymentLink.mode === 'stripe_payment_link', `agentops_payment_link_mode_unexpected=${agentOpsPaymentLink.mode}`)
assert(agentOpsPaymentLink.plan.id === 'agentops-readiness-audit', `agentops_payment_link_plan_unexpected=${agentOpsPaymentLink.plan.id}`)
assert(agentOpsPaymentLink.plan.contact_package === 'agentops-toolbox', 'agentops_payment_link_contact_package_unexpected')
assert(agentOpsPaymentLink.checkout_url === 'https://buy.stripe.com/test_agentops_readiness', 'agentops_payment_link_url_unexpected')

console.log(
  JSON.stringify(
    {
      status: 'ready',
      audit: 'checkout-handoff',
      status_endpoint: status.status,
      fallback_status: fallback.status,
      payment_link_mode: paymentLink.mode,
      alias_plan: productAlias.plan.id,
      agentops_plan: agentOpsPaymentLink.plan.id,
      plan_count: status.plans.length,
      product_setup_contract_count: status.product_setup_contracts.length,
    },
    null,
    2,
  ),
)
