// SUPERMEGA AI gateway — one interface in front of every model call.
// Zero-dependency (native fetch). Reads ANTHROPIC_API_KEY from env. See ../PLATFORM.md.
//
// Why this exists: swapping a model, adding caching, or capping a client's spend should touch
// ONE file, not every caller. Every build agent, the Deal Desk, and the per-client operator
// call complete() — never the Anthropic SDK directly.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

// Model tiers — change the model here, every caller follows. Claude primary.
export const TIERS = {
  bulk: { model: 'claude-haiku-4-5-20251001', maxTokens: 1024 }, // classification, extraction, cheap volume
  reason: { model: 'claude-sonnet-4-6', maxTokens: 4096 }, // scoping, drafting — most work
  deep: { model: 'claude-opus-4-8', maxTokens: 8192 }, // hard build reasoning
}
const FALLBACK = { deep: 'reason', reason: 'bulk', bulk: null }

// Per-client token ledger + response cache are in-memory per warm instance for now.
// TODO(spine): back both with Supabase/KV so caps + caching survive across instances.
const ledger = new Map() // clientId -> { inTokens, outTokens, calls }
const cache = new Map() // cacheKey -> { text, data, usage }
const DEFAULT_CAP_TOKENS = Number(process.env.SUPERMEGA_CLIENT_TOKEN_CAP || 2_000_000)

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

function recordUsage(clientId, usage) {
  if (!clientId || !usage) return
  const e = ledger.get(clientId) || { inTokens: 0, outTokens: 0, calls: 0 }
  e.inTokens += usage.input_tokens || 0
  e.outTokens += usage.output_tokens || 0
  e.calls += 1
  ledger.set(clientId, e)
}

export function usageFor(clientId) {
  return ledger.get(clientId) || { inTokens: 0, outTokens: 0, calls: 0 }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function callAnthropic(body, signal) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  if (!key) throw new Error('gateway_missing_api_key')
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const err = new Error(`anthropic_${res.status}`)
    err.status = res.status
    err.detail = detail
    throw err
  }
  return res.json()
}

/**
 * complete — the one call every SuperMega component makes.
 * @param {object}   o
 * @param {string}   o.system            system prompt
 * @param {Array}    o.messages          [{role, content}]
 * @param {string}   [o.tier='reason']   'bulk' | 'reason' | 'deep'
 * @param {string}   [o.clientId]        for per-client cost caps + logging
 * @param {object}   [o.schema]          JSON Schema -> forces validated structured output (tool-use)
 * @param {string}   [o.cacheKey]        explicit cache key; else derived from the request
 * @param {number}   [o.maxTokens]       override the tier default
 * @param {number}   [o.timeoutMs=45000]
 * @returns {Promise<{text?:string, data?:object, usage:object, model:string, tier:string}>}
 */
export async function complete(o) {
  const { system, messages, clientId, schema, maxTokens, timeoutMs = 45_000 } = o
  let tier = o.tier && TIERS[o.tier] ? o.tier : 'reason'

  // Cost cap (best-effort, per warm instance until the spine backs it).
  if (clientId) {
    const used = usageFor(clientId)
    if (used.inTokens + used.outTokens >= DEFAULT_CAP_TOKENS) {
      const err = new Error('gateway_client_cap_reached')
      err.clientId = clientId
      throw err
    }
  }

  const key = o.cacheKey || hash(JSON.stringify({ system, messages, tier, schema: schema?.title || !!schema }))
  if (cache.has(key)) return { ...cache.get(key), cached: true }

  // Structured output is done via forced tool-use, NOT JSON-from-text.
  // (JSON-in-text breaks on raw newlines in Burmese — a real Deal Desk bug.)
  const tool = schema
    ? { name: 'emit', description: 'Return the result in this exact shape.', input_schema: schema }
    : null

  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    const t = TIERS[tier]
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const body = {
        model: t.model,
        max_tokens: maxTokens || t.maxTokens,
        system,
        messages,
        ...(tool ? { tools: [tool], tool_choice: { type: 'tool', name: 'emit' } } : {}),
      }
      const json = await callAnthropic(body, controller.signal)
      clearTimeout(timer)
      recordUsage(clientId, json.usage)
      let out
      if (tool) {
        const block = (json.content || []).find((b) => b.type === 'tool_use' && b.name === 'emit')
        if (!block) throw new Error('gateway_no_tool_output')
        out = { data: block.input, usage: json.usage, model: t.model, tier }
      } else {
        const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
        out = { text, usage: json.usage, model: t.model, tier }
      }
      cache.set(key, out)
      return out
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      // Overloaded / rate-limited / timeout -> back off, then drop a tier on a later try.
      const retriable = err.status === 429 || err.status === 503 || err.status === 529 || err.name === 'AbortError'
      if (!retriable && err.status && err.status < 500) break
      await sleep(400 * (attempt + 1) ** 2)
      if (attempt === 2 && FALLBACK[tier]) tier = FALLBACK[tier]
    }
  }
  throw lastErr || new Error('gateway_failed')
}

export default { complete, stripInjectionFrames, usageFor, TIERS }
