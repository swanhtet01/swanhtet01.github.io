// SUPERMEGA AI gateway — one interface in front of every model call.
// Zero-dependency (native fetch). Supports guarded local Ollama plus explicitly admitted paid providers.
//
// Why this exists: swapping a model, adding caching, or capping a client's spend should touch
// ONE file, not every caller. Every build agent, the Deal Desk, and the per-client operator
// call complete() — never the Anthropic SDK directly.

import { createHash, randomUUID } from 'node:crypto'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const OLLAMA_API_URL = 'http://127.0.0.1:11434/api/chat'
const OLLAMA_RESPONSE_MAX_BYTES = 1024 * 1024
const OLLAMA_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const LOCAL_LLAMA_MODELS = new Set(['llama3.2:1b', 'llama3.2:3b'])
const PROVIDER_POLICIES = new Set(['cloud-enabled', 'local-only'])

// Model tiers — change the model here, every caller follows. Claude primary, with a cross-PROVIDER
// fallback model (routed via OpenRouter) used only when Anthropic itself is unreachable, so a Claude
// outage doesn't take down every build agent / Deal Desk / operator. fallbackModel is a NON-Anthropic
// model on purpose (provider independence). Override per tier via env if needed.
export const TIERS = {
  bulk: { model: 'claude-haiku-4-5-20251001', maxTokens: 1024, fallbackModel: process.env.SUPERMEGA_OR_MODEL_BULK || 'openai/gpt-4o-mini' }, // classification, extraction, cheap volume
  reason: { model: 'claude-sonnet-4-6', maxTokens: 4096, fallbackModel: process.env.SUPERMEGA_OR_MODEL_REASON || 'openai/gpt-4o' }, // scoping, drafting — most work
  deep: { model: 'claude-opus-4-8', maxTokens: 8192, fallbackModel: process.env.SUPERMEGA_OR_MODEL_DEEP || 'openai/gpt-4o' }, // hard build reasoning
}
const FALLBACK = { deep: 'reason', reason: 'bulk', bulk: null }

// Per-client token ledger + response cache. In-memory per warm instance for speed; ALSO backed by
// the data spine (store.mjs) when credentials are present, so caps + caching survive cold starts and
// span every instance. The store is imported lazily so memory-mode/dev with no deps still works.
const ledger = new Map() // clientId -> { inTokens, outTokens, calls } (this instance, current process life)
const cache = new Map() // cacheKey -> { ...out, _exp }
const localSpendReservations = new Map() // reservationId -> fail-closed dispatch state
const localSpendCaps = new Map() // tenant::window -> immutable server-owned cap
const CACHE_TTL_MS = Number(process.env.SUPERMEGA_AI_CACHE_TTL_MS || 3_600_000) // 1h default; keys are tenant-scoped
const SPEND_RESERVATION_TTL_MS = Math.max(60_000, Number(process.env.SUPERMEGA_SPEND_RESERVATION_TTL_MS) || 900_000)
const MAX_PROVIDER_REQUEST_BYTES = Math.min(262_144, Math.max(4_096, Number(process.env.SUPERMEGA_MAX_PROVIDER_REQUEST_BYTES) || 131_072))
const PROVIDER_FRAMING_TOKEN_ALLOWANCE = 4_096
const REQUIRE_DURABLE_SPEND = process.env.SUPERMEGA_REQUIRE_DURABLE_SPEND === undefined
  ? process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  : String(process.env.SUPERMEGA_REQUIRE_DURABLE_SPEND) === '1'
const RESPONSE_CACHE_PREFIX = 'ai-response:v2:'
const RESPONSE_CACHE_POLICY_VERSION = 'gateway-policy:v1'
const RESERVED_CONTROL_CACHE_PREFIXES = [
  'agent-company:',
  'agent-company-sign-in-code:',
  'agent-company-operator-session:',
  'company-mission-record:',
  'company-work-order-record:',
  'company-work-order-review-record:',
  'company-work-order-evaluation:',
  'ceo-outcome-operation:',
  'ceo-outcome-evaluation:',
  'ceo-outcome-delivery:',
  'ceo-outcome-action:',
  'console-lead-review-record:',
]
const PLATFORM_TENANT_ID = 'supermega-platform'
const PLATFORM_PLAN = 'platform' // server-owned internal plan: requested tier honored, cap still enforced
const configuredDefaultCap = Number(process.env.SUPERMEGA_CLIENT_TOKEN_CAP || 150_000)
const DEFAULT_CAP_TOKENS = Number.isSafeInteger(configuredDefaultCap) && configuredDefaultCap > 0 ? configuredDefaultCap : 150_000

// Company-wide admission budget. Every provider attempt reserves a conservative upper-bound before
// network I/O, so concurrent tenants and retries cannot race past the daily ceiling. The environment
// may tune the default but can never raise it above the compiled hard maximum.
export const COMPANY_DAILY_BUDGET_DEFAULT_UNITS = 500_000
export const COMPANY_DAILY_BUDGET_HARD_MAX_UNITS = 2_000_000
const COMPANY_DAILY_BUDGET_ENV = 'SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS'
const REQUEST_TOKEN_OVERHEAD = 512
const localBudgetReservations = new Map()

// Cost weights per tier, relative to bulk (Haiku 4.5 = 1). Sonnet 4.6 is ~3x Haiku per token,
// Opus ~15x. The ledger stores COST-WEIGHTED (bulk-equivalent) tokens, so the monthly cap is a
// COST ceiling, not a raw-token ceiling: one Sonnet token burns 3 units of the cap. Free tenants
// only ever run bulk (weight 1), so for them cap units == raw tokens.
export const TIER_COST_WEIGHTS = { bulk: 1, reason: 3, deep: 15 }

export function companyDailyBudgetCap() {
  const raw = Number(process.env[COMPANY_DAILY_BUDGET_ENV])
  if (!Number.isFinite(raw) || raw <= 0) return COMPANY_DAILY_BUDGET_DEFAULT_UNITS
  return Math.min(Math.trunc(raw), COMPANY_DAILY_BUDGET_HARD_MAX_UNITS)
}

export function currentDailyBudgetWindow(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function boundedMaxTokens(requested, tier = 'reason') {
  const tierDef = TIERS[tier] || TIERS.reason
  const parsed = Math.trunc(Number(requested))
  if (!Number.isFinite(parsed) || parsed <= 0) return tierDef.maxTokens
  return Math.min(parsed, tierDef.maxTokens)
}

export function estimateCallBudgetUnits({ system = '', messages = [], schema = null, tier = 'reason', maxTokens } = {}) {
  const enforcedTier = TIERS[tier] ? tier : 'reason'
  const outputBound = boundedMaxTokens(maxTokens, enforcedTier)
  let serialized = ''
  try { serialized = JSON.stringify({ system, messages, schema }) || '' } catch { serialized = String(system || '') }
  const inputBound = new TextEncoder().encode(serialized).byteLength + REQUEST_TOKEN_OVERHEAD
  return Math.max(1, Math.ceil((inputBound + outputBound) * (TIER_COST_WEIGHTS[enforcedTier] || 1)))
}

// ---- Plan model (server-side) --------------------------------------------------------------------
// Tenants (supermega_console_clients) carry a `plan` column ('free' | 'pro' | ...). The plan is
// resolved HERE, server-side, per call — never trusted from the caller. Unknown tenants and failed
// lookups resolve to 'free' (fail closed): free = forced bulk (Haiku) tier + non-overridable
// default cap. Lookups are cached per warm instance for a few minutes.
export const FREE_PLAN = 'free'
const PLAN_CACHE_TTL_MS = Number(process.env.SUPERMEGA_PLAN_CACHE_TTL_MS || 300_000)
const planCache = new Map() // clientId -> { plan, exp }

export async function resolvePlan(clientId) {
  if (!clientId) return FREE_PLAN
  const hit = planCache.get(clientId)
  if (hit && Date.now() < hit.exp) return hit.plan
  let plan = FREE_PLAN
  const store = await spine()
  if (store?.getClient) {
    try {
      const c = await store.getClient(clientId)
      const p = String(c?.plan || '').trim().toLowerCase()
      if (p) plan = p
    } catch { /* lookup failure → stay 'free' (fail closed on cost) */ }
  }
  planCache.set(clientId, { plan, exp: Date.now() + PLAN_CACHE_TTL_MS })
  return plan
}

// Pure policy: the tier and server-configured cap a tenant on `plan` actually gets. Requests cannot
// raise or replace their own budget.
function configuredPlanCap(plan) {
  const envName = `SUPERMEGA_PLAN_CAP_${String(plan || FREE_PLAN).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  const configured = Number(process.env[envName])
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_CAP_TOKENS
}

export function policyFor(plan, { tier, capTokens } = {}) {
  const requested = tier && TIERS[tier] ? tier : 'reason'
  if (!plan || String(plan).toLowerCase() === FREE_PLAN) {
    return { plan: FREE_PLAN, tier: 'bulk', cap: DEFAULT_CAP_TOKENS, overridesRejected: Boolean((tier && tier !== 'bulk') || capTokens) }
  }
  const normalizedPlan = String(plan).toLowerCase()
  return { plan: normalizedPlan, tier: requested, cap: configuredPlanCap(normalizedPlan), overridesRejected: capTokens !== undefined }
}

// Persistent ledger/cache toggle. On by default; set SUPERMEGA_GATEWAY_PERSIST=0 to force pure in-memory.
const PERSIST = String(process.env.SUPERMEGA_GATEWAY_PERSIST ?? '1') !== '0'
let _store // lazily-loaded store.mjs module (null once we know it's unavailable)
async function spine() {
  if (!PERSIST) return null
  if (_store === undefined) {
    try { _store = (await import('./store.mjs')).default }
    catch { _store = null } // no store / no deps → silently fall back to in-memory
  }
  return _store
}

// Monthly window key in UTC, e.g. '2026-06'. The cap is a per-tenant monthly ceiling.
function currentWindow(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function hostedRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE || process.env.NODE_ENV === 'production')
}

function localReserveBudget({ reservationId, window, reservedUnits, capUnits }) {
  let usedUnits = 0
  for (const [id, row] of localBudgetReservations) {
    if (row.window !== window) {
      localBudgetReservations.delete(id)
      continue
    }
    if (row.window === window && row.status !== 'released') usedUnits += row.reservedUnits
  }
  if (usedUnits + reservedUnits > capUnits) {
    return { granted: false, durable: false, usedUnits, capUnits, reason: 'company_daily_budget_reached' }
  }
  localBudgetReservations.set(reservationId, { window, reservedUnits, status: 'reserved' })
  return { granted: true, durable: false, usedUnits: usedUnits + reservedUnits, capUnits }
}

async function reserveProviderBudget({ system, messages, schema, tier, maxTokens, clientId, provider }) {
  const reservationId = randomUUID()
  const window = currentDailyBudgetWindow()
  const reservedUnits = estimateCallBudgetUnits({ system, messages, schema, tier, maxTokens })
  const capUnits = companyDailyBudgetCap()
  const store = await spine()
  const result = store?.reserveAiBudget
    ? await store.reserveAiBudget({ reservationId, window, reservedUnits, capUnits, tenantId: clientId, tier, provider })
    : localReserveBudget({ reservationId, window, reservedUnits, capUnits })

  if (result?.granted && hostedRuntime() && !result.durable) {
    if (store?.settleAiBudgetReservation) await store.settleAiBudgetReservation(reservationId, 'released', 0).catch(() => null)
    else if (localBudgetReservations.has(reservationId)) localBudgetReservations.set(reservationId, { ...localBudgetReservations.get(reservationId), status: 'released' })
    const err = new Error('gateway_budget_store_unavailable')
    err.window = window
    throw err
  }
  if (!result?.granted) {
    const unavailable = !result || ['budget_store_unavailable', 'budget_store_invalid_response'].includes(result.reason)
    const err = new Error(unavailable ? 'gateway_budget_store_unavailable' : 'gateway_company_daily_budget_reached')
    err.used = Number(result?.usedUnits) || 0
    err.cap = Number(result?.capUnits) || capUnits
    err.reserved = reservedUnits
    err.window = window
    throw err
  }
  return { reservationId, window, reservedUnits, capUnits, store }
}

async function settleProviderBudget(reservation, status, actualUnits) {
  if (!reservation) return
  if (reservation.store?.settleAiBudgetReservation) {
    await reservation.store.settleAiBudgetReservation(reservation.reservationId, status, actualUnits).catch(() => null)
    return
  }
  const current = localBudgetReservations.get(reservation.reservationId)
  if (current?.status === 'reserved') localBudgetReservations.set(reservation.reservationId, { ...current, status, actualUnits })
}

function weightedUsageUnits(usage, tier) {
  const weight = TIER_COST_WEIGHTS[tier] || 1
  return Math.max(0, Math.ceil(((Number(usage?.input_tokens) || 0) + (Number(usage?.output_tokens) || 0)) * weight))
}

function canonicalJson(value) {
  const ancestors = new Set()
  const normalize = (item, inArray = false) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item
    if (typeof item === 'number') return Number.isFinite(item) ? item : null
    if (typeof item === 'bigint') throw new TypeError('gateway_cache_context_not_json')
    if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') return inArray ? null : undefined
    if (typeof item?.toJSON === 'function') {
      if (ancestors.has(item)) throw new TypeError('gateway_cache_context_circular')
      ancestors.add(item)
      const serialized = item.toJSON()
      if (serialized === item) throw new TypeError('gateway_cache_context_circular')
      const out = normalize(serialized, inArray)
      ancestors.delete(item)
      return out
    }
    if (ancestors.has(item)) throw new TypeError('gateway_cache_context_circular')
    ancestors.add(item)
    const out = Array.isArray(item)
      ? item.map((entry) => normalize(entry, true))
      : Object.fromEntries(Object.keys(item).sort().flatMap((key) => {
        const normalized = normalize(item[key], false)
        return normalized === undefined ? [] : [[key, normalized]]
      }))
    ancestors.delete(item)
    return out
  }
  return JSON.stringify(normalize(value))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function effectiveMaxTokens(value, tier) {
  if (value === undefined || value === null) return TIERS[tier].maxTokens
  const tokens = Number(value)
  if (!Number.isSafeInteger(tokens) || tokens <= 0 || tokens > TIERS[tier].maxTokens) throw new TypeError('gateway_invalid_max_tokens')
  return tokens
}

// Bound the exact provider JSON envelope before dispatch. Twice the UTF-8 bytes plus a fixed framing
// allowance is intentionally conservative for weighted-token budget enforcement.
function reservationUnitsFor({ provider, system, messages, schema, tier, maxTokens }) {
  if (!Array.isArray(messages) || messages.length > 64) throw new TypeError('gateway_invalid_messages')
  const tierDef = TIERS[tier]
  const tool = schema ? { name: 'emit', description: 'Return the result in this exact shape.', input_schema: schema } : null
  const body = provider.name === 'openrouter'
    ? {
        model: tierDef.fallbackModel,
        max_tokens: maxTokens,
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((message) => ({ role: message.role, content: flattenContent(message.content) }))],
        ...(tool ? { tools: [{ type: 'function', function: { name: 'emit', description: tool.description, parameters: tool.input_schema } }], tool_choice: { type: 'function', function: { name: 'emit' } } } : {}),
      }
    : {
        model: tierDef.model,
        max_tokens: maxTokens,
        system,
        messages,
        ...(tool ? { tools: [tool], tool_choice: { type: 'tool', name: 'emit' } } : {}),
      }
  const requestBytes = Buffer.byteLength(canonicalJson(body), 'utf8')
  if (requestBytes > MAX_PROVIDER_REQUEST_BYTES) throw new Error('gateway_request_too_large')
  const inputUpperBound = requestBytes * 2 + PROVIDER_FRAMING_TOKEN_ALLOWANCE
  const weighted = (inputUpperBound + maxTokens) * (TIER_COST_WEIGHTS[tier] || 1)
  if (!Number.isSafeInteger(weighted) || weighted <= 0) throw new TypeError('gateway_invalid_reservation_units')
  return weighted
}

function activeLocalReserved(clientId, window) {
  let total = 0
  for (const reservation of localSpendReservations.values()) {
    if (reservation.clientId === clientId && reservation.window === window && ['reserved', 'dispatched', 'indeterminate'].includes(reservation.status)) total += reservation.reservedTokens
  }
  return total
}

function reserveLocalSpend({ reservationId, clientId, window, reservedTokens, cap, dispatchToken, context, expiresAt }) {
  const capKey = `${clientId}::${window}`
  const pinnedCap = localSpendCaps.get(capKey)
  if (pinnedCap === undefined) localSpendCaps.set(capKey, cap)
  else if (pinnedCap !== cap) return { accepted: false, reason: 'cap_mismatch', reservation_id: reservationId, durable: false, spend_total: usageFor(clientId).inTokens + usageFor(clientId).outTokens + activeLocalReserved(clientId, window) }
  const existing = localSpendReservations.get(reservationId)
  if (existing) {
    const sameScope = existing.clientId === clientId && existing.window === window && existing.reservedTokens === reservedTokens && canonicalJson(existing.context || {}) === canonicalJson(context || {})
    let accepted = false
    let reason = 'reservation_exists'
    if (sameScope && existing.status === 'reserved' && existing.dispatchToken === dispatchToken) {
      accepted = true
      reason = 'idempotent'
    } else if (sameScope && existing.status === 'reserved' && Date.parse(existing.expiresAt) <= Date.now()) {
      localSpendReservations.set(reservationId, { ...existing, dispatchToken, context, expiresAt })
      accepted = true
      reason = 'reservation_reclaimed'
    } else if (sameScope && ['dispatched', 'indeterminate'].includes(existing.status)) reason = 'reconciliation_required'
    else if (sameScope && existing.status === 'reserved') reason = 'reservation_in_progress'
    return { accepted, reason, reservation_id: reservationId, status: existing.status, durable: false, spend_total: (usageFor(clientId).inTokens + usageFor(clientId).outTokens + activeLocalReserved(clientId, window)) }
  }
  const used = usageFor(clientId)
  const spendTotal = used.inTokens + used.outTokens + activeLocalReserved(clientId, window)
  if (cap > 0 && spendTotal + reservedTokens > cap) return { accepted: false, reason: 'cap_reached', reservation_id: reservationId, durable: false, spend_total: spendTotal, in_tokens: used.inTokens, out_tokens: used.outTokens, calls: used.calls }
  localSpendReservations.set(reservationId, { clientId, window, reservedTokens, dispatchToken, context, expiresAt, status: 'reserved' })
  return { accepted: true, reason: 'reserved', reservation_id: reservationId, status: 'reserved', durable: false, spend_total: spendTotal + reservedTokens, in_tokens: used.inTokens, out_tokens: used.outTokens, calls: used.calls, reserved_tokens: activeLocalReserved(clientId, window) }
}

function operationIdentity(value) {
  if (value === undefined || value === null || value === '') return randomUUID()
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) throw new TypeError('gateway_invalid_operation_id')
  return value.trim()
}

function explicitCacheHint(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new TypeError('gateway_invalid_cache_key')
  const hint = value.trim()
  if (!hint) return ''
  const normalized = hint.toLowerCase()
  if (RESERVED_CONTROL_CACHE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error('gateway_reserved_cache_key')
  }
  return value
}

function tenantIdentity(value) {
  if (value === undefined || value === null || value === '') return PLATFORM_TENANT_ID
  if (typeof value !== 'string') throw new TypeError('gateway_invalid_client_id')
  const tenant = value.trim()
  if (!tenant || tenant.length > 200) throw new TypeError('gateway_invalid_client_id')
  return tenant
}

function routeModel(provider, tier) {
  const tierDef = TIERS[tier]
  return provider.name === 'openrouter' ? tierDef.fallbackModel : tierDef.model
}

function responseCacheKey({
  system,
  messages,
  clientId,
  schema,
  cacheHint,
  maxTokens,
  policy,
  provider,
  tier,
  model,
}) {
  const context = {
    version: 2,
    tenant: clientId
      ? { type: typeof clientId, id: clientId }
      : { type: 'anonymous', id: '' },
    policy: {
      version: RESPONSE_CACHE_POLICY_VERSION,
      plan: policy.plan,
      requestedTier: policy.requestedTier,
      effectiveTier: tier,
    },
    route: {
      provider,
      model,
      maxTokens: maxTokens || TIERS[tier].maxTokens,
    },
    output: { schema: schema ?? null },
    request: { system: system ?? '', messages: messages ?? [], cacheHint: cacheHint || null },
    retention: { class: 'ephemeral-response', ttlMs: CACHE_TTL_MS },
  }
  return `${RESPONSE_CACHE_PREFIX}${sha256(canonicalJson(context))}`
}

// Strip assistant/system framing from client-supplied text before it reaches the model.
// Defends against prompt injection in pasted inboxes, files, and chat exports.
export function stripInjectionFrames(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/<\s*\/?\s*(system|developer|assistant|human|user|tool(?:_call)?|function(?:_call)?)\b[^>]*>/gi, ' ')
    .replace(/\b(system|developer|assistant|tool(?:_call)?|function(?:_call)?)\s*:/gi, '$1 -')
    .replace(/\s{3,}/g, '  ')
    .trim()
}

// Ledger units are COST-WEIGHTED (bulk-equivalent) tokens: raw tokens × TIER_COST_WEIGHTS[tier].
// This makes the monthly cap a spend ceiling — a Sonnet call burns 3x what the same Haiku call would.
async function recordUsage(clientId, usage, tier, reservation = null) {
  const usageComplete = usage
    && Object.prototype.hasOwnProperty.call(usage, 'input_tokens')
    && Object.prototype.hasOwnProperty.call(usage, 'output_tokens')
  if (!clientId || !usageComplete) {
    await markSpendIndeterminate(reservation)
    return false
  }
  const w = TIER_COST_WEIGHTS[tier] || 1
  const rawIn = usage.input_tokens
  const rawOut = usage.output_tokens
  if (!Number.isSafeInteger(rawIn) || rawIn < 0 || !Number.isSafeInteger(rawOut) || rawOut < 0) {
    await markSpendIndeterminate(reservation)
    return false
  }
  const inTokens = rawIn * w
  const outTokens = rawOut * w
  if (!Number.isSafeInteger(inTokens) || !Number.isSafeInteger(outTokens)) {
    await markSpendIndeterminate(reservation)
    return false
  }
  if (reservation?.backend === 'local') {
    const current = localSpendReservations.get(reservation.id)
    if (!current || current.dispatchToken !== reservation.dispatchToken || !['dispatched', 'indeterminate'].includes(current.status) || inTokens + outTokens > reservation.reservedTokens) return false
    localSpendReservations.set(reservation.id, { ...current, status: 'settled', inTokens, outTokens, calls: 1 })
  } else {
    // Settle the durable maximum reservation to actual usage. A failed settlement deliberately
    // leaves the active maximum counted, so another request cannot spend the same capacity.
    const store = await spine()
    if (reservation?.backend === 'store' && store?.settleTokenSpend) {
      let settled = null
      for (let retry = 0; retry < 3; retry++) {
        try {
          settled = await store.settleTokenSpend(reservation.id, { inTokens, outTokens, calls: 1, dispatchToken: reservation.dispatchToken })
          if (settled?.settled) break
        } catch { /* retry the same idempotent settlement */ }
        if (retry < 2) await sleep(25 * (retry + 1))
      }
      if (!settled?.settled) {
        await markSpendIndeterminate(reservation)
        return false
      }
    } else return false
  }
  // Update the fast local view only after settlement succeeds.
  const e = ledger.get(clientId) || { inTokens: 0, outTokens: 0, calls: 0 }
  e.inTokens += inTokens
  e.outTokens += outTokens
  e.calls += 1
  ledger.set(clientId, e)
  return true
}

// Synchronous, in-memory view (this instance only). Kept for back-compat with existing callers.
export function usageFor(clientId) {
  return ledger.get(clientId) || { inTokens: 0, outTokens: 0, calls: 0 }
}

// Authoritative monthly usage for a tenant: the persisted ledger when available, else in-memory.
// Returns { inTokens, outTokens, calls, total, window, source }.
export async function monthlyUsageFor(clientId) {
  const local = usageFor(clientId)
  const window = currentWindow()
  const store = await spine()
  if (store?.getTokenUsage) {
    try {
      const r = await store.getTokenUsage(clientId, window)
      // Never UNDER-count: if persisted writes silently failed (addTokenUsage swallows errors), this
      // instance's in-memory tally can exceed a stale-low spine read. Take the max so the spend cap
      // can only over-count, never under-count — fail CLOSED for the cost safety net.
      const inTokens = Math.max(Number(r.in_tokens) || 0, Number(local.inTokens) || 0)
      const outTokens = Math.max(Number(r.out_tokens) || 0, Number(local.outTokens) || 0)
      const calls = Math.max(Number(r.calls) || 0, Number(local.calls) || 0)
      const reservedTokens = Math.max(Number(r.reserved_tokens) || 0, 0)
      return { inTokens, outTokens, calls, total: inTokens + outTokens, reservedTokens, spendTotal: inTokens + outTokens + reservedTokens, window, source: 'spine+local-max' }
    } catch { /* fall through to in-memory */ }
  }
  const reservedTokens = activeLocalReserved(clientId, window)
  return { ...local, total: local.inTokens + local.outTokens, reservedTokens, spendTotal: local.inTokens + local.outTokens + reservedTokens, window, source: 'memory' }
}

async function reserveSpend({ reservationId, dispatchToken, context, clientId, window, reservedTokens, cap }) {
  const store = await spine()
  let result
  const expiresAt = new Date(Date.now() + SPEND_RESERVATION_TTL_MS).toISOString()
  try {
    if (store?.reserveTokenSpend) {
      result = await store.reserveTokenSpend(reservationId, clientId, window, {
        reservedTokens,
        capTokens: cap,
        expiresAt,
        dispatchToken,
        context,
      })
    } else if (!PERSIST) {
      result = reserveLocalSpend({ reservationId, clientId, window, reservedTokens, cap, dispatchToken, context, expiresAt })
    } else {
      throw new Error('reservation_store_missing')
    }
  } catch (cause) {
    const error = new Error('gateway_spend_reservation_unavailable', { cause })
    error.clientId = clientId
    error.window = window
    throw error
  }
  const reservation = { id: reservationId, dispatchToken, backend: store?.reserveTokenSpend ? 'store' : 'local', durable: Boolean(result?.durable), reservedTokens }
  if (!result?.accepted) {
    const message = result?.reason === 'cap_reached'
      ? 'gateway_client_cap_reached'
      : result?.reason === 'reconciliation_required'
        ? 'gateway_spend_reconciliation_required'
        : result?.reason === 'reservation_in_progress'
          ? 'gateway_spend_reservation_in_progress'
          : 'gateway_spend_reservation_rejected'
    const error = new Error(message)
    error.clientId = clientId
    error.used = Number(result?.spend_total) || 0
    error.cap = cap
    error.window = window
    error.reason = result?.reason || 'reservation_rejected'
    throw error
  }
  if (REQUIRE_DURABLE_SPEND && !result.durable) {
    await releaseSpendReservation(reservation)
    const error = new Error('gateway_durable_spend_required')
    error.clientId = clientId
    error.window = window
    throw error
  }
  return reservation
}

async function markSpendDispatched(reservation) {
  if (!reservation) return false
  if (reservation.backend === 'local') {
    const current = localSpendReservations.get(reservation.id)
    if (!current || current.dispatchToken !== reservation.dispatchToken || !['reserved', 'dispatched'].includes(current.status)) return false
    if (current.status === 'reserved' && Date.parse(current.expiresAt) <= Date.now()) return false
    if (current.status === 'reserved') localSpendReservations.set(reservation.id, { ...current, status: 'dispatched' })
    return true
  }
  const store = await spine()
  if (!store?.markTokenSpendDispatched) return false
  try { return Boolean((await store.markTokenSpendDispatched(reservation.id, reservation.dispatchToken))?.changed) }
  catch { return false }
}

async function markSpendIndeterminate(reservation) {
  if (!reservation) return false
  if (reservation.backend === 'local') {
    const current = localSpendReservations.get(reservation.id)
    if (!current || current.dispatchToken !== reservation.dispatchToken) return false
    if (current.status === 'dispatched') localSpendReservations.set(reservation.id, { ...current, status: 'indeterminate' })
    return current.status === 'dispatched' || current.status === 'indeterminate'
  }
  const store = await spine()
  if (!store?.markTokenSpendIndeterminate) return false
  try { return Boolean((await store.markTokenSpendIndeterminate(reservation.id, reservation.dispatchToken))?.changed) }
  catch { return false }
}

async function releaseSpendReservation(reservation, { definitive = false } = {}) {
  if (!reservation) return false
  if (reservation.backend === 'local') {
    const current = localSpendReservations.get(reservation.id)
    if (!current || current.dispatchToken !== reservation.dispatchToken || current.status === 'indeterminate' || current.status === 'settled' || (current.status === 'dispatched' && !definitive)) return false
    if (current.status !== 'released') localSpendReservations.set(reservation.id, { ...current, status: 'released' })
    return true
  }
  const store = await spine()
  if (!store?.releaseTokenSpend) return false
  try { return Boolean((await store.releaseTokenSpend(reservation.id, { dispatchToken: reservation.dispatchToken, definitive }))?.released) }
  catch { return false }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const firstEnv = (names) => { for (const n of names) { const v = String(process.env[n] || '').trim(); if (v) return v } return '' }
// Flatten an Anthropic-style message content (string | content-block[]) to plain text for OpenAI-shaped APIs.
function flattenContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((b) => (typeof b === 'string' ? b : b?.text || '')).join('\n')
  return String(content ?? '')
}
function providerError(name, status, detail) {
  const err = new Error(`${name}_${status}`)
  err.status = status
  err.detail = String(detail || '').slice(0, 200)
  return err
}

function localOllamaModel() {
  const model = String(process.env.SUPERMEGA_OLLAMA_MODEL || '').trim().toLowerCase()
  return OLLAMA_MODEL_RE.test(model) && LOCAL_LLAMA_MODELS.has(model) ? model : ''
}

function localOllamaAvailable() {
  return process.env.SUPERMEGA_OLLAMA_ENABLED === '1' && !hostedRuntime() && Boolean(localOllamaModel())
}

export function providerPolicy() {
  const configured = String(process.env.SUPERMEGA_AI_PROVIDER_POLICY || '').trim().toLowerCase()
  if (!configured) return 'cloud-enabled'
  return PROVIDER_POLICIES.has(configured) ? configured : 'invalid'
}

function boundedUsageCount(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : 0
}

async function readBoundedResponseText(response, maxBytes) {
  if (!response?.body?.getReader) {
    const text = await response.text().catch(() => '')
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('ollama_local_response_too_large')
    return text
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw new Error('ollama_local_response_invalid')
      total += value.byteLength
      if (total > maxBytes) throw new Error('ollama_local_response_too_large')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => null)
    throw error
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// --- Provider adapters ----------------------------------------------------------------------------
// Each adapter takes a normalized request and returns { text?, data?, usage:{input_tokens,output_tokens}, model }
// or throws (err.status set for retry/failover classification; err.noKey=true → provider unavailable).

const OLLAMA = {
  name: 'ollama-local',
  maxAttempts: 1,
  available: localOllamaAvailable,
  async call({ system, messages, tool, maxTokens }, signal) {
    const model = localOllamaModel()
    if (!localOllamaAvailable() || !model) {
      const error = new Error('ollama_local_unavailable')
      error.providerUnavailable = true
      throw error
    }
    const body = {
      model,
      stream: false,
      think: false,
      keep_alive: 0,
      messages: [
        ...(system ? [{ role: 'system', content: String(system) }] : []),
        ...messages.map((message) => ({ role: message.role, content: flattenContent(message.content) })),
      ],
      options: { num_predict: maxTokens, temperature: 0 },
      ...(tool ? { format: tool.input_schema } : {}),
    }
    let response
    try {
      response = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal,
      })
    } catch {
      const error = new Error('ollama_local_unavailable')
      error.providerUnavailable = true
      throw error
    }
    const responseText = await readBoundedResponseText(response, OLLAMA_RESPONSE_MAX_BYTES)
    if (!response.ok) {
      const error = providerError('ollama-local', response.status, '')
      if (response.status === 404) error.providerUnavailable = true
      throw error
    }
    let json
    try { json = JSON.parse(responseText) } catch { throw new Error('ollama_local_response_invalid') }
    if (json?.done !== true || typeof json?.message?.content !== 'string') throw new Error('ollama_local_response_invalid')
    const content = json.message.content.trim()
    if (!content) throw new Error('ollama_local_response_empty')
    const usage = {
      input_tokens: boundedUsageCount(json.prompt_eval_count),
      output_tokens: boundedUsageCount(json.eval_count),
    }
    if (tool) {
      let data
      try { data = JSON.parse(content) } catch { throw new Error('gateway_bad_tool_json') }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('gateway_bad_tool_json')
      return { data, usage, model }
    }
    return { text: content, usage, model }
  },
}

const ANTHROPIC = {
  name: 'anthropic',
  available: () => Boolean(firstEnv(['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'])),
  async call({ tierDef, system, messages, tool, maxTokens }, signal) {
    const key = firstEnv(['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'])
    if (!key) { const e = new Error('anthropic_no_key'); e.noKey = true; throw e }
    const body = {
      model: tierDef.model, max_tokens: maxTokens || tierDef.maxTokens, system, messages,
      ...(tool ? { tools: [tool], tool_choice: { type: 'tool', name: 'emit' } } : {}),
    }
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
      body: JSON.stringify(body), signal,
    })
    if (!res.ok) throw providerError('anthropic', res.status, await res.text().catch(() => ''))
    const json = await res.json()
    if (tool) {
      const block = (json.content || []).find((b) => b.type === 'tool_use' && b.name === 'emit')
      if (!block) throw new Error('gateway_no_tool_output')
      return { data: block.input, usage: json.usage, model: tierDef.model }
    }
    const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    return { text, usage: json.usage, model: tierDef.model }
  },
}

// OpenRouter — OpenAI-compatible, routes to a NON-Anthropic model so it survives a Claude outage.
const OPENROUTER = {
  name: 'openrouter',
  available: () => Boolean(firstEnv(['OPENROUTER_API_KEY'])),
  async call({ tierDef, system, messages, tool, maxTokens }, signal) {
    const key = firstEnv(['OPENROUTER_API_KEY'])
    if (!key) { const e = new Error('openrouter_no_key'); e.noKey = true; throw e }
    const model = tierDef.fallbackModel
    const oaMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: flattenContent(m.content) })),
    ]
    const body = {
      model, max_tokens: maxTokens || tierDef.maxTokens, messages: oaMessages,
      ...(tool ? { tools: [{ type: 'function', function: { name: 'emit', description: tool.description, parameters: tool.input_schema } }], tool_choice: { type: 'function', function: { name: 'emit' } } } : {}),
    }
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://supermega.dev', 'X-Title': 'SuperMega' },
      body: JSON.stringify(body), signal,
    })
    if (!res.ok) throw providerError('openrouter', res.status, await res.text().catch(() => ''))
    const json = await res.json()
    const u = json.usage
    const usage = u && Object.prototype.hasOwnProperty.call(u, 'prompt_tokens') && Object.prototype.hasOwnProperty.call(u, 'completion_tokens')
      ? { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens }
      : null
    const msg = json.choices?.[0]?.message || {}
    if (tool) {
      const call = (msg.tool_calls || [])[0]
      if (!call?.function?.arguments) throw new Error('gateway_no_tool_output')
      let data; try { data = JSON.parse(call.function.arguments) } catch { throw new Error('gateway_bad_tool_json') }
      return { data, usage, model }
    }
    return { text: String(msg.content || '').trim(), usage, model }
  },
}

// Ordered provider chain: explicitly enabled local Ollama first, then admitted paid providers.
// `local-only` never falls through to a cloud key, even when one exists in the environment.
// Only available providers are attempted; local inference is denied in hosted runtimes.
export function providerChain() {
  const policy = providerPolicy()
  if (policy === 'invalid') return []
  const providers = policy === 'local-only' ? [OLLAMA] : [OLLAMA, ANTHROPIC, OPENROUTER]
  return providers.filter((provider) => provider.available())
}

/**
 * complete — the one call every SuperMega component makes.
 * @param {object}   o
 * @param {string}   o.system            system prompt
 * @param {Array}    o.messages          [{role, content}]
 * @param {string}   [o.tier='reason']   'bulk' | 'reason' | 'deep' — a REQUEST, not a right: free-plan tenants are forced to 'bulk' server-side
 * @param {string}   [o.clientId]        tenant id; omitted calls use the capped platform tenant
 * @param {object}   [o.schema]          JSON Schema -> forces validated structured output (tool-use)
 * @param {string}   [o.cacheKey]        optional cache hint/salt; it never replaces the tenant-safe derived key
 * @param {number}   [o.maxTokens]       override the tier default
 * @param {number}   [o.capTokens]       deprecated caller override; always rejected
 * @param {string}   [o.operationId]     stable caller operation id for fail-closed retry identity
 * @param {number}   [o.timeoutMs=45000]
 * @returns {Promise<{text?:string, data?:object, usage:object, model:string, tier:string}>}
 */
export async function complete(o) {
  const { system, messages, clientId: requestedClientId, schema, maxTokens, timeoutMs = 45_000 } = o
  const clientId = tenantIdentity(requestedClientId)
  const operationId = operationIdentity(o.operationId)
  const operationHash = sha256(`${clientId}\0${operationId}`)
  let tier = o.tier && TIERS[o.tier] ? o.tier : 'reason'
  let cachePolicy = { plan: 'unscoped', requestedTier: tier }
  let spendCap = 0
  let spendWindow = currentWindow()

  // Per-tenant monthly cost cap, enforced against the persisted ledger (survives cold starts /
  // spans instances). Over the hard cap → refuse. Over the soft threshold → downgrade to a cheaper
  // tier so the client stays under budget instead of being cut off mid-month.
  // The tenant's PLAN is resolved server-side first: free tenants are forced to the bulk (Haiku)
  // tier; spend caps come from server configuration, not the request.
  if (clientId) {
    // Internal calls without an explicit tenant are charged to the capped platform tenant. The
    // platform tenant is server-owned: it keeps its requested tier (internal agents legitimately
    // use reason/deep) but can never raise its server-configured cap.
    const plan = clientId === PLATFORM_TENANT_ID ? PLATFORM_PLAN : await resolvePlan(clientId)
    const policy = policyFor(plan, { tier: o.tier, capTokens: o.capTokens })
    tier = policy.tier
    cachePolicy = { plan: policy.plan, requestedTier: o.tier && TIERS[o.tier] ? o.tier : 'reason' }
    spendCap = policy.cap
    const used = await monthlyUsageFor(clientId)
    spendWindow = used.window
    // Soft downgrade band (default: last 20% of the cap). One step down the tier ladder.
    const softAt = spendCap > 0 ? spendCap * Number(process.env.SUPERMEGA_CLIENT_CAP_SOFT_RATIO || 0.8) : Infinity
    if (used.spendTotal >= softAt && FALLBACK[tier]) tier = FALLBACK[tier]
  }

  const requestMaxTokens = effectiveMaxTokens(maxTokens, tier)

  // A caller-supplied cacheKey is only a hashed hint. It can never become the storage key or collide
  // with control records that currently share the backing table. The full request/schema plus the
  // resolved tenant policy, provider/model route, and retention policy form the cache identity.
  const cacheHint = explicitCacheHint(o.cacheKey)
  const providers = providerChain()
  const activeProviderPolicy = providerPolicy()
  if (activeProviderPolicy === 'invalid') throw new Error('gateway_provider_policy_invalid')
  if (!providers.length) {
    if (activeProviderPolicy === 'local-only') throw new Error('gateway_local_provider_unavailable')
    throw new Error('gateway_missing_api_key')
  }
  const nowMs = Date.now()
  const fresh = (v) => v && (!v._exp || nowMs < v._exp)
  const unwrap = (v) => { const { _exp, ...out } = v; return { ...out, cached: true } }
  const store = await spine()
  for (const provider of providers) {
    const key = responseCacheKey({
      system, messages, clientId, schema, cacheHint, maxTokens: requestMaxTokens, policy: cachePolicy,
      provider: provider.name, tier, model: routeModel(provider, tier),
    })
    const memHit = cache.get(key)
    if (fresh(memHit)) return unwrap(memHit)
    if (memHit) cache.delete(key) // expired
    // Shared cache: a hit on another instance still saves the spend.
    if (store?.getCachedResponse) {
      try {
        const hit = await store.getCachedResponse(key)
        if (fresh(hit)) { cache.set(key, hit); return unwrap(hit) }
      } catch { /* cache is best-effort; fall through to a live call */ }
    }
  }

  // Structured output is done via forced tool-use, NOT JSON-from-text.
  // (JSON-in-text breaks on raw newlines in Burmese — a real Deal Desk bug.)
  const tool = schema
    ? { name: 'emit', description: 'Return the result in this exact shape.', input_schema: schema }
    : null

  const startTier = tier

  // Try each provider in turn (local when enabled, then paid failover). Provider-specific retry
  // ceilings apply; paid providers retain backoff and tier fallback while local inference attempts once.
  let lastErr
  let attemptOrdinal = 0
  for (const provider of providers) {
    let curTier = startTier
    const maxAttempts = provider.maxAttempts || 4
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tierDef = TIERS[curTier]
      const attemptMaxTokens = Math.min(requestMaxTokens, tierDef.maxTokens)
      let spendReservation = null
      attemptOrdinal += 1
      if (clientId) {
        try {
          const reservationId = `spend:${sha256(`${operationHash}\0${attemptOrdinal}`)}`
          const dispatchToken = randomUUID()
          spendReservation = await reserveSpend({
            reservationId,
            dispatchToken,
            context: {
              operation_hash: operationHash,
              request_hash: sha256(canonicalJson({ system, messages, schema, maxTokens: attemptMaxTokens })),
              attempt: attemptOrdinal,
              provider: provider.name,
              model: routeModel(provider, curTier),
              tier: curTier,
            },
            clientId,
            window: spendWindow,
            reservedTokens: reservationUnitsFor({ provider, system, messages, schema, tier: curTier, maxTokens: attemptMaxTokens }),
            cap: spendCap,
          })
        } catch (error) {
          if (lastErr && error?.message === 'gateway_client_cap_reached') {
            const blocked = new Error('gateway_retry_blocked_by_reserved_spend', { cause: lastErr })
            blocked.clientId = clientId
            blocked.used = error.used
            blocked.cap = error.cap
            blocked.window = error.window
            throw blocked
          }
          throw error
        }
      }
      // Company-wide daily admission budget (fail closed) — reserved AFTER the tenant spend
      // reservation so a tenant-cap rejection never consumes company budget. If the company
      // budget refuses this attempt, the still-undispatched tenant reservation is released.
      let budgetReservation = null
      try {
        budgetReservation = await reserveProviderBudget({
          system,
          messages,
          schema,
          tier: curTier,
          maxTokens: attemptMaxTokens,
          clientId,
          provider: provider.name,
        })
      } catch (error) {
        await releaseSpendReservation(spendReservation, { definitive: true })
        throw error
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        if (!(await markSpendDispatched(spendReservation))) {
          await releaseSpendReservation(spendReservation)
          throw new Error('gateway_dispatch_state_unavailable')
        }
        const r = await provider.call({ tierDef, system, messages, tool, maxTokens: attemptMaxTokens }, controller.signal)
        clearTimeout(timer)
        await settleProviderBudget(budgetReservation, 'consumed', weightedUsageUnits(r.usage, curTier))
        budgetReservation = null
        const spendSettled = await recordUsage(clientId, r.usage, curTier, spendReservation)
        const out = tool
          ? { data: r.data, usage: r.usage, model: r.model, tier: curTier, provider: provider.name }
          : { text: r.text, usage: r.usage, model: r.model, tier: curTier, provider: provider.name }
        if (!spendSettled) {
          return { ...out, spend: { status: 'reconciliation_required', reservationId: spendReservation.id } }
        }
        const cached = { ...out, _exp: Date.now() + CACHE_TTL_MS }
        const key = responseCacheKey({
          system, messages, clientId, schema, cacheHint, maxTokens: attemptMaxTokens, policy: cachePolicy,
          provider: provider.name, tier: curTier, model: r.model,
        })
        cache.set(key, cached)
        if (store?.putCachedResponse) { try { await store.putCachedResponse(key, cached) } catch { /* best-effort */ } }
        return out
      } catch (err) {
        clearTimeout(timer)
        // Failed or ambiguous provider attempts stay conservatively charged to the daily company
        // budget; only a successful call re-prices its reservation down to actual usage.
        if (budgetReservation) await settleProviderBudget(budgetReservation, 'failed', budgetReservation.reservedUnits)
        lastErr = err
        if (err.message === 'gateway_dispatch_state_unavailable') throw err
        if (err.providerUnavailable) { await releaseSpendReservation(spendReservation, { definitive: true }); break } // provider unreachable before acceptance → next provider
        if (err.noKey) { await releaseSpendReservation(spendReservation, { definitive: true }); break } // no provider dispatch
        if (err.status === 401 || err.status === 403) { await releaseSpendReservation(spendReservation, { definitive: true }); break }
        // Only explicit request-rejection statuses release capacity; 408 and unusual 4xx responses
        // remain indeterminate because an intermediary may already have accepted the work.
        if ([400, 404, 405, 413, 415, 422].includes(err.status)) {
          await releaseSpendReservation(spendReservation, { definitive: true })
          throw err
        }
        if (err.status === 429) await releaseSpendReservation(spendReservation, { definitive: true })
        else await markSpendIndeterminate(spendReservation)
        if (attempt + 1 >= maxAttempts) break
        // Retriable (429 / 5xx / timeout / network): back off with jitter, drop a tier on a later try.
        await sleep(400 * (attempt + 1) ** 2 + Math.floor(Math.random() * 250))
        if (attempt === 2 && FALLBACK[curTier]) curTier = FALLBACK[curTier]
      }
    }
    // provider exhausted → fall through to the next provider in the chain
  }
  throw lastErr || new Error('gateway_failed')
}

export default { complete, stripInjectionFrames, usageFor, monthlyUsageFor, providerChain, resolvePlan, policyFor, companyDailyBudgetCap, currentDailyBudgetWindow, boundedMaxTokens, estimateCallBudgetUnits, TIERS, TIER_COST_WEIGHTS, FREE_PLAN, COMPANY_DAILY_BUDGET_DEFAULT_UNITS, COMPANY_DAILY_BUDGET_HARD_MAX_UNITS }
