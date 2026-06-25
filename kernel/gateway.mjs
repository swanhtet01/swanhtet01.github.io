// SUPERMEGA AI gateway — one interface in front of every model call.
// Zero-dependency (native fetch). Reads ANTHROPIC_API_KEY from env. See ../PLATFORM.md.
//
// Why this exists: swapping a model, adding caching, or capping a client's spend should touch
// ONE file, not every caller. Every build agent, the Deal Desk, and the per-client operator
// call complete() — never the Anthropic SDK directly.

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
const DEFAULT_CAP_TOKENS = Number(process.env.SUPERMEGA_CLIENT_TOKEN_CAP || 2_000_000)

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
    .replace(/<\/?(system|assistant|human|user)>/gi, ' ')
    .replace(/\b(system|assistant)\s*:/gi, '$1 -')
    .replace(/\s{3,}/g, '  ')
    .trim()
}

async function recordUsage(clientId, usage) {
  if (!clientId || !usage) return
  const inTokens = usage.input_tokens || 0
  const outTokens = usage.output_tokens || 0
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
 * @param {string}   [o.tier='reason']   'bulk' | 'reason' | 'deep'
 * @param {string}   [o.clientId]        tenant id — enables the per-tenant monthly cost cap + logging
 * @param {object}   [o.schema]          JSON Schema -> forces validated structured output (tool-use)
 * @param {string}   [o.cacheKey]        explicit cache key; else derived from the request
 * @param {number}   [o.maxTokens]       override the tier default
 * @param {number}   [o.capTokens]       override the monthly token cap for THIS tenant (else DEFAULT_CAP_TOKENS)
 * @param {number}   [o.timeoutMs=45000]
 * @returns {Promise<{text?:string, data?:object, usage:object, model:string, tier:string}>}
 */
export async function complete(o) {
  const { system, messages, clientId, schema, maxTokens, timeoutMs = 45_000 } = o
  let tier = o.tier && TIERS[o.tier] ? o.tier : 'reason'

  // Per-tenant monthly cost cap, enforced against the persisted ledger (survives cold starts /
  // spans instances). Over the hard cap → refuse. Over the soft threshold → downgrade to a cheaper
  // tier so the client stays under budget instead of being cut off mid-month.
  if (clientId) {
    const cap = Number(o.capTokens || DEFAULT_CAP_TOKENS)
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
  const key = o.cacheKey || hash(JSON.stringify({ system, messages, tier, schema: schema?.title || !!schema, clientId: clientId || '' }))
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
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const r = await provider.call({ tierDef, system, messages, tool, maxTokens }, controller.signal)
        clearTimeout(timer)
        await recordUsage(clientId, r.usage)
        const out = tool
          ? { data: r.data, usage: r.usage, model: r.model, tier: curTier, provider: provider.name }
          : { text: r.text, usage: r.usage, model: r.model, tier: curTier, provider: provider.name }
        const cached = { ...out, _exp: Date.now() + CACHE_TTL_MS }
        cache.set(key, cached)
        if (store?.putCachedResponse) { try { await store.putCachedResponse(key, cached) } catch { /* best-effort */ } }
        return out
      } catch (err) {
        clearTimeout(timer)
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

export default { complete, stripInjectionFrames, usageFor, monthlyUsageFor, providerChain, TIERS }
