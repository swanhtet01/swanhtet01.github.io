// Connector: ai — Mistral. Run text completions/chat against Mistral AI, the European (EU-hosted)
// LLM provider, via its OpenAI-style Chat Completions API (zero-dependency, fetch-based). Gives
// SUPERMEGA an EU-data-residency LLM lane for tasks where an American provider is a non-starter —
// classify a Viber order, summarize an inbox thread, draft a reply — without hosting anything.
//
// category 'ai' · configured = MISTRAL_API_KEY present.
//
// Quick setup:
//   1. Sign in at https://console.mistral.ai → "API Keys".
//   2. Create a key (starts with a random token — la Plateforme keys have no fixed prefix).
//   3. Set it as MISTRAL_API_KEY.
//
// Env:
//   MISTRAL_API_KEY  (required)  la Plateforme API key, sent as `Authorization: Bearer <key>`.
//
// Capabilities:
//   complete({ system, prompt, model, max_tokens }) — one-shot chat completion, returns the text.
//
// API: https://docs.mistral.ai/api/  — base https://api.mistral.ai, OpenAI-compatible.

import { register } from './registry.mjs'

// Fixed API host — this connector only ever talks to Mistral's documented endpoint. We do NOT read
// the base URL from env; keeping it a constant means there is no user-controlled URL that could be
// pointed at an internal host (no SSRF surface), and we still validate it through new URL() below.
const API_BASE = 'https://api.mistral.ai'
const API_HOST = 'api.mistral.ai'

const apiKey = () => String(process.env.MISTRAL_API_KEY || '').trim()

// configured — the key must be present AND our fixed base URL must resolve to the real Mistral host.
// The new URL() host check mirrors the reference connector: we assert the host explicitly (not just
// "starts with https://") so the fetch target can never be anything but api.mistral.ai.
const configured = () => {
  try {
    if (!apiKey()) return false
    const u = new URL(API_BASE)
    if (u.protocol !== 'https:') return false
    return u.hostname.toLowerCase() === API_HOST
  } catch {
    return false
  }
}

/**
 * complete — a single chat completion against Mistral's OpenAI-style /v1/chat/completions.
 *
 * Builds a two-message conversation (optional system + user prompt) and returns the assistant's
 * text. Never throws: every failure path returns { ok:false, reason }.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.system]              optional system instruction prepended to the chat.
 * @param {string}  [opts.prompt]              the user message (required — empty => not_configured-style error).
 * @param {string}  [opts.model='mistral-small-latest']  Mistral model id.
 * @param {number}  [opts.max_tokens=700]      cap on generated tokens.
 * @returns {Promise<{ ok:true, text:string, model?:string, usage?:object } | { ok:false, reason:string }>}
 */
export async function complete(_input = {}) {
  const { system, prompt, model = 'mistral-small-latest', max_tokens = 700 } = _input || {}
  if (!configured()) return { ok: false, reason: 'mistral_not_configured' }
  const user = String(prompt || '').trim()
  if (!user) return { ok: false, reason: 'mistral_empty_prompt' }

  const messages = []
  const sys = String(system || '').trim()
  if (sys) messages.push({ role: 'system', content: sys })
  messages.push({ role: 'user', content: user })

  const body = {
    model: String(model || 'mistral-small-latest'),
    messages,
    max_tokens: Number.isFinite(max_tokens) ? max_tokens : 700,
  }

  try {
    const res = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${apiKey()}`,
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || (data && JSON.stringify(data)) || ''
      return { ok: false, reason: `mistral_${res.status}: ${String(msg).slice(0, 200)}` }
    }
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') return { ok: false, reason: 'mistral_no_completion' }
    return { ok: true, text, model: data?.model, usage: data?.usage }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'mistral_error').slice(0, 200) }
  }
}

export const aiMistral = {
  key: 'ai-mistral',
  name: 'Mistral',
  category: 'ai',
  docs: 'kernel/connectors/ai-mistral.mjs',
  configured,
  /**
   * health — GET /v1/models is a cheap authenticated liveness probe: it lists the models the key
   * can access without spending any generation tokens. 200 => the key is valid and the API is up.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing MISTRAL_API_KEY' }
    try {
      const res = await fetch(`${API_BASE}/v1/models`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiKey()}`,
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || ''
        return { ok: false, detail: `mistral_${res.status}: ${String(msg)}`.slice(0, 160) }
      }
      const count = Array.isArray(data?.data) ? data.data.length : 0
      return { ok: true, detail: `models=${count}`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'mistral_error').slice(0, 160) }
    }
  },
  complete,
}

register(aiMistral)
export default aiMistral
