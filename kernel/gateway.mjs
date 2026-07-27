// SUPERMEGA AI gateway — one interface in front of every model call.
// Zero-dependency (native fetch). Reads ANTHROPIC_API_KEY from env. See ../PLATFORM.md.
//
// Why this exists: swapping a model, adding caching, or capping a client's spend should touch
// ONE file, not every caller. Every build agent, the Deal Desk, and the per-client operator
// call complete() — never the Anthropic SDK directly.

import { randomUUID } from 'node:crypto'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

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
const CACHE_TTL_MS = Number(process.env.SUPERMEGA_AI_CACHE_TTL_MS || 3_600_000) // 1h default; keys are tenant-scoped
const DEFAULT_CAP_TOKENS = Number(process.env.SUPERMEGA_CLIENT_TOKEN_CAP || 150_000) // P0: free-tier cap (was 2M — 2M/mo kills margin at scale)

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

// Pure policy: the tier + cap a tenant on `plan` actually gets, given what the caller asked for.
// Free tenants are FORCED to bulk and caller-supplied capTokens overrides are rejected (the
// default cap stands) — otherwise any client could hand itself Sonnet and an unlimited budget.
// Paid plans keep their requested tier and may override the cap.
export function policyFor(plan, { tier, capTokens } = {}) {
  const requested = tier && TIERS[tier] ? tier : 'reason'
  if (!plan || String(plan).toLowerCase() === FREE_PLAN) {
    return { plan: FREE_PLAN, tier: 'bulk', cap: DEFAULT_CAP_TOKENS, overridesRejected: Boolean((tier && tier !== 'bulk') || capTokens) }
  }
  return { plan: String(plan).toLowerCase(), tier: requested, cap: Number(capTokens || DEFAULT_CAP_TOKENS), overridesRejected: false }
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

function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
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
async function recordUsage(clientId, usage, tier) {
  if (!clientId || !usage) return
  const w = TIER_COST_WEIGHTS[tier] || 1
  const inTokens = (usage.input_tokens || 0) * w
  const outTokens = (usage.output_tokens || 0) * w
  // Always update the fast in-memory ledger (synchronous source for usageFor()).
  const e = ledger.get(clientId) || { inTokens: 0, outTokens: 0, calls: 0 }
  e.inTokens += inTokens
  e.outTokens += outTokens
  e.calls += 1
  ledger.set(clientId, e)
  // Best-effort persist to the spine so the cap survives cold starts / spans instances.
  const store = await spine()
  if (store?.addTokenUsage) {
    try { await store.addTokenUsage(clientId, currentWindow(), { inTokens, outTokens, calls: 1 }) }
    catch { /* never break a completed call on a ledger write */ }
  }
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
      return { inTokens, outTokens, calls, total: inTokens + outTokens, window, source: 'spine+local-max' }
    } catch { /* fall through to in-memory */ }
  }
  return { ...local, total: local.inTokens + local.outTokens, window, source: 'memory' }
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

// --- Provider adapters ----------------------------------------------------------------------------
// Each adapter takes a normalized request and returns { text?, data?, usage:{input_tokens,output_tokens}, model }
// or throws (err.status set for retry/failover classification; err.noKey=true → provider unavailable).

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
    const u = json.usage || {}
    const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 }
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

// Ordered provider chain — Anthropic primary, OpenRouter failover. Only providers with a key configured
// are included, so with no OPENROUTER_API_KEY the behavior is identical to before (Anthropic-only).
export function providerChain() {
  return [ANTHROPIC, OPENROUTER].filter((p) => p.available())
}

/**
 * complete — the one call every SuperMega component makes.
 * @param {object}   o
 * @param {string}   o.system            system prompt
 * @param {Array}    o.messages          [{role, content}]
 * @param {string}   [o.tier='reason']   'bulk' | 'reason' | 'deep' — a REQUEST, not a right: free-plan tenants are forced to 'bulk' server-side
 * @param {string}   [o.clientId]        tenant id — enables server-side plan resolution + the per-tenant monthly cost cap + logging
 * @param {object}   [o.schema]          JSON Schema -> forces validated structured output (tool-use)
 * @param {string}   [o.cacheKey]        explicit cache key; else derived from the request
 * @param {number}   [o.maxTokens]       override the tier default
 * @param {number}   [o.capTokens]       override the monthly cap for THIS tenant (else DEFAULT_CAP_TOKENS) — REJECTED for free-plan tenants
 * @param {number}   [o.timeoutMs=45000]
 * @returns {Promise<{text?:string, data?:object, usage:object, model:string, tier:string}>}
 */
export async function complete(o) {
  const { system, messages, clientId, schema, maxTokens, timeoutMs = 45_000 } = o
  let tier = o.tier && TIERS[o.tier] ? o.tier : 'reason'

  // Per-tenant monthly cost cap, enforced against the persisted ledger (survives cold starts /
  // spans instances). Over the hard cap → refuse. Over the soft threshold → downgrade to a cheaper
  // tier so the client stays under budget instead of being cut off mid-month.
  // The tenant's PLAN is resolved server-side first: free tenants are forced to the bulk (Haiku)
  // tier and their capTokens override is rejected — tier/cap are never trusted from the caller.
  if (clientId) {
    const plan = await resolvePlan(clientId)
    const policy = policyFor(plan, { tier: o.tier, capTokens: o.capTokens })
    tier = policy.tier
    const cap = policy.cap
    const used = await monthlyUsageFor(clientId)
    if (cap > 0 && used.total >= cap) {
      const err = new Error('gateway_client_cap_reached')
      err.clientId = clientId
      err.used = used.total
      err.cap = cap
      err.window = used.window
      throw err
    }
    // Soft downgrade band (default: last 20% of the cap). One step down the tier ladder.
    const softAt = cap > 0 ? cap * Number(process.env.SUPERMEGA_CLIENT_CAP_SOFT_RATIO || 0.8) : Infinity
    if (used.total >= softAt && FALLBACK[tier]) tier = FALLBACK[tier]
  }

  // Tenant-scoped (clientId in the key) + TTL-bounded, so tenants never share a cached response and a
  // stale entry can't live forever.
  const key = o.cacheKey || hash(JSON.stringify({ system, messages, tier, schema: schema?.title || !!schema, clientId: clientId || '', maxTokens: boundedMaxTokens(maxTokens, tier) }))
  const nowMs = Date.now()
  const fresh = (v) => v && (!v._exp || nowMs < v._exp)
  const unwrap = (v) => { const { _exp, ...out } = v; return { ...out, cached: true } }
  const memHit = cache.get(key)
  if (fresh(memHit)) return unwrap(memHit)
  if (memHit) cache.delete(key) // expired
  // Shared cache: a hit on another instance still saves the spend.
  const store = await spine()
  if (store?.getCachedResponse) {
    try {
      const hit = await store.getCachedResponse(key)
      if (fresh(hit)) { cache.set(key, hit); return unwrap(hit) }
    } catch { /* cache is best-effort; fall through to a live call */ }
  }

  // Structured output is done via forced tool-use, NOT JSON-from-text.
  // (JSON-in-text breaks on raw newlines in Burmese — a real Deal Desk bug.)
  const tool = schema
    ? { name: 'emit', description: 'Return the result in this exact shape.', input_schema: schema }
    : null

  const startTier = tier
  const providers = providerChain()
  if (!providers.length) throw new Error('gateway_missing_api_key')

  // Try each provider in turn (Anthropic, then OpenRouter failover). Within a provider, retry with
  // exponential backoff + jitter on transient errors and drop a tier on a later attempt. When a
  // provider is exhausted (or its auth is broken), fall over to the next provider in the chain.
  let lastErr
  for (const provider of providers) {
    let curTier = startTier
    for (let attempt = 0; attempt < 4; attempt++) {
      const tierDef = TIERS[curTier]
      const attemptMaxTokens = boundedMaxTokens(maxTokens, curTier)
      const reservation = await reserveProviderBudget({
        system,
        messages,
        schema,
        tier: curTier,
        maxTokens: attemptMaxTokens,
        clientId,
        provider: provider.name,
      })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const r = await provider.call({ tierDef, system, messages, tool, maxTokens: attemptMaxTokens }, controller.signal)
        clearTimeout(timer)
        await settleProviderBudget(reservation, 'consumed', weightedUsageUnits(r.usage, curTier))
        await recordUsage(clientId, r.usage, curTier)
        const out = tool
          ? { data: r.data, usage: r.usage, model: r.model, tier: curTier, provider: provider.name }
          : { text: r.text, usage: r.usage, model: r.model, tier: curTier, provider: provider.name }
        const cached = { ...out, _exp: Date.now() + CACHE_TTL_MS }
        cache.set(key, cached)
        if (store?.putCachedResponse) { try { await store.putCachedResponse(key, cached) } catch { /* best-effort */ } }
        return out
      } catch (err) {
        clearTimeout(timer)
        await settleProviderBudget(reservation, 'failed', reservation.reservedUnits)
        lastErr = err
        if (err.noKey) break // provider unusable → next provider
        if (err.status === 401 || err.status === 403) break // this provider's auth is broken → next provider
        // Other 4xx (bad request) is a request problem — failing over won't help.
        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) throw err
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
