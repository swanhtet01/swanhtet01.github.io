// Connector: ai — Perplexity. Call Perplexity's online research AI via its OpenAI-compatible Chat
// Completions API (zero-dependency, native fetch). Perplexity models (e.g. `sonar`) answer with
// live web grounding — so a DeskPOS / kernel workflow can ask a real-world question ("current MMK
// exchange rate", "supplier X's latest catalogue") and get an up-to-date, citation-backed answer
// instead of a stale, offline completion.
//
// category 'ai' · configured = PERPLEXITY_API_KEY present.
//
// Quick setup:
//   1. Sign in at https://www.perplexity.ai and open Settings → API.
//   2. Generate an API key (pplx-…) and add credit / a billing method.
//   3. Set it as PERPLEXITY_API_KEY. That's it — the host is fixed (https://api.perplexity.ai).
//
// Env:
//   PERPLEXITY_API_KEY  (required)  Perplexity API key, sent as a Bearer token.
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + PERPLEXITY_API_KEY.
//
// Capabilities:
//   chat({ model, messages, maxTokens }) — POST /chat/completions (OpenAI-compatible) → { ok, text, id }.

import { register } from './registry.mjs'

// Fixed, documented API host. We do NOT read the base from env — there is no per-tenant host here,
// so hardcoding removes any chance of an env-driven SSRF target.
const API_BASE = 'https://api.perplexity.ai'

const apiKey = () => String(process.env.PERPLEXITY_API_KEY || '').trim()

// configured — ONLY checks that the required env var is present. The host is a hardcoded https
// constant (never derived from a user/env value), so this stays SSRF-safe.
const configured = () => Boolean(apiKey())

const authHeader = () => `Bearer ${apiKey()}`

/**
 * chat — ask Perplexity's online research AI a question via the OpenAI-compatible endpoint.
 *
 * POSTs to /chat/completions. Returns 200 with a choices[] array on success; the assistant text is
 * choices[0].message.content. Any non-2xx or transport failure is surfaced via reason (never thrown).
 *
 * @param {object}   [payload]
 * @param {string}   [payload.model]      Perplexity model id (default 'sonar' — online research).
 * @param {Array}    [payload.messages]   OpenAI-style [{ role, content }] turns (required, non-empty).
 * @param {number}   [payload.maxTokens]  max completion tokens (default 1024).
 * @returns {Promise<{ ok:boolean, text?:string, id?:string, status?:number, reason?:string }>}
 */
export async function chat(_input = {}) {
  const { model = 'sonar', messages, maxTokens = 1024 } = _input || {}
  if (!configured()) return { ok: false, reason: 'ai-perplexity_not_configured' }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: 'ai-perplexity_missing_messages' }
  }

  const body = {
    model: String(model || 'sonar'),
    messages,
    max_tokens: Number(maxTokens) || 1024,
  }

  try {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error?.message || data?.error || data?.detail || `http_${res.status}`
      return { ok: false, status: res.status, reason: `ai-perplexity_${String(reason)}`.slice(0, 200) }
    }
    const text = data?.choices?.[0]?.message?.content ?? ''
    return { ok: true, status: res.status, text: String(text), id: data?.id }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'ai-perplexity_error').slice(0, 200) }
  }
}

export const aiPerplexity = {
  key: 'ai-perplexity',
  name: 'Perplexity',
  category: 'ai',
  docs: 'kernel/connectors/ai-perplexity.mjs',
  configured,
  /**
   * health — cheapest authenticated liveness probe: a 1-token chat completion against the default
   * model. A 200 (with a choices[] array) means the API key is valid and the account has credit.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing PERPLEXITY_API_KEY' }
    const result = await chat({
      model: 'sonar',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 1,
    })
    if (!result.ok) {
      return { ok: false, detail: `chat failed: ${result.reason}`.slice(0, 160) }
    }
    return { ok: true, detail: 'chat ok'.slice(0, 160) }
  },
  chat,
}

register(aiPerplexity)
export default aiPerplexity
