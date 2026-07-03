// Connector: ai — DeepSeek (cheap, capable, OpenAI-compatible LLM).
// Lets workflows call DeepSeek's chat models as a low-cost alternative to Claude/GPT — ideal for
// bulk classification, extraction, drafting, and other high-volume tasks where DeepSeek's pricing
// makes per-call cost matter. The API is OpenAI-compatible, so it's the same messages shape as the
// OpenAI/OpenRouter connectors here.
//
// category 'ai' · configured = DEEPSEEK_API_KEY present.
//
// Quick setup:
//   1. Create an API key at platform.deepseek.com/api_keys.
//   2. Set it as DEEPSEEK_API_KEY (optionally override the host with DEEPSEEK_BASE_URL).
//
// Env:
//   DEEPSEEK_API_KEY   (required)  from platform.deepseek.com/api_keys
//   DEEPSEEK_BASE_URL  (optional)  override base URL; must resolve to api.deepseek.com (SSRF-safe)
//
// Capabilities:
//   complete({ system, prompt, model, max_tokens }) -> { ok, text, usage, model } | { ok:false, reason }
//   health()                                        -> { ok, detail }

import { register } from './registry.mjs'

const DEFAULT_BASE = 'https://api.deepseek.com'
const apiKey = () => String(process.env.DEEPSEEK_API_KEY || '').trim()

// baseUrl — DEFAULT_BASE unless DEEPSEEK_BASE_URL is set. We validate the host with new URL()
// (not just "starts with https://") so a misconfigured/hostile DEEPSEEK_BASE_URL can't turn
// complete()/health() into an SSRF primitive that hits an arbitrary internal host. Only the real
// DeepSeek API host is allowed; anything else falls back to the safe default.
function baseUrl() {
  const raw = String(process.env.DEEPSEEK_BASE_URL || '').trim()
  if (!raw) return DEFAULT_BASE
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return DEFAULT_BASE
    const host = u.hostname.toLowerCase()
    if (host !== 'api.deepseek.com') return DEFAULT_BASE
    return `${u.protocol}//${u.host}`
  } catch {
    return DEFAULT_BASE
  }
}

const configured = () => Boolean(apiKey())

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  }
}

/**
 * complete — send a single-turn prompt (with optional system prompt) to a DeepSeek chat model.
 * Uses the OpenAI-compatible /chat/completions endpoint under the hood.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.system]      optional system prompt, prepended as a system message
 * @param {string}  [opts.prompt]      the user prompt (required)
 * @param {string}  [opts.model]       default 'deepseek-chat'
 * @param {number}  [opts.max_tokens]  default 700
 * @param {number}  [opts.timeout]     ms, default 20000
 * @returns {Promise<{ ok:boolean, text:string, usage:object, model:string, reason?:string }>}
 */
export async function complete(_input = {}) {
  const { system, prompt, model = 'deepseek-chat', max_tokens = 700, timeout = 20000 } = _input || {}
  if (!configured()) return { ok: false, reason: 'deepseek_not_configured' }
  const userPrompt = String(prompt || '').trim()
  if (!userPrompt) return { ok: false, reason: 'deepseek_empty_prompt' }

  const messages = []
  if (system) messages.push({ role: 'system', content: String(system) })
  messages.push({ role: 'user', content: userPrompt })

  const body = {
    model,
    messages,
    max_tokens,
  }

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `deepseek_${res.status}: ${data?.error?.message || ''}`.slice(0, 200) }
    }
    const text = data?.choices?.[0]?.message?.content || ''
    return { ok: true, text, usage: data?.usage || {}, model: data?.model || model }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'deepseek_error').slice(0, 200) }
  }
}

export const aiDeepseek = {
  key: 'ai-deepseek',
  name: 'DeepSeek',
  category: 'ai',
  docs: 'kernel/connectors/ai-deepseek.mjs',
  configured,
  /**
   * health — a cheap authenticated liveness probe. GET /models returns 200 with the list of
   * available model ids for the key, without spending completion tokens.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing DEEPSEEK_API_KEY' }
    try {
      const res = await fetch(`${baseUrl()}/models`, {
        method: 'GET',
        headers: headers(),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `deepseek_${res.status}: ${data?.error?.message || ''}`.slice(0, 160) }
      }
      const first = Array.isArray(data?.data) ? data.data[0]?.id : null
      return { ok: true, detail: `model=${first || 'deepseek-chat'}`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'deepseek_error').slice(0, 160) }
    }
  },
  complete,
}

register(aiDeepseek)
export default aiDeepseek
