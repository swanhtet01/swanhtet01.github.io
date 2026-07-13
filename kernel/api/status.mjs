// SUPERMEGA kernel — PUBLIC status surface. GET /api/status returns a secret-safe, at-a-glance
// health snapshot of the whole platform brain so an operator can confirm it's working WITHOUT the
// ops key: data-spine reachability, connector inventory (counts + registration faults), AI provider
// failover chain, Agent Company plan-only readiness, and money-layer configuration booleans. No
// secret VALUES, PII, evidence, assignments, or per-connector detail. 200 when healthy, 503 when not.
import {
  MAX_CYCLE_AGENTS,
  MAX_CYCLE_ROLE_BUDGET,
  planCompanyCycle,
} from '../agent-company.mjs'
import connectors, { registrationErrors } from '../connectors/index.mjs'
import gateway from '../gateway.mjs'
import store from '../store.mjs'

const env = (name) => Boolean(String(process.env[name] || '').trim())
const withTimeout = async (promise, ms, fallback) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const AGENT_COMPANY_PROBE = Object.freeze({
  clientId: 'status-self-test',
  cycleId: 'status-self-test',
  agents: ['operations-analyst'],
  evidence: {
    'operations-analyst': 'Synthetic status probe. No customer data, account access, or credentials.',
  },
  roleBudget: MAX_CYCLE_ROLE_BUDGET,
})

async function agentCompanyStatus(plan) {
  let result
  try { result = await withTimeout(plan(AGENT_COMPANY_PROBE), 1000, null) }
  catch { result = null }
  const plannerReady = Boolean(
    result?.ok
      && result.mode === 'plan'
      && result.actionMode === 'draft_only'
      && result.approvalRequired === true
      && result.assignments?.length === 1
      && result.budget?.selectedAgents === 1
      && result.budget?.plannedRoles > 0
      && result.budget.plannedRoles <= MAX_CYCLE_ROLE_BUDGET
      && result.controls?.execution === 'sequential'
      && result.controls.dynamicDelegation === false
      && result.controls.crossAgentContext === false
      && result.controls.externalWrites === false
      && result.controls.durableClaimRequired === true
  )
  return {
    plannerReady,
    actionMode: plannerReady ? 'draft_only' : 'unavailable',
    maxAgents: MAX_CYCLE_AGENTS,
    maxRoleBudget: MAX_CYCLE_ROLE_BUDGET,
    probeMode: 'plan_only',
    modelRequest: false,
    durableClaimCreated: false,
    externalWrites: plannerReady ? false : null,
  }
}

export async function buildStatus(options = {}) {
  const t0 = Date.now()

  // Data spine reachability (bounded so a hung DB can't hang the probe).
  let db
  try { db = await withTimeout(store.ping(), 2500, { ok: false, mode: store.mode, detail: 'ping_timeout' }) }
  catch (e) { db = { ok: false, mode: store.mode, detail: String((e && e.message) || 'ping_error').slice(0, 120) } }

  // Connector inventory — cheap (config-only, no paid health probes here).
  const list = connectors.list()
  const byCategory = {}
  for (const c of list) byCategory[c.category] = (byCategory[c.category] || 0) + 1
  const configured = list.filter((c) => c.configured).length
  const regErrors = registrationErrors.length

  // AI gateway provider chain (env-derived, cheap).
  const providers = gateway.providerChain().map((p) => p.name)

  // Fixed synthetic plan only: no model call, durable claim, provider write, or secret.
  const agentCompany = await agentCompanyStatus(options.planCompanyCycle || planCompanyCycle)

  const money = {
    stripe_configured: env('STRIPE_SECRET_KEY'),
    stripe_webhook_configured: env('STRIPE_WEBHOOK_SECRET'),
    kbzpay_configured: env('KBZPAY_APP_SECRET') || env('KBZPAY_MERCHANT_ID'),
    wavepay_configured: env('WAVEPAY_SECRET_KEY') || env('WAVEPAY_MERCHANT_ID'),
  }

  const ok = Boolean(db.ok) && regErrors === 0 && agentCompany.plannerReady
  return {
    ok,
    service: 'supermega-kernel',
    time: new Date().toISOString(),
    db,
    connectors: { total: list.length, configured, registrationErrors: regErrors, byCategory },
    ai: { providers, primary: providers[0] || null, failover: providers.length > 1 },
    agentCompany,
    money,
    latency_ms: Date.now() - t0,
  }
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') { res.status(405).json({ ok: false, reason: 'method_not_allowed' }); return }
  let body
  try { body = await buildStatus() }
  catch (e) { body = { ok: false, service: 'supermega-kernel', error: String((e && e.message) || 'status_error').slice(0, 160) } }
  res.setHeader('Cache-Control', 'no-store')
  res.status(body.ok ? 200 : 503).json(body)
}
