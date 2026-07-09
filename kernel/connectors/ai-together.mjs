// Connector: ai — Together AI. Run open-weight chat models (Llama, Qwen, Mixtral, etc.) via the
// Together AI OpenAI-compatible API (zero-dependency, fetch-based). Gives Myanmar SMBs a
// cost-effective open-model chat backbone for DeskPOS / demo AI apps — a drop-in alternative to a
// single-provider dependency, so a spend cap or region block on one vendor doesn't halt the AI.
//
// category 'ai' · configured = TOGETHER_API_KEY present (non-empty).
//
// Quick setup:
//   1. In Together AI: Settings → API Keys → create a key.
//   2. Set it as TOGETHER_API_KEY.
//   3. (Per call) pass a model id to chat() — defaults to meta-llama/Llama-3.3-70B-Instruct-Turbo.
//
// Env:
//   TOGETHER_API_KEY  (required)  Together AI API key. Sent as an HTTP Bearer token.
//
// Auth: Bearer. Authorization: 'Bearer ' + TOGETHER_API_KEY.
//
// Host is a FIXED hardcoded constant (https://api.together.xyz) — no user value ever selects the
// host, so this connector can't be turned into an SSRF primitive.
//
// Capabilities:
//   chat({ model, messages, maxTokens }) — POST /v1/chat/completions (OpenAI-compatible completion).

import { register } from './registry.mjs'

// Fixed, hardcoded API host. NEVER derived from any user-supplied value (SSRF-safe).
const API_HOST = 'https://api.together.xyz'

const apiKey = () => String(process.env.TOGETHER_API_KEY || '').trim()

const authHeader = () => `Bearer ${apiKey()}`

// configured — required env var present (non-empty). No fetch, no network.
const configured = () => apiKey().length > 0

/**
 * chat — run an OpenAI-compatible chat completion on Together AI.
 *
 * POSTs to /v1/chat/completions with { model, messages, max_tokens }. Never throws: any HTTP or
 * network/parse error is surfaced as { ok:false, reason:'ai-together_<why>' }.
 *
 * @param {object}   [payload]
 * @param {string}   [payload.model]     model id (default meta-llama/Llama-3.3-70B-Instruct-Turbo).
 * @param {Array}    [payload.messages]  OpenAI-style [{ role, content }, …] message list (required).
 * @param {number}   [payload.maxTokens] max tokens to generate (default 1024).
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, text?:string, reason?:string }>}
 */
export async function chat(_input = {}) {
  const {
    model = 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    messages,
    maxTokens = 1024,
  } = _input || {}
  if (!configured()) return { ok: false, reason: 'ai-together_not_configured' }

  const body = { model, messages, max_tokens: maxTokens }

  try {
    const res = await fetch(`${API_HOST}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `ai-together_${res.status}` }
    }
    return {
      ok: true,
      status: res.status,
      id: data?.id,
      text: data?.choices?.[0]?.message?.content,
    }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'ai-together_error').slice(0, 200) }
  }
}

export const aiTogether = {
  key: 'ai-together',
  name: 'Together AI',
  category: 'ai',
  docs: 'kernel/connectors/ai-together.mjs',
  configured,
  /**
   * health — GET /v1/models is Together's cheap authenticated liveness probe. It returns 200 with
   * the model catalog when the key is valid, without running any inference.
   *
   * @returns {Promise<{ ok:boolean, detail?:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing TOGETHER_API_KEY' }
    try {
      const res = await fetch(`${API_HOST}/v1/models`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          accept: 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `ai-together_${res.status}: ${(data?.error?.message || data?.message || '')}`.slice(0, 160) }
      }
      return { ok: true, detail: 'models ok' }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'ai-together_error').slice(0, 160) }
    }
  },
  chat,
}

register(aiTogether)
export default aiTogether
