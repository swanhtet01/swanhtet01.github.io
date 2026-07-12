// Connector: ai — Cohere. Call Cohere's Command family of chat models via the v2 Chat API
// (zero-dependency, fetch-based). Cohere's Command models are strongly multilingual, which makes
// them a practical option for Myanmar SMBs that need to move between Burmese and English — drafting
// customer replies, summarizing mixed-language chat logs, or translating a note — from inside the
// SuperMega kernel without adding another SDK or paying for a heavier model.
//
// category 'ai' · FIXED host (https://api.cohere.com) · configured = COHERE_API_KEY present.
//
// Quick setup:
//   1. Sign up at https://dashboard.cohere.com and open the "API Keys" page.
//   2. Create a key (trial or production). Copy it.
//   3. Set it as COHERE_API_KEY. That's all — the API base is a hardcoded https constant, so no
//      user value ever chooses the host.
//   4. (Per call) pass a model + messages to chat(); defaults to 'command-r-plus'.
//
// Env:
//   COHERE_API_KEY  (required)  Cohere API key from the dashboard.
//
// Auth: Bearer token. Authorization: 'Bearer ' + COHERE_API_KEY.
//
// Capabilities:
//   chat({ model, messages, maxTokens }) — POST /v2/chat (get a chat completion from a Command model).

import { register } from './registry.mjs'

// Fixed, hardcoded API base. Because this is a constant (never built from a user/env value) the
// service host can't be steered anywhere else, so configured() only has to check env presence.
const API_BASE = 'https://api.cohere.com'

const apiKey = () => String(process.env.COHERE_API_KEY || '').trim()

const authHeader = () => `Bearer ${apiKey()}`

// configured — key present. The host is a hardcoded https constant (API_BASE), so there's no
// user-derived host to validate; we simply require the credential to be set.
const configured = () => apiKey().length > 0

/**
 * chat — get a chat completion from a Cohere Command model via the v2 Chat API.
 *
 * POSTs to /v2/chat with { model, messages, max_tokens }. Cohere returns 200 with a message whose
 * content is an array of blocks; we surface the first text block's text.
 *
 * @param {object}   [payload]
 * @param {string}   [payload.model]      Command model id (default 'command-r-plus').
 * @param {Array}    [payload.messages]   chat messages [{ role, content }, …] (required, non-empty).
 * @param {number}   [payload.maxTokens]  max output tokens (default 1024).
 * @returns {Promise<{ ok:boolean, status?:number, id?:string, text?:string, reason?:string }>}
 */
export async function chat(payload = {}) {
  const { model = 'command-r-plus', messages, maxTokens = 1024 } = payload || {}
  if (!configured()) return { ok: false, reason: 'ai-cohere_not_configured' }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: 'ai-cohere_missing_messages' }
  }

  const body = {
    model: String(model || 'command-r-plus'),
    messages,
    max_tokens: Number(maxTokens) || 1024,
  }

  try {
    const res = await fetch(`${API_BASE}/v2/chat`, {
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
      const reason = data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `ai-cohere_${String(reason)}`.slice(0, 200) }
    }
    return { ok: true, status: res.status, id: data?.id, text: (data?.message?.content?.[0]?.text) || '' }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'ai-cohere_error').slice(0, 200) }
  }
}

export const aiCohere = {
  key: 'ai-cohere',
  name: 'Cohere',
  category: 'ai',
  docs: 'kernel/connectors/ai-cohere.mjs',
  configured,
  /**
   * health — GET /v1/models is a cheap authenticated liveness probe: it returns 200 with the list
   * of models the key can access when the credential is valid, without spending generation tokens.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing COHERE_API_KEY' }
    try {
      const res = await fetch(`${API_BASE}/v1/models`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `ai-cohere_${res.status}: ${(data?.error || data?.message || '')}`.slice(0, 160) }
      }
      const count = Array.isArray(data?.models) ? data.models.length : 0
      return { ok: true, detail: `models ok (${count})`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'ai-cohere_error').slice(0, 160) }
    }
  },
  chat,
}

register(aiCohere)
export default aiCohere
