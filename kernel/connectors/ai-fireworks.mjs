// Connector: ai — Fireworks AI. Run fast, low-cost open-model inference (Llama, Mixtral, etc.) via
// the Fireworks serverless OpenAI-compatible chat API (zero-dependency, fetch-based). Gives the
// kernel — and Myanmar SMBs running DeskPOS / the demo funnel — an AI text backbone that is an
// alternative to the primary Vertex/Anthropic providers, so a single-provider spend cap or a
// geo-block doesn't take the whole AI surface offline.
//
// category 'ai' · configured = FIREWORKS_API_KEY present.
//
// Quick setup:
//   1. In Fireworks (https://fireworks.ai): Account → API Keys → create a key.
//   2. Set it as FIREWORKS_API_KEY.
//
// Env:
//   FIREWORKS_API_KEY  (required)  Fireworks API key. Sent as an HTTP Bearer token.
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + FIREWORKS_API_KEY.
//
// Capabilities:
//   chat({ model, messages, maxTokens }) — POST /inference/v1/chat/completions (OpenAI-compatible).

import { register } from './registry.mjs'

// Fixed, hardcoded API host. No user-supplied value ever selects the host — this keeps the
// connector SSRF-safe (every request targets exactly this origin).
const API_HOST = 'https://api.fireworks.ai'

const apiKey = () => String(process.env.FIREWORKS_API_KEY || '').trim()

const authHeader = () => `Bearer ${apiKey()}`

// configured — the required env var is present (non-empty). Nothing user-supplied touches the host.
const configured = () => apiKey() !== ''

/**
 * chat — run an OpenAI-compatible chat completion on Fireworks.
 *
 * POSTs to /inference/v1/chat/completions with { model, messages, max_tokens }. Returns the
 * assistant text on success. Never throws — any failure is surfaced via { ok:false, reason }.
 *
 * @param {object}   [payload]
 * @param {string}   [payload.model]      model id (default: llama-v3p3-70b-instruct).
 * @param {object[]} [payload.messages]   OpenAI-style chat messages (required).
 * @param {number}   [payload.maxTokens]  max tokens to generate (default: 1024).
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, text?:string, reason?:string }>}
 */
export async function chat(_input = {}) {
  const {
    model = 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    messages,
    maxTokens = 1024,
  } = _input || {}
  if (!configured()) return { ok: false, reason: 'ai-fireworks_not_configured' }

  const body = { model, messages, max_tokens: maxTokens }

  try {
    const res = await fetch(`${API_HOST}/inference/v1/chat/completions`, {
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
    if (!res.ok) return { ok: false, status: res.status, reason: 'ai-fireworks_' + res.status }
    return {
      ok: true,
      status: res.status,
      id: data?.id,
      text: data?.choices?.[0]?.message?.content,
    }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'ai-fireworks_error').slice(0, 200) }
  }
}

export const aiFireworks = {
  key: 'ai-fireworks',
  name: 'Fireworks AI',
  category: 'ai',
  docs: 'kernel/connectors/ai-fireworks.mjs',
  configured,
  /**
   * health — GET /inference/v1/models is a cheap authenticated liveness probe: it returns 200 with
   * the available model list when the key is valid, without running any inference.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing FIREWORKS_API_KEY' }
    try {
      const res = await fetch(`${API_HOST}/inference/v1/models`, {
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
        return { ok: false, detail: `ai-fireworks_${res.status}: ${(data?.error?.message || data?.detail || '')}`.slice(0, 160) }
      }
      return { ok: true, detail: 'models ok' }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'ai-fireworks_error').slice(0, 160) }
    }
  },
  chat,
}

register(aiFireworks)
export default aiFireworks
