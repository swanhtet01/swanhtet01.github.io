// Connector: ai — OpenRouter.
// lets an agent reach many model providers through one connector — useful for cost/availability fallback.
// One key unlocks hundreds of models (OpenAI, Anthropic, Google, Meta, Mistral, …) behind one
// OpenAI-compatible API. For Myanmar SMBs this means a single billing relationship and a built-in
// failover lane: if one provider is down or pricey, route the same request to another model.
//
// category 'ai' · configured = OPENROUTER_API_KEY present.
//
// Env:
//   OPENROUTER_API_KEY  (required)  from openrouter.ai/keys
//   OPENROUTER_MODEL    (optional)  default 'anthropic/claude-3.5-sonnet'
//
// Capabilities:
//   complete(opts)  -> { ok, text, raw }
//   health()        -> { ok, detail }

import { register } from './registry.mjs'

const BASE = 'https://openrouter.ai/api/v1'
const apiKey = () => String(process.env.OPENROUTER_API_KEY || '').trim()
const defaultModel = () => String(process.env.OPENROUTER_MODEL || '').trim() || 'anthropic/claude-3.5-sonnet'
const configured = () => Boolean(apiKey())

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  }
}

/**
 * complete — send a messages array to any OpenRouter-routed model (OpenAI-compatible).
 * @param {object} [opts]
 * @param {string}  [opts.model]      default OPENROUTER_MODEL or 'anthropic/claude-3.5-sonnet'
 * @param {Array<{role:string,content:string}>} [opts.messages]  conversation turns
 * @param {number}  [opts.maxTokens]  default 1024
 * @param {number}  [opts.timeout]    ms, default 20000
 * @returns {Promise<{ ok:boolean, text:string, raw:object, reason?:string }>}
 */
export async function complete({ model = defaultModel(), messages, maxTokens = 1024, timeout = 20000 } = {}) {
  if (!configured()) return { ok: false, reason: 'openrouter_not_configured' }
  if (!Array.isArray(messages) || !messages.length) return { ok: false, reason: 'openrouter_empty_messages' }

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
  }

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `openrouter_${res.status}: ${data?.error?.message || ''}`.slice(0, 200) }
    }
    const text = data?.choices?.[0]?.message?.content || ''
    return { ok: true, text, raw: data || {} }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'openrouter_error').slice(0, 200) }
  }
}

export const aiOpenrouter = {
  key: 'ai-openrouter',
  name: 'OpenRouter',
  category: 'ai',
  docs: 'kernel/connectors/ai-openrouter.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing OPENROUTER_API_KEY' }
    try {
      const res = await fetch(`${BASE}/key`, {
        method: 'GET',
        headers: headers(),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `openrouter_${res.status}: ${data?.error?.message || ''}`.slice(0, 200) }
      }
      const info = data?.data || {}
      const usage = info.usage
      const limit = info.limit
      const detail = `usage=${usage ?? 0} limit=${limit ?? '∞'}`.slice(0, 200)
      return { ok: true, detail }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'openrouter_error').slice(0, 200) }
    }
  },
  complete,
}

register(aiOpenrouter)
export default aiOpenrouter
