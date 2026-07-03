// Connector: ai — Groq. Ultra-fast LLM inference over Groq's OpenAI-compatible Chat Completions
// API (zero-dependency, fetch-based). Groq runs open models (Llama, etc.) on its LPU hardware, so
// token generation is fast enough for real-time agent replies. Lets a Myanmar SMB power live chat
// answers, order-taking, and support triage inside DeskPOS / the agent suite without the latency of
// a slower provider — the customer sees a reply arrive in near real time instead of waiting.
//
// category 'ai' · configured = GROQ_API_KEY present. The API host is a FIXED hardcoded https
// constant (api.groq.com), so no user/derived value ever chooses the host — configured() only
// checks that the key is set.
//
// Quick setup:
//   1. Create a Groq account at https://console.groq.com.
//   2. Go to API Keys → "Create API Key", copy it (it starts with "gsk_...").
//   3. Set it as GROQ_API_KEY in the environment (Vercel project settings).
//   4. (Per call) pass `messages` (OpenAI chat format) and optionally `model` / `maxTokens`.
//
// Env:
//   GROQ_API_KEY  (required)  Groq API key ("gsk_..."). Sent as a Bearer token.
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + GROQ_API_KEY.
//
// Capabilities:
//   complete({ model, messages, maxTokens }) — POST /chat/completions (one chat completion).

import { register } from './registry.mjs'

// Fixed, hardcoded https base — never derived from any user/env value, so it can't be an SSRF vector.
const API_BASE = 'https://api.groq.com/openai/v1'

const apiKey = () => String(process.env.GROQ_API_KEY || '').trim()

const authHeader = () => `Bearer ${apiKey()}`

// configured — Groq is a fixed-host service, so we only need the key to be present. The base URL is
// the hardcoded API_BASE constant above; no user value ever selects the host.
const configured = () => Boolean(apiKey())

/**
 * complete — request one chat completion from Groq (OpenAI-compatible /chat/completions).
 *
 * POSTs { model, messages, max_tokens }. On success Groq returns 200 with a `choices` array; we
 * surface the first choice's text and the completion id. Never throws — errors come back via reason.
 *
 * @param {object}   [payload]
 * @param {string}   [payload.model]      model id (default 'llama-3.3-70b-versatile').
 * @param {Array}    [payload.messages]   OpenAI chat messages: [{ role, content }, ...] (required).
 * @param {number}   [payload.maxTokens]  max tokens to generate (default 1024, mapped to max_tokens).
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, text?:string, reason?:string }>}
 */
export async function complete({ model = 'llama-3.3-70b-versatile', messages, maxTokens = 1024 } = {}) {
  if (!configured()) return { ok: false, reason: 'ai-groq_not_configured' }
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, reason: 'ai-groq_missing_messages' }

  const body = {
    model: String(model || 'llama-3.3-70b-versatile'),
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
      const reason = data?.error?.message || data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `ai-groq_${String(reason)}`.slice(0, 200) }
    }
    return {
      ok: true,
      status: res.status,
      text: data?.choices?.[0]?.message?.content,
      id: data?.id,
    }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'ai-groq_error').slice(0, 200) }
  }
}

export const aiGroq = {
  key: 'ai-groq',
  name: 'Groq',
  category: 'ai',
  docs: 'kernel/connectors/ai-groq.mjs',
  configured,
  /**
   * health — GET /models is Groq's cheap authenticated liveness probe. It returns 200 with the list
   * of available models when the key is valid, without spending any inference tokens.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GROQ_API_KEY' }
    try {
      const res = await fetch(`${API_BASE}/models`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const reason = data?.error?.message || data?.error || data?.message || ''
        return { ok: false, detail: `ai-groq_${res.status}: ${reason}`.slice(0, 160) }
      }
      const count = Array.isArray(data?.data) ? data.data.length : 0
      return { ok: true, detail: `${count} models available`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'ai-groq_error').slice(0, 160) }
    }
  },
  complete,
}

register(aiGroq)
export default aiGroq
